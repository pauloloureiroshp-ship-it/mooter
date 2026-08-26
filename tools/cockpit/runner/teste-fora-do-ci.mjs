/**
 * teste-fora-do-ci.mjs — um teste novo que o CI nao corre faz o CI FALHAR.
 *
 * ── O PROBLEMA, MEDIDO ──────────────────────────────────────────────────────
 *
 * A 2026-08-26: **180 de 599** ficheiros de teste versionados (30%) nao sao
 * alcancados por nada que os workflows invoquem. Nao e negligencia de ninguem —
 * e mecanica. Metade dos scripts de teste deste repo sao **listas escritas a
 * mao**:
 *
 *     "test:cockpit-runner": "node --test a.test.mjs b.test.mjs … (46 ficheiros)"
 *     "test":               "node --test … (88 ficheiros)"   ← tools/router
 *
 * Escrever um teste novo ao lado dos outros e a coisa mais natural do mundo. A
 * lista nao cresce sozinha. O teste passa localmente, entra no repo, e nunca
 * mais corre — e ninguem descobre, porque um teste que nao corre nao falha.
 *
 * ── O QUE ESTE GUARDA FAZ, E O QUE NAO FAZ ──────────────────────────────────
 *
 * NAO tenta levar os 180 orfaos a zero de uma vez. Isso e uma onda de trabalho,
 * nao um guarda, e um guarda que nasce vermelho e desligado no mesmo dia.
 *
 * FAZ uma **catraca**: a lista actual e a linha de base, e o guarda falha
 * quando ela **cresce**. Um teste novo fora do CI parte a build no PR que o
 * introduz — que e o unico momento em que corrigi-lo custa dois minutos.
 *
 * E aperta nos dois sentidos: quando um orfao passa a ser coberto, o guarda
 * TAMBEM falha, a pedir que a linha de base encolha. Uma catraca que so trava
 * numa direccao acaba a proteger o numero em vez do repositorio.
 *
 * ── PORQUE E QUE NAO TEM DETECTOR PROPRIO ───────────────────────────────────
 *
 * A cobertura calcula-se em `indice-do-harness.testesGateados()`, que ja e a
 * parcela C1 do indice e ja e testada. Uma segunda implementacao da mesma
 * pergunta divergiria da primeira no primeiro mes — e a partir dai o painel
 * diria um numero e o CI outro, sobre a mesma coisa.
 *
 * Uso:
 *   node tools/cockpit/runner/teste-fora-do-ci.mjs                # verifica
 *   node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base   # regrava
 *
 * Saida: 0 = a catraca aguenta. 1 = cresceu ou encolheu (ver mensagem). 2 = falhou a medir.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testesGateados, RAIZ_REPO } from './indice-do-harness.mjs';

export const CAMINHO_LINHA_BASE = path.join(RAIZ_REPO, 'tools', 'cockpit', 'runner', 'testes-orfaos.baseline.json');

export function lerLinhaBase({ caminho = CAMINHO_LINHA_BASE, readImpl = fs.readFileSync } = {}) {
  try {
    const j = JSON.parse(String(readImpl(caminho, 'utf8')));
    return { presente: true, orfaos: Array.isArray(j.orfaos) ? j.orfaos : [] };
  } catch {
    // Sem linha de base, o guarda NAO passa em silencio. Passar seria dizer
    // "esta tudo bem" sobre uma pergunta que nunca foi feita.
    return { presente: false, orfaos: [] };
  }
}

/**
 * A comparacao. Devolve as duas direccoes em separado porque significam coisas
 * diferentes: `novos` e uma regressao a acontecer agora, `resolvidos` e trabalho
 * feito que a linha de base ainda nao reconheceu.
 */
export function comparar(orfaosAgora, linhaBase) {
  const base = new Set(linhaBase);
  const agora = new Set(orfaosAgora);
  return {
    novos: orfaosAgora.filter((f) => !base.has(f)).sort(),
    resolvidos: linhaBase.filter((f) => !agora.has(f)).sort(),
  };
}

export function verificar({ raiz = RAIZ_REPO, linhaBaseImpl = lerLinhaBase, gateadosImpl = testesGateados } = {}) {
  // `incluirNaoVersionados`: o guarda tem de morder ANTES do commit. Ver a
  // nota em `testesGateados` — sem isto, um teste novo ainda por commitar
  // passava verde, e o guarda so acordava quando ja era tarde.
  const p = gateadosImpl({ raiz, incluirNaoVersionados: true });
  if (p.valor === null) {
    return { ok: false, codigo: 2, porque: `nao foi possivel medir a cobertura: ${p.porque}` };
  }
  const lb = linhaBaseImpl({});
  if (!lb.presente) {
    return {
      ok: false,
      codigo: 2,
      porque: 'sem linha de base. Correr `node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base` e commitar o ficheiro. Um guarda sem linha de base que passasse em silencio seria pior do que guarda nenhum.',
      total: p.den,
      orfaos: p.orfaos,
    };
  }
  const { novos, resolvidos } = comparar(p.orfaos || [], lb.orfaos);
  return {
    ok: novos.length === 0 && resolvidos.length === 0,
    codigo: novos.length || resolvidos.length ? 1 : 0,
    total: p.den,
    cobertos: p.num,
    orfaos: p.orfaos || [],
    linha_base: lb.orfaos.length,
    novos,
    resolvidos,
  };
}

export function escreverLinhaBase(r, { caminho = CAMINHO_LINHA_BASE, writeImpl = fs.writeFileSync } = {}) {
  const j = {
    porque_existe: 'A catraca dos testes que o CI nao corre. Esta lista e a divida CONHECIDA a 2026-08-26; o guarda falha quando ela cresce. Nao e uma allowlist permanente — e um tecto que so deve descer.',
    como_regravar: 'node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base  (e commitar, com o porque no PR)',
    aviso: 'Regravar isto para calar um vermelho e o gesto que mata a catraca. Se o numero SUBIU, ou se corrige o CI ou se escreve no PR porque e que aquele teste nao deve correr.',
    total_versionados: r.total,
    orfaos: [...(r.orfaos || [])].sort(),
  };
  writeImpl(caminho, JSON.stringify(j, null, 2) + '\n');
  return j;
}

export function imprimir(r) {
  if (r.codigo === 2) {
    console.error(`teste-fora-do-ci: ${r.porque}`);
    return 2;
  }
  console.log(`testes versionados ${r.total} · alcancados pelo CI ${r.cobertos} · orfaos ${r.orfaos.length} (linha de base ${r.linha_base})`);
  if (r.novos.length) {
    console.error(`\n::error::${r.novos.length} teste(s) NOVO(S) que o CI nao corre:`);
    for (const f of r.novos) console.error(`  ${f}`);
    console.error('\nUm teste que ninguem corre nao protege ninguem. Duas saidas, as duas legitimas:');
    console.error('  1. ligar o ficheiro a um script que o CI invoque (o caminho normal);');
    console.error('  2. se ele MESMO nao deve correr em CI, dizer porque no PR e regravar a linha de base.');
    console.error('Regravar sem a segunda frase e como o repo passa de 180 orfaos para 200.');
  }
  if (r.resolvidos.length) {
    console.error(`\n::error::${r.resolvidos.length} orfao(s) da linha de base passaram a ser cobertos — a catraca tem de APERTAR:`);
    for (const f of r.resolvidos) console.error(`  ${f}`);
    console.error('\nCorrer `node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base` e commitar.');
    console.error('Uma catraca que so trava numa direccao acaba a proteger o numero em vez do repositorio.');
  }
  if (r.ok) console.log('a catraca aguenta: nenhum teste novo fora do CI.');
  return r.codigo;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = verificar({});
  if (process.argv.includes('--linha-base')) {
    if (r.codigo === 2 && !r.orfaos) {
      console.error(`nao ha o que gravar: ${r.porque}`);
      process.exit(2);
    }
    const j = escreverLinhaBase(r);
    console.error(`linha de base gravada: ${j.orfaos.length} orfaos de ${j.total_versionados} testes versionados`);
    process.exit(0);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.codigo);
  }
  process.exit(imprimir(r));
}
