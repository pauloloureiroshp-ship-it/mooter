#!/usr/bin/env node
// indexnow-ping.mjs — avisa o IndexNow de que as URLs do mooter.ai mudaram.
//
// ⚠️  NÃO RODA AGORA. Este script existe para o dia do deploy (fase D), e só o
// Cowork o corre, com o «sim» do Paulo. Avisar um motor de busca é uma acção
// para fora — não se desfaz, e o pedido de indexação antes do E0 contaminaria a
// linha de base da medição. Por isso:
//
//   · sem `--send`, NUNCA envia nada ao IndexNow: imprime o corpo que enviaria (dry-run).
//     (Se `--sitemap` for uma URL, faz um GET a essa URL para a ler — só leitura);
//   · com `--send`, só envia se INDEXNOW_SIM_DO_PAULO=1 estiver no ambiente;
//   · não há fonte de URLs por omissão: `--sitemap` é obrigatório, para que correr
//     sem pensar não faça nada.
//
// Uso (dry-run, só lê o ficheiro dado):
//   node scripts/indexnow-ping.mjs --sitemap ./sitemap.xml
// Uso real (fase D, depois do deploy, com o sim):
//   INDEXNOW_SIM_DO_PAULO=1 node scripts/indexnow-ping.mjs --sitemap https://mooter.ai/sitemap.xml --send
//
// A chave é PÚBLICA por desenho do protocolo (https://www.indexnow.org/documentation):
// o motor confirma-a lendo https://<host>/<chave>.txt, cujo corpo tem de ser a
// própria chave. Ela vive em `public/<chave>.txt`; o script descobre-a lá, e só
// aceita um ficheiro cujo nome (sem .txt) é EXACTAMENTE o seu corpo.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// INDEXNOW_ENDPOINT só existe para os testes apontarem a um porto fechado: assim
// uma regressão da guarda do «sim» não consegue chegar ao IndexNow a sério.
export const ENDPOINT = process.env.INDEXNOW_ENDPOINT || 'https://api.indexnow.org/indexnow';
export const HOST = 'mooter.ai';

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(HERE, '..', 'public');

/** Descobre a chave em `public/`: um `<chave>.txt` cujo corpo é igual ao nome. */
export function findKey(publicDir = PUBLIC_DIR) {
  const hits = [];
  for (const name of readdirSync(publicDir)) {
    const m = /^([A-Za-z0-9-]{8,128})\.txt$/.exec(name);
    if (!m) continue;
    const body = readFileSync(join(publicDir, name), 'utf8');
    if (body === m[1]) hits.push(m[1]);
  }
  if (hits.length !== 1) {
    throw new Error(`indexnow: esperava 1 ficheiro de chave em ${publicDir}, achei ${hits.length}`);
  }
  return hits[0];
}

/** As <loc> de um sitemap.xml. */
export function urlsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
}

/** O corpo do POST, segundo o protocolo. Recusa URLs fora do host. */
export function buildPayload({ host = HOST, key, urls }) {
  if (!key) throw new Error('indexnow: falta a chave');
  const outside = urls.filter((u) => new URL(u).host !== host);
  if (outside.length) throw new Error(`indexnow: URLs fora de ${host}: ${outside.join(', ')}`);
  if (urls.length === 0) throw new Error('indexnow: lista de URLs vazia');
  if (urls.length > 10000) throw new Error('indexnow: o protocolo aceita no máximo 10000 URLs por pedido');
  return { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls };
}

async function readSource(src) {
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src);
    if (!res.ok) throw new Error(`indexnow: ${src} respondeu ${res.status}`);
    return res.text();
  }
  return readFileSync(src, 'utf8');
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

async function main() {
  const src = arg('--sitemap');
  if (!src) {
    console.error('indexnow: --sitemap <ficheiro|url> é obrigatório (não há fonte por omissão, de propósito).');
    process.exit(2);
  }
  const send = process.argv.includes('--send');
  const payload = buildPayload({ key: findKey(), urls: urlsFromSitemap(await readSource(src)) });

  if (!send) {
    console.log(`DRY-RUN — nada foi enviado. Enviaria para ${ENDPOINT}:`);
    console.log(JSON.stringify(payload, null, 2));
    return;
  }
  if (process.env.INDEXNOW_SIM_DO_PAULO !== '1') {
    console.error('indexnow: --send recusado. Falta INDEXNOW_SIM_DO_PAULO=1 (o sim do Paulo).');
    process.exit(3);
  }
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify(payload),
  });
  console.log(`indexnow: ${res.status} ${res.statusText} (${payload.urlList.length} URLs)`);
  if (res.status !== 200 && res.status !== 202) process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
}
