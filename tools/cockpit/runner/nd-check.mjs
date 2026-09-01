#!/usr/bin/env node
/**
 * nd-check.mjs — um `n/d` sem prazo nao e honestidade: e uma divida sem credor.
 *
 * Este projecto escreve `n/d` em vez de inventar, e isso e a regra certa. Mas
 * um `n/d` que fica escrito para sempre acaba por ser lido como "isto nunca vai
 * existir" — e nesse ponto ja nao e honestidade, e desistencia com boa
 * caligrafia. Cada um passa a ter dono humano e data-limite.
 *
 * TRES coisas deliberadas, e cada uma existe por causa de um risco concreto:
 *
 *  1. O REGISTO NAO E A FONTE. Cada entrada declara um `verificador`, e este
 *     ficheiro corre-o. Uma entrada que ja se resolveu sai do relatorio
 *     sozinha, sem depender de alguem se lembrar de a apagar — senao o registo
 *     torna-se uma segunda verdade a envelhecer ao lado da primeira.
 *  2. SEM VERIFICADOR E `n/d`, NAO "vencido". Ha `n/d` que so uma ata do dono
 *     fecha (o TTV nao se mede por script). Chamar-lhes vencidos seria fabricar
 *     urgencia — a mesma familia de erro que o registo existe para evitar.
 *  3. UMA issue por SEMANA, agregada. Nunca uma por entrada. Um relatorio de
 *     divida que gera divida e so mais um dreno (M19).
 *
 * Determinístico, $0, sem LLM. So fala com o GitHub em `--issue`.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(AQUI, '..', '..', '..');
export const REGISTO = path.join(REPO, 'tools', 'cockpit', 'nd-registry.json');
export const SEMANA_MS = 7 * 24 * 3600 * 1000;

/**
 * Os verificadores. Cada um mede o MUNDO e devolve `{resolvido, porque}`.
 * `resolvido: null` = nao deu para medir, e isso nao e o mesmo que "por
 * resolver": um verificador que rebenta nao pode carimbar uma divida.
 */
export const VERIFICADORES = Object.freeze({
  /** O indice de ETA: quantas classes ja tem p50 medido. */
  'eta-index-cobertura': ({ mooDir = path.join(os.homedir(), '.mooter'), readImpl = fs.readFileSync } = {}) => {
    let j;
    try { j = JSON.parse(readImpl(path.join(mooDir, 'eta-index.json'), 'utf8')); }
    catch { return { resolvido: null, porque: 'n/d — nao consegui ler o eta-index.json' }; }
    const ch = (j && j.chaves) || {};
    const todas = Object.keys(ch);
    const comP50 = todas.filter((k) => ch[k] && ch[k].p50 != null);
    if (!todas.length) return { resolvido: null, porque: 'n/d — indice vazio, nada para medir' };
    return {
      resolvido: comP50.length === todas.length,
      porque: `${comP50.length} de ${todas.length} chaves com p50 medido`,
    };
  },
  /** A seccao de CI/PRs do Ledger: o snapshot ja traz o campo? */
  'ci-no-snapshot': ({ repoRoot = REPO, readImpl = fs.readFileSync } = {}) => {
    let src;
    try { src = readImpl(path.join(repoRoot, 'tools', 'cockpit', 'runner', 'build-ledger-snapshot.mjs'), 'utf8'); }
    catch { return { resolvido: null, porque: 'n/d — nao consegui ler o construtor do snapshot' }; }
    const temCampo = /\n\s{4}ci:\s/.test(src);
    return {
      resolvido: temCampo,
      porque: temCampo
        ? 'o snapshot ja traz um campo `ci`'
        : 'o construtor do snapshot nao emite campo `ci` nenhum',
    };
  },
});

export function lerRegisto({ readImpl = fs.readFileSync, caminho = REGISTO } = {}) {
  return JSON.parse(readImpl(caminho, 'utf8'));
}

/** Dias entre hoje e a data-limite. Negativo = vencido. */
export function diasAte(dataLimite, agora) {
  const t = Date.parse(`${dataLimite}T00:00:00Z`);
  if (!Number.isFinite(t)) return null;
  return Math.round((t - agora) / 86400000);
}

/**
 * O estado de cada entrada, medido. Nunca inventa: uma entrada sem verificador
 * sai `sem_verificador`, que e um terceiro estado — nem resolvida nem vencida.
 */
export function avaliar(registo, { agora = Date.now(), ambiente = {} } = {}) {
  const vence = Number(registo.vence_apos_dias) || 14;
  return (registo.entradas || []).map((e) => {
    const v = VERIFICADORES[e.verificador];
    const medido = v ? v(ambiente) : { resolvido: null, porque: 'sem verificador — so uma ata do dono fecha este' };
    const dias = diasAte(e.data_limite, agora);
    const resolvido = medido.resolvido === true;
    // `vencido` exige as tres coisas: prazo passado, medicao possivel, e a
    // medicao a dizer que continua por resolver. Sem medicao nao ha divida
    // provada — ha uma pergunta por responder, e chamar-lhe divida seria
    // fabricar urgencia.
    const vencido = !resolvido
      && medido.resolvido === false
      && dias != null && dias < 0;
    return {
      id: e.id, o_que: e.o_que, dono: e.dono, data_limite: e.data_limite,
      visivel_em: e.visivel_em, como_deixa_de_ser_nd: e.como_deixa_de_ser_nd,
      dias_para_o_limite: dias,
      estado: resolvido ? 'resolvido'
        : medido.resolvido === null ? 'sem-verificador'
          : vencido ? 'vencido' : 'em-prazo',
      medido: medido.porque,
      vence_apos_dias: vence,
    };
  });
}

/** O estado do cap semanal. Vive fora do repo — e estado de maquina. */
export function estadoDoCap({ mooDir = path.join(os.homedir(), '.mooter'), readImpl = fs.readFileSync } = {}) {
  try { return JSON.parse(readImpl(path.join(mooDir, 'nd-check-state.json'), 'utf8')); }
  catch { return { ultima_issue_ms: null }; }
}

export function podeAbrirIssue(estado, { agora = Date.now() } = {}) {
  const u = estado && Number(estado.ultima_issue_ms);
  if (!Number.isFinite(u)) return { pode: true, porque: 'nunca foi aberta nenhuma' };
  const falta = SEMANA_MS - (agora - u);
  return falta <= 0
    ? { pode: true, porque: 'passou uma semana desde a ultima' }
    : { pode: false, porque: `cap semanal: faltam ${Math.ceil(falta / 3600000)} h` };
}

/** O corpo da issue. UMA, agregada — nunca uma por entrada (M19). */
export function corpoDaIssue(linhas, { agora = Date.now() } = {}) {
  const vencidos = linhas.filter((l) => l.estado === 'vencido');
  const cab = `Relatorio semanal dos \`n/d\` — ${new Date(agora).toISOString().slice(0, 10)}\n\n`;
  if (!vencidos.length) return null;
  const tabela = ['| n/d | dono | limite | atraso | o que o fecha |', '|---|---|---|---|---|']
    .concat(vencidos.map((l) => `| \`${l.id}\` | ${l.dono} | ${l.data_limite} | ${-l.dias_para_o_limite} d | ${l.como_deixa_de_ser_nd} |`))
    .join('\n');
  const outros = linhas.filter((l) => l.estado !== 'vencido');
  const rodape = outros.length
    ? `\n\nOs restantes, para contexto (nao sao pedidos):\n${outros
      .map((l) => `- \`${l.id}\` — **${l.estado}** · ${l.medido}`).join('\n')}`
    : '';
  return `${cab}${vencidos.length} \`n/d\` passaram da data-limite. Fonte: \`tools/cockpit/nd-registry.json\`, ` +
    `medidos por \`tools/cockpit/runner/nd-check.mjs\`.\n\n${tabela}${rodape}\n\n` +
    'Uma issue por semana, agregada, com cap — nunca uma por entrada.';
}

function main() {
  const registo = lerRegisto();
  const linhas = avaliar(registo);
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify(linhas, null, 2)}\n`);
    return;
  }
  const marca = { resolvido: '✅', 'em-prazo': '·', vencido: '⚠️ ', 'sem-verificador': '?' };
  for (const l of linhas) {
    process.stdout.write(
      `${marca[l.estado]} ${l.id.padEnd(30)} ${l.estado.padEnd(16)} dono=${String(l.dono).padEnd(5)} ` +
      `limite=${l.data_limite} (${l.dias_para_o_limite} d)\n     ${l.medido}\n`,
    );
  }
  if (!process.argv.includes('--issue')) return;

  const cap = podeAbrirIssue(estadoDoCap());
  if (!cap.pode) { process.stdout.write(`\nissue NAO aberta — ${cap.porque}\n`); return; }
  const corpo = corpoDaIssue(linhas);
  if (!corpo) { process.stdout.write('\nissue NAO aberta — nenhum n/d vencido.\n'); return; }
  try {
    execFileSync('gh', ['issue', 'create', '--title',
      `n/d vencidos — ${new Date().toISOString().slice(0, 10)}`, '--body', corpo], { stdio: 'inherit' });
    const dir = path.join(os.homedir(), '.mooter');
    fs.writeFileSync(path.join(dir, 'nd-check-state.json'),
      `${JSON.stringify({ ultima_issue_ms: Date.now() }, null, 2)}\n`);
  } catch (e) {
    process.stderr.write(`nao consegui abrir a issue: ${String(e.message).slice(0, 160)}\n`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
