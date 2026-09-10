#!/usr/bin/env node
/**
 * pack-mcpb.mjs — empacota o launcher num `.mcpb`.
 *
 * O `.mcpb` e um zip. Escrito a mao, como o `packages/mooter-bridge/pack-mcpb.mjs`
 * ja fazia: guardado sem compressao (metodo 0), que toda a gente descompacta, e com
 * timestamp FIXO — o mesmo conteudo tem de dar o mesmo sha256, senao a assinatura
 * de release nao vale nada como identidade (dois builds do mesmo commit
 * produziriam dois hashes e ninguem saberia qual e o "certo").
 *
 * O QUE ENTRA E O QUE NAO ENTRA. So o launcher. Nem testes, nem `package.json`,
 * nem nada que nao seja preciso para arrancar — e ha uma verificacao explicita
 * de que nao entra ficheiro nenhum a mais, porque um bundle que cresce e um
 * bundle onde alguem poe logica de produto.
 *
 * Uso: node pack-mcpb.mjs [--out <caminho>]
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/** Os UNICOS ficheiros do bundle. A lista e a especificacao. */
export const FICHEIROS = [
  ['manifest.json', 'manifest.json'],
  ['index.js', 'index.js'],
];

function crc32(buf) {
  const tabela = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    tabela[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = tabela[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

/** Constroi o zip em memoria. Puro: mesma entrada, mesmos bytes. */
export function empacotar(raiz = AQUI, ficheiros = FICHEIROS) {
  const locais = [];
  const centrais = [];
  let offset = 0;

  for (const [origem, destino] of ficheiros) {
    const p = path.join(raiz, origem);
    if (!fs.existsSync(p)) throw new Error('FALTA no bundle: ' + origem);
    const dados = fs.readFileSync(p);
    const nome = Buffer.from(destino, 'utf8');
    const crc = crc32(dados);

    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 8); // stored
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x2821, 12); // data fixa = build reproduzivel
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(dados.length, 18);
    lh.writeUInt32LE(dados.length, 22);
    lh.writeUInt16LE(nome.length, 26);
    locais.push(lh, nome, dados);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x2821, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(dados.length, 20);
    ch.writeUInt32LE(dados.length, 24);
    ch.writeUInt16LE(nome.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrais.push(ch, nome);

    offset += lh.length + nome.length + dados.length;
  }

  const central = Buffer.concat(centrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(ficheiros.length, 8);
  eocd.writeUInt16LE(ficheiros.length, 10);
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(offset, 16);

  return Buffer.concat([...locais, central, eocd]);
}

/**
 * Recusa empacotar um launcher que deixou de ser um launcher.
 * Uma lista de ficheiros nao chega: o que se guarda e o TAMANHO e a ausencia
 * de dependencias, que sao as duas coisas que mudam quando logica de produto
 * se infiltra.
 */
export function verificar(raiz = AQUI) {
  const problemas = [];
  const src = fs.readFileSync(path.join(raiz, 'index.js'), 'utf8');
  const linhas = src.replace(/\n+$/, '').split('\n').length;
  if (linhas > 200) problemas.push(`index.js tem ${linhas} linhas (tecto 200)`);
  for (const m of src.matchAll(/require\('([^']+)'\)/g)) {
    if (!['fs', 'os', 'path', 'child_process'].includes(m[1])) {
      problemas.push(`dependencia nao-builtin: ${m[1]} — o bundle corre sem npm install`);
    }
  }
  const man = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
  if ('default' in (man.user_config?.mooter_token || {})) {
    problemas.push('o manifesto pre-preenche o token — ADR-onboarding-v2 D3.1 proibe-o');
  }
  if (!man.compatibility?.runtimes?.node) problemas.push('manifesto sem piso de Node');
  return problemas;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--out');
  const man = JSON.parse(fs.readFileSync(path.join(AQUI, 'manifest.json'), 'utf8'));
  const out = i > 0 ? process.argv[i + 1] : path.join(AQUI, '..', '..', '_handoff', `mooter-launcher-v${man.version}.mcpb`);

  const problemas = verificar();
  if (problemas.length) {
    console.error('RECUSADO — isto ja nao e um launcher:');
    for (const p of problemas) console.error('  ' + p);
    process.exit(1);
  }

  const zip = empacotar();
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, zip);
  console.log(`mooter-launcher ${man.version}  ->  ${out}`);
  console.log(`  ${FICHEIROS.length} ficheiros, ${zip.length} bytes`);
  console.log(`  sha256 ${crypto.createHash('sha256').update(zip).digest('hex')}`);
}
