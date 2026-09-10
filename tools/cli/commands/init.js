/**
 * mooter init — o device apresenta-se, em vez de o utilizador o descrever.
 *
 * O QUE ISTO ERA, ate 2026-09-10: **onze perguntas** seguidas — «tens Claude
 * Max?», «tens uma OPENAI_API_KEY?», «tens um plano Pro do Claude Code?»,
 * «usas o Cursor?», «tens Copilot?». Tres problemas, e nenhum era de estilo:
 *
 *  1. A pessoa pode nao saber. «Tens um plano Pro do Claude Code?» e uma
 *     pergunta de faturacao, nao de configuracao.
 *  2. A pessoa pode enganar-se — e um perfil errado roteia mal para sempre,
 *     em silencio, sem nada que o denuncie.
 *  3. Onze prompts sao onze oportunidades de desistir antes do 1.º recibo.
 *
 * O QUE E AGORA: um **probe** (`../lib/probe.js`) que mede GPU, RAM, Ollama e
 * as CLIs presentes, imprime a tabela do ecra 4 do canvas, e faz **uma** pergunta
 * que nao se consegue medir (Claude Max — nao ha sinal nenhum dele no ambiente,
 * e a R6 proibe ir espreitar sessoes) mais **uma** de preferencia (a rota).
 *
 * A FORMA do `subscription-profile.json` NAO muda: dez ficheiros a leem. O que
 * muda e de onde vem cada valor — ver `../lib/perfil.js`.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');
const crypto = require('crypto');
const { color, say, ok, warn, info } = require('../lib/ui');
const { paths, which } = require('../lib/paths');

const probe = require('../lib/probe.js');
const perfilLib = require('../lib/perfil.js');
const rota = require('../lib/rota.js');
const enrolment = require('../lib/enrolment.js');
const conectores = require('../lib/conectores.js');

function prompt(q, def = 'n') {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const defLabel = def === 'y' ? 'Y/n' : 'y/N';
    rl.question(`  ${q} [${defLabel}]: `, (ans) => {
      rl.close();
      const a = (ans || '').trim().toLowerCase();
      if (!a) return resolve(def === 'y');
      resolve(['y', 'yes', 's', 'sim'].includes(a));
    });
  });
}

/** Escolha entre opcoes numeradas. Enter aceita a primeira. */
function escolher(titulo, opcoes) {
  return new Promise((resolve) => {
    console.log('');
    say(titulo);
    opcoes.forEach((o, i) => {
      console.log(`    ${color.bold ? color.bold(`[${i + 1}]`) : `[${i + 1}]`} ${o.titulo}`);
      console.log(`        ${color.dim(o.descricao)}`);
    });
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('  Escolhe [1]: ', (ans) => {
      rl.close();
      const n = parseInt((ans || '').trim(), 10);
      resolve(opcoes[Number.isFinite(n) && n >= 1 && n <= opcoes.length ? n - 1 : 0]);
    });
  });
}

async function run() {
  console.log('');
  console.log(`  ${color.magenta('mooter init')} ${color.dim('— o teu device apresenta-se')}`);
  console.log('');

  if (!fs.existsSync(paths.mooter)) fs.mkdirSync(paths.mooter, { recursive: true });
  if (!fs.existsSync(paths.deviceId)) {
    fs.writeFileSync(paths.deviceId, crypto.randomUUID() + '\n');
  }
  const deviceId = fs.readFileSync(paths.deviceId, 'utf8').trim();

  // ── 1. O probe ──────────────────────────────────────────────────────────
  say('A olhar para esta maquina…');
  const retrato = await probe.retrato();
  console.log('');
  for (const linha of probe.tabela(retrato)) console.log(`    ${linha}`);
  console.log('');

  // ── 2. O perfil: uma pergunta, e so porque muda a rota ──────────────────
  const subFile = path.join(paths.router, 'subscription-profile.json');
  if (!fs.existsSync(subFile)) {
    info('Nao consigo medir planos de subscricao sem espreitar sessoes — e nao o faco.');
    const claudeMax = await prompt('Tens Claude Max (Opus sem tecto)?');
    const perfil = perfilLib.construir(retrato, { claude_max: claudeMax });
    fs.mkdirSync(paths.router, { recursive: true });
    fs.writeFileSync(subFile, JSON.stringify(perfil, null, 2));
    ok(`Perfil guardado (anthropic: ${perfil.profiles.anthropic})`);
  } else {
    ok('Perfil de subscricao ja configurado');
  }

  // ── 3. Enrolment: o codigo de uso unico morre, nasce a chave do device ──
  if (enrolment.ligado()) {
    ok('Este device ja esta ligado a tua conta');
  } else {
    const codigo = process.env.MOOTER_TOKEN || null;
    const r = await enrolment.enrolar(codigo, { deviceId });
    // Nunca `fail`: falhar aqui NAO impede o Mooter de funcionar. A regra do
    // mapa e' «nenhum estado bloqueia o router — degrada, avisa, nunca para».
    if (r.ok) ok(r.porque);
    else info(r.porque);
  }

  // ── 4. Conectores ───────────────────────────────────────────────────────
  const alvo = path.join(paths.mooter, 'cli', 'mooter.js');
  const reg = conectores.registarTudo({ comando: process.execPath, args: [alvo] });
  for (const [onde, r] of Object.entries(reg)) {
    if (r.ok && r.codigo === 'cli-ausente') info(`${onde}: ${r.porque}`);
    else if (r.ok) ok(r.porque);
    else warn(`${onde}: ${r.porque}`);
    if (r.backup) info(`  copia de seguranca: ${r.backup}`);
    if (r.comando_para_depois) info(`  quando quiseres: ${r.comando_para_depois}`);
  }

  // ── 5. Motor local — modelo pequeno PRIMEIRO (D5) ───────────────────────
  if (!retrato.ollama.presente) {
    console.log('');
    warn(`Motor local ausente — ${retrato.ollama.porque}. O tier T0 (gratis) fica desligado.`);
    if (which('ollama')) {
      info('O `ollama` esta instalado mas nao esta a atender. Arranca a app, ou: ollama serve');
    } else {
      console.log('    Instalar: https://ollama.com/download');
      info('Depois de instalares, corre: mooter doctor');
    }
  } else {
    const tem = (re) => retrato.ollama.modelos.some((m) => re.test(m));
    // D5 — o pequeno em primeiro plano: e ele que faz o 1.º recibo existir
    // depressa. O resto vai atras e a sua ausencia nunca impede nada.
    if (!tem(/qwen2\.5:3b/)) {
      say('A puxar o modelo pequeno (qwen2.5:3b, ~1,9 GB) — e este que faz o teu 1.º recibo…');
      try {
        execSync('ollama pull qwen2.5:3b', { stdio: 'inherit' });
        ok('qwen2.5:3b pronto');
      } catch {
        warn('Falhou — podes tentar depois: ollama pull qwen2.5:3b');
      }
    } else {
      ok('qwen2.5:3b ja esta ca');
    }
    if (!tem(/nomic-embed-text/)) {
      say('A puxar nomic-embed-text (~274 MB) para a similaridade KNN…');
      try {
        execSync('ollama pull nomic-embed-text', { stdio: 'inherit' });
        ok('nomic-embed-text pronto');
      } catch {
        warn('nomic-embed-text falhou — o KNN degrada, nao para');
      }
    }
  }

  // ── 6. A rota: a pergunta unica ─────────────────────────────────────────
  if (rota.ler().fonte === 'omissao') {
    const opcoes = Object.entries(rota.POLITICAS).map(([k, v]) => Object.assign({ chave: k }, v));
    const escolha = await escolher('Como queres que o Mooter reparta o trabalho?', opcoes);
    const r = rota.escrever(escolha.chave);
    if (r.ok) ok(`Rota: ${escolha.titulo}. Mudar depois: \`mooter route\``);
  } else {
    ok(`Rota ja definida: ${rota.ler().titulo}`);
  }

  // ── 7. As skills de pin ─────────────────────────────────────────────────
  try {
    const { generateMooterSkills } = require('../lib/generate-mooter-skills');
    const { written, skipped } = generateMooterSkills({ dryRun: false });
    const total = written.length + skipped.length;
    if (total > 0) ok(`${total} skill(s) /mooter-<modelo> geradas`);
  } catch (e) {
    warn(`Nao consegui gerar as skills de pin: ${e.message}`);
  }

  console.log('');
  ok('mooter init completo.');
  console.log('');
  console.log('  A seguir:');
  console.log('    1. mooter doctor   — verificar tudo');
  console.log('    2. mooter          — lancar o Claude Code com routing');
  console.log('');
}

module.exports = { run };
