#!/usr/bin/env node
/**
 * portao-de-existencia.mjs — a classe EXISTE neste repo, antes de haver pilar?
 *
 * O PROBLEMA QUE ISTO RESOLVE.
 *
 * Os pilares deste repo foram todos escritos pela ordem errada: primeiro o
 * enunciado, depois o ensaio semeado, e so muito depois — quando alguem leu o
 * que eles produziam — a pergunta de se a classe de defeito que eles procuram
 * existe mesmo aqui. Onze pilares, onze desligados por medicao.
 *
 * Este portao corre ANTES de se escrever um `ask`, e responde a pergunta que
 * nenhum dos outros dois portoes faz:
 *
 *     portao 0 (este)      a classe EXISTE?          censo deterministico + triagem a mao
 *     portao 1 (ensaio)    o detector DETECTA?       prova-de-pilar.mjs, semeado vs controlo
 *     portao 2 (campo)     o que sai VALE ser lido?  50 achados triados, precisao >= 20%
 *
 * O P11 saltou o portao 0, passou o 1, e custou 87 achados num dia — 76 dos
 * quais falhavam o proprio enunciado. Este e o unico dos tres que teria evitado
 * isso, e e o unico que custa ZERO: sem GPU, sem modelo, sem rede.
 *
 * OS DOIS LIMIARES, E PORQUE SAO DOIS.
 *
 *     >= 10 defeitos REAIS   e   >= 30% dos candidatos marcados serem reais
 *
 * Cada um dos onze morreu por um lado diferente, e um so criterio deixa passar
 * o outro:
 *
 *   · so a precisao  -> `|| 0` em codigo de dinheiro deu 2 reais em 39 (5%).
 *                       Baixando a fasquia passava, e daria um pilar mudo — dois
 *                       defeitos no repo inteiro nao sustentam uma rotacao.
 *   · so o volume    -> o P11 produziu 87 achados e 1 talvez util (1,1%).
 *                       Passava por volume, e foi exactamente o que aconteceu.
 *
 * O QUE ISTO NAO FAZ, E NAO PODE FAZER.
 *
 * Nao decide o que e um defeito REAL. Isso e leitura humana, e e o unico passo
 * caro do processo — por desenho. Um portao que se auto-aprovasse seria mais um
 * numero fabricado, e este repo tem uma doutrina inteira contra isso. O que ele
 * faz e reduzir a leitura a um numero pequeno e fixo (<= AMOSTRA_MAX), e depois
 * aplicar os limiares sem discussao.
 *
 * Uso:
 *   node tools/cockpit/runner/portao-de-existencia.mjs censo --classe <ficheiro.mjs>
 *   node tools/cockpit/runner/portao-de-existencia.mjs veredicto --triagem <ficheiro.jsonl>
 *
 * Um ficheiro de classe exporta tres coisas:
 *   `nome`     — a classe em uma frase
 *   `files`    — os globs onde ela vive, no formato dos pilares
 *   `detectar` — (linhas, ficheiro) e devolve [{ linha, porque }]
 *
 * (O exemplo dos globs nao se escreve aqui de proposito: um glob de pacotes leva
 * a sequencia que FECHA um bloco de comentario, e escreve-la partiu este ficheiro
 * a primeira vez que ele foi importado. E, ponto por ponto, a classe que o P3
 * dizia procurar — e que ele nunca encontrou em 1464 rondas.)
 */

import fs from 'node:fs';
import path from 'node:path';

import { expandirPadrao } from './context-pack.mjs';

/**
 * Quantos candidatos se leem a mao. Fixo, e pequeno de proposito: o custo do
 * portao tem de ser sempre o mesmo, senao ninguem o corre. 40 a ~15 s cada da
 * ~10 minutos, que e o orcamento que o torna corrivel numa pausa.
 */
export const AMOSTRA_MAX = 40;

/**
 * Os limiares vivem em `portao.mjs` desde 2026-08-26 — o mesmo objecto que
 * decide as regras do ancorado e os pilares. Tres copias dos mesmos dois numeros
 * eram tres sitios para eles divergirem. Re-exportado para nao partir ninguem.
 */
import { LIMIARES } from './portao.mjs';

export { LIMIARES };

/**
 * Ficheiros que NUNCA contam para o censo.
 *
 * Espelha o `DIFF_PATHSPEC` do `context-pack`, e pela mesma razao: um defeito
 * semeado num teste, ou num masterprompt arquivado, nao e um defeito do produto.
 * Contar testes era a forma mais facil de este portao mentir a favor da classe —
 * um ficheiro de teste esta cheio de codigo deliberadamente errado.
 */
export const EXCLUIDOS = [
  /(^|[\\/])_handoff[\\/]/,
  /(^|[\\/])docs[\\/]archive[\\/]/,
  /\.test\./,
  /(^|[\\/])node_modules[\\/]/,
];

export function excluido(ficheiro) {
  const p = String(ficheiro || '').replace(/\\/g, '/');
  return EXCLUIDOS.some((re) => re.test(p));
}

/**
 * Determinismo da amostra.
 *
 * Se a amostra fosse os primeiros 40 por ordem de varredura, ela seria toda do
 * mesmo canto do repo — e a precisao medida seria a precisao daquele canto. Um
 * hash da chave espalha-a pelo repo inteiro e mantem-na REPRODUTIVEL: correr o
 * censo outra vez com o mesmo codigo da a mesma amostra, portanto a triagem de
 * ontem continua a valer hoje.
 *
 * FNV-1a, o mesmo que o `autopilot` ja usa para a amostra de auditoria. Nao ha
 * razao para ter dois hashes diferentes a fazer a mesma coisa neste repo.
 */
export function hashDaChave(chave) {
  let h = 0x811c9dc5;
  const s = String(chave);
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Os ficheiros que uma classe declara, expandidos e filtrados. */
export function ficheirosDaClasse(repoRoot, files, { expandirImpl = expandirPadrao } = {}) {
  const vistos = new Set();
  const erros = [];
  for (const padrao of files || []) {
    let achados;
    try {
      achados = expandirImpl(repoRoot, padrao) || [];
    } catch (e) {
      // Um glob que rebenta NAO pode virar "zero ficheiros" em silencio: seria o
      // portao a aprovar uma classe por nao ter conseguido procurar.
      erros.push({ padrao, erro: String(e && e.message).slice(0, 120) });
      continue;
    }
    if (achados.length === 0) erros.push({ padrao, erro: 'nenhum ficheiro' });
    for (const f of achados) if (!excluido(f)) vistos.add(f);
  }
  return { ficheiros: [...vistos].sort(), erros };
}

/**
 * Corre o detector sobre os ficheiros da classe.
 *
 * `total` e o universo; `amostra` e o que ha para ler. Os dois viajam juntos e
 * o CLI imprime os dois, porque "40 candidatos" sem o total nao diz se a classe
 * e rara ou se e uma inundacao.
 */
export function censo({
  repoRoot,
  files,
  detectar,
  amostraMax = AMOSTRA_MAX,
  readImpl = (p) => fs.readFileSync(p, 'utf8'),
  expandirImpl = expandirPadrao,
}) {
  if (typeof detectar !== 'function') throw new Error('a classe tem de exportar `detectar(linhas, ficheiro)`');
  const { ficheiros, erros } = ficheirosDaClasse(repoRoot, files, { expandirImpl });

  const candidatos = [];
  const ilegiveis = [];
  for (const rel of ficheiros) {
    let texto;
    try {
      texto = readImpl(path.join(repoRoot, rel));
    } catch (e) {
      // Contado e declarado. Um ficheiro que nao se le nao e um ficheiro sem
      // defeitos — e um ficheiro que nao sabemos.
      ilegiveis.push(rel);
      continue;
    }
    const linhas = String(texto).split('\n');
    let marcas;
    try {
      marcas = detectar(linhas, rel) || [];
    } catch (e) {
      ilegiveis.push(`${rel} (o detector rebentou: ${String(e && e.message).slice(0, 80)})`);
      continue;
    }
    for (const m of marcas) {
      const n = Number(m && m.linha);
      if (!Number.isInteger(n) || n < 1 || n > linhas.length) continue;
      candidatos.push({
        ficheiro: rel,
        linha: n,
        texto: String(linhas[n - 1] || '').slice(0, 200),
        porque: String((m && m.porque) || '').slice(0, 200),
      });
    }
  }

  // Ordem estavel por hash: a amostra e a mesma entre corridas, e espalhada.
  const ordenados = candidatos
    .map((c) => ({ c, h: hashDaChave(`${c.ficheiro}:${c.linha}`) }))
    .sort((a, b) => (a.h - b.h) || (a.c.ficheiro < b.c.ficheiro ? -1 : 1))
    .map((x) => x.c);

  return {
    ficheirosVarridos: ficheiros.length,
    ilegiveis,
    errosDeGlob: erros,
    total: candidatos.length,
    amostra: ordenados.slice(0, amostraMax),
    truncado: Math.max(0, candidatos.length - amostraMax),
  };
}

/**
 * Aplica os limiares a triagem humana.
 *
 * `triados` = [{ ficheiro, linha, real: true|false }]. Um candidato sem `real`
 * booleano NAO conta como falso: conta como POR TRIAR, e enquanto houver algum
 * o veredicto e `incompleto`. Tratar "nao decidiu" como "nao e defeito" seria o
 * portao a aprovar-se pelo cansaco de quem tria.
 */
export function veredicto({ triados, total = null, limiares = LIMIARES }) {
  const lista = Array.isArray(triados) ? triados : [];
  const decididos = lista.filter((t) => t && typeof t.real === 'boolean');
  const porTriar = lista.length - decididos.length;
  if (lista.length === 0) {
    return { passa: false, estado: 'sem-triagem', porque: 'nao ha nada triado — o portao nao se corre sozinho' };
  }
  if (porTriar > 0) {
    return {
      passa: false,
      estado: 'incompleto',
      porTriar,
      porque: `faltam ${porTriar} candidatos por decidir — "nao decidi" nunca conta como "nao e defeito"`,
    };
  }

  const reais = decididos.filter((t) => t.real).length;
  const precisao = decididos.length ? reais / decididos.length : 0;
  const faltamReais = Math.max(0, limiares.REAIS_MINIMO - reais);
  const passaVolume = reais >= limiares.REAIS_MINIMO;
  const passaPrecisao = precisao >= limiares.PRECISAO_MINIMA;

  const pct = (x) => `${(x * 100).toFixed(1)}%`;
  const nota = total !== null && total > decididos.length
    ? ` (amostra de ${decididos.length} em ${total} candidatos)`
    : '';

  if (passaVolume && passaPrecisao) {
    return {
      passa: true,
      estado: 'passa',
      reais,
      triados: decididos.length,
      precisao,
      porque: `${reais} reais e ${pct(precisao)} de precisao${nota} — a classe existe, o enunciado pode escrever-se`,
    };
  }

  const falhas = [];
  if (!passaVolume) falhas.push(`so ${reais} defeitos reais, faltam ${faltamReais} para os ${limiares.REAIS_MINIMO}`);
  if (!passaPrecisao) falhas.push(`precisao ${pct(precisao)}, abaixo dos ${pct(limiares.PRECISAO_MINIMA)}`);
  return {
    passa: false,
    estado: 'reprova',
    reais,
    triados: decididos.length,
    precisao,
    porque: `${falhas.join(' e ')}${nota} — o pilar NAO se escreve`,
  };
}

// ─────────────────────────────────────────────────────────────── CLI

function lerJsonl(caminho) {
  const linhas = String(fs.readFileSync(caminho, 'utf8')).split('\n').filter((l) => l.trim());
  const fora = [];
  const dentro = [];
  for (const l of linhas) {
    try {
      const o = JSON.parse(l);
      if (o && typeof o === 'object' && !Array.isArray(o)) dentro.push(o);
      else fora.push(l.slice(0, 60));
    } catch { fora.push(l.slice(0, 60)); }
  }
  return { dentro, fora };
}

async function principal(argv) {
  const cmd = argv[0];
  const arg = (nome) => {
    const i = argv.indexOf(nome);
    return i === -1 ? null : argv[i + 1];
  };
  const repoRoot = arg('--repo') || process.cwd();

  if (cmd === 'censo') {
    const classePath = arg('--classe');
    if (!classePath) {
      console.error('uso: censo --classe <ficheiro.mjs> [--repo <raiz>] [--saida <ficheiro.jsonl>]');
      process.exit(2);
    }
    const mod = await import(new URL(`file:///${path.resolve(classePath).replace(/\\/g, '/')}`).href);
    const r = censo({ repoRoot, files: mod.files, detectar: mod.detectar });

    console.log(`classe: ${mod.nome || path.basename(classePath)}`);
    console.log(`ficheiros varridos: ${r.ficheirosVarridos}`);
    for (const e of r.errosDeGlob) console.log(`  AVISO glob "${e.padrao}": ${e.erro}`);
    for (const f of r.ilegiveis) console.log(`  AVISO ilegivel: ${f}`);
    console.log(`candidatos: ${r.total}${r.truncado ? ` (a amostra le ${r.amostra.length}; ${r.truncado} ficam de fora)` : ''}`);

    if (r.total < LIMIARES.REAIS_MINIMO) {
      console.log(`\nREPROVA JA, sem ler nada: ${r.total} candidatos nao chegam para ${LIMIARES.REAIS_MINIMO} reais.`);
    }

    const saida = arg('--saida') || path.join(repoRoot, '.mooter-portao-candidatos.jsonl');
    fs.writeFileSync(saida, r.amostra.map((c) => JSON.stringify({ ...c, real: null })).join('\n') + '\n');
    console.log(`\namostra escrita em ${saida}`);
    console.log('Le cada linha, poe `"real": true` ou `false`, e depois:');
    console.log(`  node tools/cockpit/runner/portao-de-existencia.mjs veredicto --triagem "${saida}" --total ${r.total}`);
    return;
  }

  if (cmd === 'veredicto') {
    const caminho = arg('--triagem');
    if (!caminho) {
      console.error('uso: veredicto --triagem <ficheiro.jsonl> [--total <n>]');
      process.exit(2);
    }
    const { dentro, fora } = lerJsonl(caminho);
    for (const l of fora) console.log(`AVISO linha ilegivel ignorada: ${l}`);
    const totalArg = arg('--total');
    const v = veredicto({ triados: dentro, total: totalArg === null ? null : Number(totalArg) });
    console.log(`${v.passa ? 'PASSA' : 'NAO PASSA'} · ${v.estado}`);
    console.log(v.porque);
    process.exit(v.passa ? 0 : 1);
  }

  console.error('comandos: censo | veredicto');
  process.exit(2);
}

if (process.argv[1] && process.argv[1].endsWith('portao-de-existencia.mjs')) {
  principal(process.argv.slice(2)).catch((e) => {
    console.error(String(e && e.message));
    process.exit(2);
  });
}
