#!/usr/bin/env node
/**
 * mooter-use-ab.mjs — o controlador do R-24: «usar o Mooter é diferente de não usar?»
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE ESTE FICHEIRO EXISTE
 *
 * O A/B de 2026-09-01 (`mooter-vs-sem.mjs`) mediu PRECISÃO DE CLASSIFICAÇÃO e
 * deu empate literal: 29/35 contra 29/35. Um investidor perguntou o óbvio —
 * «então mostra-me que usar é diferente de não usar» — e não havia resposta:
 * a precisão empata, a obediência é 0%, e o custo do recibo está a zero em
 * 5.172 de 5.172 linhas.
 *
 * Este controlador mede outra coisa: TVA, o tempo até um comando de aceitação
 * CONGELADO ANTES DA EXECUÇÃO devolver exit 0. Sem juiz humano, sem LLM-juiz,
 * sem dólares estimados, sem precisão de routing.
 *
 * Desenho: book/experimento-usar-vs-nao-usar-2026-09-03.md (sha256 d8c47ad1…)
 * Pré-registo: book/pre-registo-r24-v1.md
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AS QUATRO GUARDAS, E O DEFEITO MEDIDO QUE CADA UMA IMPEDE
 *
 * 1. RECUSA CORRER DENTRO DE UMA SESSÃO CLAUDE CODE.
 *    Medido 2026-09-03: `claude -p` lançado de dentro de uma sessão devolve
 *    is_error:true, duration_api_ms:0, input_tokens:0, terminal_reason
 *    "api_error" — e **exit 0**. A sessão-mãe marca os filhos com
 *    CLAUDE_CODE_CHILD_SESSION e delega a renovação de OAuth ao host, que o
 *    filho não consegue fazer. Um ensaio corrido assim produziria 46 corridas
 *    vazias que se parecem com dados.
 *
 * 2. UMA CORRIDA QUE NÃO CHEGOU AO MODELO É INVÁLIDA, NÃO É UMA FALHA.
 *    is_error, duration_api_ms === 0 ou input_tokens === 0 ⇒ INVÁLIDA. Contar
 *    isso como TVA=1800 (falha) enviesaria o braço em que a autenticação
 *    partiu, e o exit code do CLI não distingue os dois casos.
 *
 * 3. O TESTE DE ACEITAÇÃO É SEMPRE O DO COMMIT-FILHO.
 *    Medido: 268 de 379 candidatos MODIFICAM um teste que já existia. O
 *    snapshot do pai traz uma versão mais fraca do próprio teste de aceitação;
 *    sem substituição, o controlador produz PASSA falso. O sha256 do ficheiro
 *    efectivamente usado vai para o ledger.
 *
 * 4. A BINOMIAL É UNILATERAL E ESCRITA AQUI.
 *    A `mcnemar()` do harness antigo (mooter-vs-sem.mjs:444) é CEGA À DIRECÇÃO:
 *    devolve o mesmo p para 16-23 (vitória) e 7-16 (derrota), porque usa
 *    k = Math.min(soA, soB) e duplica a cauda. O atalho de dividir por dois
 *    declara vitória numa derrota. Não se reaproveita.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE ESTE FICHEIRO NÃO FAZ
 *
 * Não escolhe tarefas, não escreve prompts e não decide o limiar. Tudo isso
 * vive no manifest e no pré-registo, congelados por sha256 antes da primeira
 * corrida. O controlador recusa-se a correr se algum sha não bater.
 *
 * Uso:
 *   node mooter-use-ab.mjs --prereg <ficheiro> --manifest <ficheiro> --seed <n>
 *   node mooter-use-ab.mjs --check      # valida ambiente e congelamento, não corre
 *   node mooter-use-ab.mjs --analisar   # só a estatística, sobre um ledger existente
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const TECTO_S = 1800;
export const RATIO_Z = 0.8;
export const ALFA = 0.05;

// ───────────────────────────────────────────────────────────────────────────
// Estatística — pura, testável, sem IO.
// ───────────────────────────────────────────────────────────────────────────

/** C(n,k) exacto via BigInt. n=23 ⇒ máximo 1.352.078, cabe em Number sem perda. */
export function coeficiente(n, k) {
  if (k < 0 || k > n) return 0;
  let num = 1n, den = 1n;
  const kk = BigInt(Math.min(k, n - k));
  for (let i = 0n; i < kk; i++) {
    num *= BigInt(n) - i;
    den *= i + 1n;
  }
  return Number(num / den);
}

/**
 * P(X >= k | n, p) — binomial exacta, cauda SUPERIOR, UNILATERAL.
 *
 * Unilateral de propósito: a hipótese é direccional («o Mooter é mais rápido em
 * mais de metade das tarefas»). Uma bilateral daria o mesmo valor a uma vitória
 * e a uma derrota simétrica, que é exactamente o defeito da mcnemar() antiga.
 */
export function caudaSuperior(k, n, p) {
  if (k <= 0) return 1;
  if (k > n) return 0;
  let acc = 0;
  for (let i = k; i <= n; i++) {
    acc += coeficiente(n, i) * Math.pow(p, i) * Math.pow(1 - p, n - i);
  }
  return acc;
}

/** O menor X admissível a este alfa. Não se escolhe a olho. */
export function limiarMinimo(n, p0, alfa) {
  for (let k = 0; k <= n; k++) {
    if (caudaSuperior(k, n, p0) <= alfa) return k;
  }
  return n + 1;
}

/** Potência do teste em p1, dado o limiar. */
export function potencia(limiar, n, p1) {
  return caudaSuperior(limiar, n, p1);
}

/**
 * Z de uma tarefa. A conjunção é obrigatória: sem ela, um braço ON
 * rápido-e-errado marcava sucesso.
 */
export function zDaTarefa(par) {
  const { on, off } = par;
  if (!on || !off) return { z: 0, motivo: 'par_incompleto' };
  if (on.invalido || off.invalido) return { z: null, motivo: 'par_invalido' };
  if (on.aceite !== true) return { z: 0, motivo: 'on_nao_passou' };
  const rapido = on.tva_s <= RATIO_Z * off.tva_s;
  return { z: rapido ? 1 : 0, motivo: rapido ? 'on_mais_rapido' : 'on_nao_foi_mais_rapido' };
}

/**
 * Atribuição AB/BA equilibrada e determinística a partir de uma seed.
 *
 * A seed é OBRIGATÓRIA e não tem valor por omissão: o pré-registo exige-a
 * «pública congelada», e um default seria uma escolha escondida.
 */
export function atribuicao(taskIds, seed) {
  if (seed === undefined || seed === null || Number.isNaN(Number(seed))) {
    throw new Error('atribuicao: seed obrigatória — o pré-registo exige-a pública e congelada');
  }
  const n = taskIds.length;
  const ordem = taskIds.map((id, i) => {
    const h = crypto.createHash('sha256').update(`${seed}:${id}`).digest();
    return { id, i, chave: h.readUInt32BE(0) };
  }).sort((a, b) => (a.chave - b.chave) || (a.i - b.i));
  const metade = Math.ceil(n / 2);
  return ordem.map((t, idx) => ({ id: t.id, primeiro: idx < metade ? 'ON' : 'OFF' }));
}

// ───────────────────────────────────────────────────────────────────────────
// Validação de uma corrida — guarda nº 2.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Uma corrida que nunca chegou ao modelo é INVÁLIDA, não é uma falha.
 * O exit code do CLI não distingue os dois: medido 2026-09-03, um erro de
 * autenticação devolveu exit 0 com is_error:true.
 */
export function validarCorrida(json) {
  if (!json || typeof json !== 'object') return { invalido: true, motivo: 'json_ausente' };
  if (json.is_error === true) return { invalido: true, motivo: `cli_is_error:${String(json.result || '').slice(0, 80)}` };
  if (Number(json.duration_api_ms) === 0) return { invalido: true, motivo: 'duration_api_ms_zero' };
  const inp = json?.usage?.input_tokens;
  if (Number(inp) === 0) return { invalido: true, motivo: 'input_tokens_zero' };
  return { invalido: false, motivo: null };
}

/** Guarda nº 1: este processo pode lançar `claude -p` com autenticação viva? */
export function ambienteApto(env = process.env) {
  const marcas = ['CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH', 'CLAUDE_CODE_SESSION_ID'];
  const presentes = marcas.filter((m) => env[m] !== undefined);
  if (presentes.length > 0) {
    return {
      apto: false,
      motivo: `este processo corre DENTRO de uma sessão Claude Code (${presentes.join(', ')}). `
        + 'Medido 2026-09-03: nessas condições `claude -p` devolve is_error:true com exit 0 e nunca chega ao modelo. '
        + 'Corre o controlador de um terminal normal.',
    };
  }
  return { apto: true, motivo: null };
}

// ───────────────────────────────────────────────────────────────────────────
// Congelamento — guarda contra mexer no protocolo a meio.
// ───────────────────────────────────────────────────────────────────────────

export function sha256Ficheiro(p, readImpl = fs.readFileSync) {
  return crypto.createHash('sha256').update(readImpl(p)).digest('hex');
}

/** Todos os sha declarados no pré-registo têm de bater com o disco. */
export function verificarCongelamento(prereg, { readImpl = fs.readFileSync } = {}) {
  const falhas = [];
  for (const [nome, spec] of Object.entries(prereg.congelados || {})) {
    if (!spec || spec.sha256 === null) { falhas.push({ nome, motivo: 'sha_null_no_prereg' }); continue; }
    let real;
    try { real = sha256Ficheiro(spec.path, readImpl); }
    catch (e) { falhas.push({ nome, motivo: `ilegivel:${e.code || e.message}` }); continue; }
    if (real !== spec.sha256) falhas.push({ nome, motivo: 'sha_diferente', esperado: spec.sha256, real });
  }
  return { ok: falhas.length === 0, falhas };
}

// ───────────────────────────────────────────────────────────────────────────
// Execução de um braço — com costura de injecção, para os testes serem herméticos.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Corre um braço. `spawnImpl` e `clockImpl` são injectáveis: os testes nunca
 * lançam um processo real, e o relógio é determinístico.
 *
 * O braço OFF usa `--setting-sources project,local`, que foi a única forma
 * medida de o hook não correr (log cresceu 0 bytes contra 770 e 1.152 por
 * omissão). Repõe explicitamente o que esse filtro arrasta — effortLevel e
 * permissões — para os braços diferirem só na variável em estudo.
 */
export function correrBraco({
  braco, prompt, cwd, tectoS = TECTO_S,
  spawnImpl = spawnSync, clockImpl = () => process.hrtime.bigint(),
  extraArgs = [],
}) {
  const args = ['-p', prompt, '--output-format', 'json'];
  if (braco === 'OFF') args.push('--setting-sources', 'project,local');
  args.push(...extraArgs);

  const t0 = clockImpl();
  const r = spawnImpl('claude', args, {
    cwd, encoding: 'utf8', timeout: tectoS * 1000,
    maxBuffer: 64 * 1024 * 1024, input: '',
  });
  const t1 = clockImpl();
  const decorridoS = Number(t1 - t0) / 1e9;

  if (r.error || r.signal) {
    return { braco, tva_s: tectoS, aceite: false, invalido: false, motivo: r.signal ? 'timeout' : `spawn:${r.error?.code}`, decorrido_s: decorridoS };
  }
  let json = null;
  try { json = JSON.parse(r.stdout || 'null'); } catch { /* fica null */ }
  const v = validarCorrida(json);
  if (v.invalido) return { braco, tva_s: null, aceite: null, invalido: true, motivo: v.motivo, decorrido_s: decorridoS };

  return { braco, tva_s: decorridoS, aceite: null, invalido: false, motivo: null, decorrido_s: decorridoS, session_id: json.session_id ?? null };
}

/**
 * Guarda nº 3: o teste de aceitação é SEMPRE o do commit-filho, copiado para
 * dentro do snapshot antes de correr. Devolve o sha do que foi realmente usado.
 */
export function instalarTesteDeAceitacao({ snapshotDir, ficheiroTeste, conteudo, writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync }) {
  const destino = path.join(snapshotDir, ficheiroTeste);
  mkdirImpl(path.dirname(destino), { recursive: true });
  writeImpl(destino, conteudo);
  return crypto.createHash('sha256').update(conteudo).digest('hex');
}

/** Corre o comando de aceitação. Exit 0 e só exit 0 é aceite. */
export function correrAceitacao({ cwd, comando, args, tectoS = TECTO_S, spawnImpl = spawnSync }) {
  const r = spawnImpl(comando, args, { cwd, encoding: 'utf8', timeout: tectoS * 1000, maxBuffer: 32 * 1024 * 1024 });
  return { aceite: !r.error && !r.signal && r.status === 0, status: r.status ?? null, sinal: r.signal ?? null };
}

// ───────────────────────────────────────────────────────────────────────────
// Ledger append-only — escritor único.
// ───────────────────────────────────────────────────────────────────────────

export function escreverLedger(linha, { ledgerPath, appendImpl = fs.appendFileSync, mkdirImpl = fs.mkdirSync }) {
  mkdirImpl(path.dirname(ledgerPath), { recursive: true });
  appendImpl(ledgerPath, JSON.stringify(linha) + '\n', 'utf8');
  return linha;
}

// ───────────────────────────────────────────────────────────────────────────
// Análise — a única função que decide, e decide por número.
// ───────────────────────────────────────────────────────────────────────────

export function analisar(pares, { n = 23, p0 = 0.5, p1 = 0.75, alfa = ALFA } = {}) {
  const zs = pares.map(zDaTarefa);
  const invalidos = zs.filter((z) => z.z === null).length;
  const validos = zs.filter((z) => z.z !== null);
  const X = validos.filter((z) => z.z === 1).length;
  const limiar = limiarMinimo(n, p0, alfa);
  const p = caudaSuperior(X, n, p0);
  const pot = potencia(limiar, n, p1);

  if (validos.length < n) {
    return {
      veredicto: 'ENSAIO INVALIDO', motivo: `pares válidos ${validos.length} < ${n} — subpotenciado, diferença não demonstrada`,
      X, n, limiar, p, potencia: pot, invalidos, pares_validos: validos.length,
    };
  }
  return {
    veredicto: X >= limiar ? 'GANHOU' : 'PERDEU',
    motivo: X >= limiar ? `X=${X} ≥ limiar ${limiar}` : `X=${X} < limiar ${limiar} — evidência simétrica de que não é melhor`,
    X, n, limiar, p, potencia: pot, invalidos, pares_validos: validos.length,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// CLI
// ───────────────────────────────────────────────────────────────────────────

function flag(argv, nome) {
  const i = argv.indexOf(`--${nome}`);
  return i >= 0 ? (argv[i + 1] ?? true) : undefined;
}

export function main(argv = process.argv.slice(2)) {
  const amb = ambienteApto();

  if (argv.includes('--check')) {
    console.log('mooter-use-ab · verificação de pré-condições');
    console.log(`  ambiente: ${amb.apto ? 'APTO' : 'INAPTO'}`);
    if (!amb.apto) console.log(`    ${amb.motivo}`);
    const preregPath = flag(argv, 'prereg');
    if (!preregPath) { console.log('  pré-registo: n/d (passa --prereg)'); return amb.apto ? 0 : 1; }
    let prereg;
    try { prereg = JSON.parse(fs.readFileSync(preregPath, 'utf8')); }
    catch (e) { console.log(`  pré-registo: ILEGÍVEL (${e.message})`); return 1; }
    console.log(`  estado do pré-registo: ${prereg.estado}`);
    if (prereg.estado !== 'CONGELADO') { console.log('    NÃO CONGELADO — nenhum resultado produzido agora é pré-registado'); return 1; }
    const c = verificarCongelamento(prereg);
    console.log(`  congelamento: ${c.ok ? 'OK' : 'FALHOU'}`);
    for (const f of c.falhas) console.log(`    · ${f.nome}: ${f.motivo}`);
    return amb.apto && c.ok ? 0 : 1;
  }

  if (!amb.apto) {
    console.error('RECUSO CORRER.');
    console.error(`  ${amb.motivo}`);
    return 2;
  }

  console.error('ainda não implementado: a fase de execução exige o manifest congelado.');
  console.error('corre com --check para validar as pré-condições.');
  return 3;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('mooter-use-ab.mjs')) {
  process.exit(main());
}
