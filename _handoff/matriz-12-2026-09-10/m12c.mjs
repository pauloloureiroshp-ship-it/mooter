#!/usr/bin/env node
// @ts-check
/**
 * m12c.mjs — M12-c: o braço B passa pelo HOOK real (`inject_context.js`) com
 * `ANTHROPIC_API_KEY` presente, para o arbiter de Haiku correr nos prompts
 * ambíguos. Uma variável: a peça do Mooter que na corrida principal estava
 * inerte (D7) passa a estar ligada.
 *
 *   node _handoff/matriz-12-2026-09-10/m12c.mjs congelar
 *   node _handoff/matriz-12-2026-09-10/m12c.mjs rotas      # só o hook, $0,001/arbiter, sem executar
 *   node _handoff/matriz-12-2026-09-10/m12c.mjs correr     # executa as rotas que MUDARAM
 *   node _handoff/matriz-12-2026-09-10/m12c.mjs julgar
 *   node _handoff/matriz-12-2026-09-10/m12c.mjs comparar
 *
 * A chave: lida de `process.env.ANTHROPIC_API_KEY` ou, se ausente, de
 * `~/.claude/tools/router/.env` (linha `ANTHROPIC_API_KEY=…`). Nunca é
 * impressa, nunca é gravada, só entra no `env` do processo do hook. Sem chave
 * o arbiter é no-op e a corrida PARA antes de gastar seja o que for — medir
 * "o arbiter activo" sem arbiter seria medir a corrida principal outra vez.
 *
 * Isolamento: o hook resolve `ROUTER_DIR = os.homedir()/.claude/tools/router` e
 * escreve lá (`decisions.log` vivo do dono, `.classify-cache.json`,
 * `.arbiter-cache.json`, `.budget-cache.json`). Corre-se com `USERPROFILE` e
 * `HOME` apontados a um sandbox que só tem os dois ficheiros que o hook LÊ
 * (`hw-capability.json`, `subscription-profile.json`, copiados do runtime
 * real). Nada do runtime do dono é tocado; o que o hook escrever fica em
 * `m12c/sandbox/` como evidência.
 *
 * Rotas iguais NÃO são re-geradas: onde o hook devolve o mesmo degrau e o
 * mesmo modelo da corrida principal, a resposta do B original é reutilizada
 * byte a byte (`reutilizado: true`). Gerar outra vez seria acrescentar ruído
 * de geração a uma medição cuja única variável é a rota.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chamarClaude } from './lib/claude-call.mjs';
import { chamarCodex } from './lib/codex-call.mjs';
import { custos } from './lib/preco.mjs';
import { baralhar } from './lib/cego.mjs';
import { montarPromptDeJuiz, extrairJson, total, maximo, CRITERIOS } from './lib/rubrica.mjs';
import { DEGRAU_PARA_MOTOR } from './lib/mooter-rota.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const ARENA = path.join(os.tmpdir(), 'matriz12-arena');
// Variante (emenda 1): c1 = chave presente + arbiter DESLIGADO (mede «o T1 existe»);
// c2 = chave presente + arbiter ligado (mede o arbiter por cima da c1).
const VARIANTE = (process.argv.find((a) => a.startsWith('--variante=')) || '--variante=c2').slice(11);
if (!['c1', 'c2'].includes(VARIANTE)) { console.error('--variante=c1|c2'); process.exit(2); }
const M = path.join(AQUI, 'm12c', VARIANTE);
const RES0 = path.join(AQUI, 'results');
const JUZ0 = path.join(AQUI, 'juizes');
const RES = path.join(M, 'results');
const JUZ = path.join(M, 'juizes');
const SANDBOX = path.join(AQUI, 'm12c', 'sandbox');
const SB_ROUTER = path.join(SANDBOX, '.claude', 'tools', 'router');
for (const d of [RES, JUZ, SB_ROUTER]) fs.mkdirSync(d, { recursive: true });

const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const prereg0 = JSON.parse(fs.readFileSync(path.join(AQUI, 'protocol.json'), 'utf8'));
const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;
const HOOK = path.join(REPO, 'tools/router/inject_context.js');
const ARBITER = path.join(REPO, 'tools/router/arbiter.js');
const REAL_ROUTER = path.join(os.homedir(), '.claude', 'tools', 'router');
const modo = process.argv[2];

// ── a chave, sem nunca a mostrar ───────────────────────────────────────────
function chave() {
  if (process.env.ANTHROPIC_API_KEY) return { valor: process.env.ANTHROPIC_API_KEY, origem: 'env' };
  // O checkout principal (~/frugal) tem o .env gitignored que NAO vem nos
  // worktrees — foi ai que o dono a poe desde o inicio, e onde esta.
  const principal = (() => { try { return spawnSync('git', ['worktree', 'list', '--porcelain'], { encoding: 'utf8', cwd: REPO }).stdout.match(/^worktree (.+)$/m)[1]; } catch { return null; } })();
  for (const f of [path.join(REAL_ROUTER, '.env'), path.join(REPO, 'tools/router/.env'), principal && path.join(principal, 'tools/router/.env')].filter(Boolean)) {
    try {
      const m = fs.readFileSync(f, 'utf8').match(/^\s*ANTHROPIC_API_KEY\s*=\s*["']?([^"'\r\n]+)["']?\s*$/m);
      if (m && m[1]) return { valor: m[1].trim(), origem: f.replace(os.homedir(), '~') };
    } catch { /* próximo */ }
  }
  return null;
}

// ── sandbox do ROUTER_DIR ──────────────────────────────────────────────────
function prepararSandbox() {
  for (const f of ['hw-capability.json', 'subscription-profile.json']) {
    const src = path.join(REAL_ROUTER, f);
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(SB_ROUTER, f));
  }
  return {
    hw_capability_sha256: fs.existsSync(path.join(SB_ROUTER, 'hw-capability.json')) ? sha(path.join(SB_ROUTER, 'hw-capability.json')) : 'n/d',
    subscription_profile_presente: fs.existsSync(path.join(SB_ROUTER, 'subscription-profile.json')),
  };
}

// ── chamar o hook real ─────────────────────────────────────────────────────
function hook(prompt, k) {
  const env = { ...process.env, USERPROFILE: SANDBOX, HOME: SANDBOX, ANTHROPIC_API_KEY: k.valor };
  delete env.MOOTER_ARBITER_DISABLE; delete env.FRUGAL_V07_DISABLE; delete env.MOOTER_V07_DISABLE;
  if (VARIANTE === 'c1') env.MOOTER_ARBITER_DISABLE = '1';
  const t0 = process.hrtime.bigint();
  const r = spawnSync(process.execPath, [HOOK], {
    input: JSON.stringify({ prompt }), encoding: 'utf8', timeout: 120000, env, cwd: ARENA, windowsHide: true,
  });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const out = r.stdout || '';
  const campo = (n) => { const m = out.match(new RegExp(`^${n}:\\s*(.+)$`, 'm')); return m ? m[1].trim() : null; };
  const arb = out.match(/^ARBITER:\s*(.+)$/m);
  const reasoning = out.match(/^arbiter_reasoning:\s*(.+)$/m);
  return {
    exit: r.status, ms: +ms.toFixed(0),
    tier: campo('tier'), task_category: campo('task_category'), risk_level: campo('risk_level'),
    recommended_model: campo('recommended_model'), confidence: Number(campo('confidence')) || null,
    escalation: campo('escalation'),
    arbiter: arb ? arb[1] : 'não correu (nenhuma linha ARBITER no hint)',
    arbiter_reasoning: reasoning ? reasoning[1] : null,
    hint_bruto: out, stderr_head: String(r.stderr || '').slice(0, 300),
  };
}

// ── congelar ───────────────────────────────────────────────────────────────
if (modo === 'congelar') {
  const dest = path.join(M, 'protocol.json');
  if (fs.existsSync(dest)) { console.error('m12c/protocol.json já existe'); process.exit(2); }
  const k = chave();
  const sb = prepararSandbox();
  const rotasOriginais = {};
  for (const p of prompts) { const r = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8')); rotasOriginais[p.id] = { tier: r.bracos.B.rota.tier, modelo: r.bracos.B.modelo, confidence: r.bracos.B.rota.confidence, task_category: r.bracos.B.rota.task_category }; }
  const ambiguos = Object.entries(rotasOriginais).filter(([, r]) => r.confidence < 0.75 || /^ambiguous_/.test(r.task_category)).map(([id]) => id);
  fs.writeFileSync(dest, JSON.stringify({
    _schema: 'matriz-12/m12c-prereg/1',
    congelado_em: new Date().toISOString(),
    variante: VARIANTE,
    pergunta: VARIANTE === 'c1'
      ? 'Com ANTHROPIC_API_KEY presente no env do hook real e o arbiter DESLIGADO, quais prompts deixam de ser rebaixados de T1 para T0 (classify.js:901), e o que isso faz aos pontos e ao custo do braço B?'
      : 'Com o arbiter de Haiku ACTIVO (via o hook real), por cima da c1, quantos dos prompts ambíguos mudam de degrau, para onde, e o que isso faz aos pontos e ao custo do braço B?',
    unica_variavel: VARIANTE === 'c1'
      ? 'o braço B passa por tools/router/inject_context.js com ANTHROPIC_API_KEY presente e MOOTER_ARBITER_DISABLE=1. O único efeito esperado é o T1 deixar de degradar para T0. Tudo o resto — prompts, modelos por degrau, tecto 2048, system prompt local COMO ESTÁ, juízes, sorteio, respostas de A/C/D — igual à corrida principal.'
      : 'o braço B passa por tools/router/inject_context.js com ANTHROPIC_API_KEY presente e o arbiter ligado; comparação primária contra a c1 (mesma chave, arbiter desligado), secundária contra a corrida principal. Ver AMENDMENT-1.md.',
    chave: k ? { presente: true, origem: k.origem, nota: 'valor nunca gravado nem impresso' } : { presente: false, nota: 'SEM CHAVE: a corrida recusa-se a correr — sem arbiter mediria a corrida principal outra vez' },
    sandbox: { router_dir: SB_ROUTER.replace(os.homedir(), '~'), ...sb, o_que_o_hook_escreve_aqui: ['decisions.log', '.classify-cache.json', '.arbiter-cache.json', '.budget-cache.json'], runtime_real_tocado: false },
    congelados: { ...prereg0.congelados, 'tools/router/inject_context.js': sha(HOOK), 'tools/router/arbiter.js': sha(ARBITER), 'tools/router/providers/ollama-api.js': sha(path.join(REPO, 'tools/router/providers/ollama-api.js')) },
    prompts_sha256: sha(path.join(AQUI, 'prompts.json')),
    semente_do_sorteio: prereg0.semente_do_sorteio,
    rotas_da_corrida_principal: rotasOriginais,
    gatilho_do_arbiter: 'confidence < 0.75 OU task_category ambiguous_* (inject_context.js ~l.925)',
    prompts_no_gatilho: ambiguos,
    reutilizacao: 'onde o hook devolver o MESMO degrau e o MESMO modelo da corrida principal, a resposta original do B é reutilizada byte a byte — não se gera outra vez',
    previsoes: VARIANTE === 'c1' ? {
      'exactamente os 4 prompts que a regra classifica como T1 (LEGAL-1, LEGAL-3, DEV-2, MKT-4) sobem para T1/Haiku; os outros 8 não mudam': 'SIM',
      'nenhuma linha ARBITER no hint (kill-switch respeitado)': 'SIM',
      'B(c1) > B (56,5) nos 12': 'SIM',
      'B(c1) ≥ C (80,5) nos 12': 'NÃO',
      'nos 4 que sobem, B(c1) fica a ≤ 2 pontos de C (é o mesmo modelo, Haiku)': 'SIM',
      'custo imputado de B(c1) > custo de C (0,1527)': 'SIM (os 2 Opus dos T3 pesam)',
    } : {
      [`o arbiter corre nos ${ambiguos.length} prompts do gatilho`]: 'SIM',
      'pelo menos 4 dos prompts do gatilho sobem de degrau (T0 → T1 ou T2)': 'SIM',
      'OPS-3 (segurança) sobe de degrau': 'SIM',
      'o arbiter recusa (refused) pelo menos um por HIGH_RISK': 'NÃO SEI',
      'B(m12c) > B (56,5) nos 12': 'SIM',
      'B(m12c) ≥ C (80,5) nos 12': 'NÃO SEI — é a pergunta',
      'custo imputado de B(m12c) > custo de C (0,1527)': 'NÃO SEI',
    },
    regra_de_paragem: 'se B(m12c) ≥ A (100,5) nos 12, o instrumento está partido: parar e investigar.',
  }, null, 1) + '\n');
  console.log(`pré-registo m12c escrito · chave ${k ? 'presente (' + k.origem + ')' : 'AUSENTE'} · ${ambiguos.length} prompts no gatilho: ${ambiguos.join(', ')}`);
  process.exit(0);
}

const prereg = JSON.parse(fs.readFileSync(path.join(M, 'protocol.json'), 'utf8'));
function guardas() {
  const falhas = [];
  for (const [n, s] of Object.entries(prereg.congelados)) { try { if (sha(path.join(REPO, n)) !== s) falhas.push(`${n}: sha mudou`); } catch { falhas.push(`${n}: ilegível`); } }
  if (sha(path.join(AQUI, 'prompts.json')) !== prereg.prompts_sha256) falhas.push('prompts.json mudou');
  const k = chave();
  if (!k) falhas.push('ANTHROPIC_API_KEY ausente: sem chave não há M12-c (nem c1 nem c2)');
  if (k && VARIANTE === 'c2') {
    // O arbiter falha em silêncio sem saldo (medido: outcome:failed em 62 ms, nada no hint).
    // Uma sonda de 5 tokens ANTES decide se a corrida mede o arbiter ou mede nada.
    const r = spawnSync(process.execPath, ['-e', "fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers:{'x-api-key':process.env.K,'anthropic-version':'2023-06-01','content-type':'application/json'},body:JSON.stringify({model:'claude-haiku-4-5-20251001',max_tokens:5,messages:[{role:'user',content:'ok'}]})}).then(async r=>{const j=await r.json();console.log(r.status+' '+(r.ok?'ok':(j.error&&j.error.message||'').slice(0,80)));process.exit(r.ok?0:1)})"],
      { encoding: 'utf8', timeout: 30000, env: { ...process.env, K: k.valor } });
    if (r.status !== 0) falhas.push('sonda de saldo falhou: ' + String(r.stdout || r.stderr).trim().slice(0, 100) + ' — a c2 não corre sem saldo');
  }
  if (falhas.length) { console.error('PARADO:\n  - ' + falhas.join('\n  - ')); process.exit(2); }
  return k;
}

// ── rotas: só o hook, sem executar ─────────────────────────────────────────
if (modo === 'rotas' || modo === 'correr') {
  const k = guardas();
  prepararSandbox();
  const fRotas = path.join(M, 'rotas.json');
  const rotas = fs.existsSync(fRotas) ? JSON.parse(fs.readFileSync(fRotas, 'utf8')) : {};
  for (const p of prompts) {
    if (rotas[p.id]) continue;
    process.stdout.write(`  ${p.id} hook…`);
    const h = hook(p.texto, k);
    const orig = prereg.rotas_da_corrida_principal[p.id];
    rotas[p.id] = { ...h, original: orig, mudou: !(h.tier === orig.tier && (h.tier !== 'T0' || h.recommended_model === orig.modelo)) };
    fs.writeFileSync(fRotas, JSON.stringify(rotas, null, 1) + '\n');
    console.log(` ${orig.tier}→${h.tier} ${h.tier === 'T0' ? h.recommended_model : ''} · ${h.arbiter} · ${h.ms} ms`);
  }
  if (modo === 'rotas') process.exit(0);

  // ── correr: executar só o que mudou ──────────────────────────────────────
  for (const p of prompts) {
    const dest = path.join(RES, `${p.id}.json`);
    if (fs.existsSync(dest)) { console.log(`- ${p.id}: já existe`); continue; }
    const rt = rotas[p.id];
    const r0 = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
    let linha;
    if (!rt.mudou) {
      linha = { id: p.id, braco: 'B_m12' + VARIANTE, reutilizado: true, rota: rt, ...r0.bracos.B, texto: r0.bracos.B.texto };
      console.log(`  ${p.id}: rota igual (${rt.tier}) — resposta original reutilizada`);
    } else if (rt.tier === 'T0') {
      process.stdout.write(`  ${p.id} local ${rt.recommended_model}…`);
      const r = spawnSync(process.execPath, [path.join(REPO, 'tools/router/router-execute.js'), p.texto, '--pin-provider=ollama', `--pin-model=${rt.recommended_model}`],
        { encoding: 'utf8', timeout: 300000, input: '', cwd: REPO, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, MOOTER_LOCAL_PIN_MAX_TOKENS: '2048' } });
      let j = null; try { j = JSON.parse(r.stdout || 'null'); } catch { /* */ }
      const base = { ok: !!(j && j.ok), modelo: rt.recommended_model, backend: 'ollama', texto: j ? (j.result_text || j.text || null) : null, tokens_in: j ? j.tokens_in : null, tokens_out: j ? j.tokens_out : null, cache_creation: 0, cache_read: 0, decorrido_ms: j ? j.duration_ms : null, truncou: !!(j && j.tokens_out === 2048) };
      linha = { id: p.id, braco: 'B_m12' + VARIANTE, reutilizado: false, rota: rt, ...base, ...custos(rt.recommended_model, base) };
      console.log(` ${base.tokens_out} tokens`);
    } else {
      const alvo = DEGRAU_PARA_MOTOR[rt.tier];
      if (!alvo || alvo.backend !== 'claude') { linha = { id: p.id, braco: 'B_m12' + VARIANTE, reutilizado: false, rota: rt, ok: false, motivo: `degrau sem motor: ${rt.tier}` }; }
      else {
        process.stdout.write(`  ${p.id} ${alvo.modelo}…`);
        const r = chamarClaude({ prompt: p.texto, model: alvo.modelo, cwd: ARENA });
        const base = { ok: r.ok, motivo: r.motivo, modelo: alvo.modelo, backend: 'claude', texto: r.texto, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cache_creation: r.cache_creation, cache_read: r.cache_read, decorrido_ms: r.decorrido_ms };
        linha = { id: p.id, braco: 'B_m12' + VARIANTE, reutilizado: false, rota: rt, ...base, ...custos(alvo.modelo, base) };
        console.log(` ${base.tokens_out} tokens`);
      }
    }
    fs.writeFileSync(dest, JSON.stringify(linha, null, 1) + '\n');
  }
  process.exit(0);
}

// ── julgar: mesmo conjunto, B trocado (só onde mudou) ──────────────────────
const JUIZ = { J1: { motor: 'codex', modelo: 'gpt-6-astra' }, J2: { motor: 'claude', modelo: 'claude-sonnet-5' } };
function perguntar(juiz, prompt) {
  if (JUIZ[juiz].motor === 'codex') { const r = chamarCodex({ prompt, cwd: ARENA, model: JUIZ[juiz].modelo }); return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out }; }
  const r = chamarClaude({ prompt, model: JUIZ[juiz].modelo, cwd: ARENA });
  return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cache_creation: r.cache_creation, cache_read: r.cache_read };
}
if (modo === 'julgar') {
  for (const p of prompts) {
    const fB = path.join(RES, `${p.id}.json`);
    if (!fs.existsSync(fB)) continue;
    const rB = JSON.parse(fs.readFileSync(fB, 'utf8'));
    if (rB.reutilizado) { console.log(`- ${p.id}: rota igual — notas originais valem`); continue; }
    if (!rB.texto) { console.log(`- ${p.id}: B(m12c) sem texto — saltado`); continue; }
    const r0 = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
    const comTexto = Object.entries(r0.bracos).filter(([, v]) => v && typeof v.texto === 'string' && v.texto.trim()).map(([k]) => k);
    const { rotulos, chave: ch } = baralhar(comTexto, prereg.semente_do_sorteio, p.id);
    const respostas = comTexto.map((b) => ({ rotulo: rotulos[b], texto: b === 'B' ? rB.texto : r0.bracos[b].texto })).sort((a, b) => a.rotulo.localeCompare(b.rotulo));
    const promptDeJuiz = montarPromptDeJuiz({ pedido: p.texto, ehDeRisco: !!p.risco, respostas });
    const dest = path.join(JUZ, `${p.id}.json`);
    const feito = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : { id: p.id, chave: ch, notas: {} };
    for (const juiz of ['J1', 'J2']) {
      if (feito.notas[juiz]) continue;
      process.stdout.write(`  ${p.id} ${juiz}…`);
      const r = perguntar(juiz, promptDeJuiz);
      const j = extrairJson(r.texto);
      const notas = {};
      if (j) for (const [rot, v] of Object.entries(j)) { const b = ch[rot]; if (!b) continue; const n = {}; for (const c of CRITERIOS) n[c.chave] = Number(v[c.chave]); notas[b] = { rotulo: rot, ...n, porque: v.porque || null, total: total(n, !!p.risco), maximo: maximo(!!p.risco) }; }
      feito.notas[juiz] = { motor: JUIZ[juiz], ok: r.ok && Object.keys(notas).length === comTexto.length, motivo: r.motivo || null, notas, bruto: r.texto, custo_tokens: { in: r.tokens_in, out: r.tokens_out, cache_write: r.cache_creation || 0, cache_read: r.cache_read || 0 } };
      fs.writeFileSync(dest, JSON.stringify(feito, null, 1) + '\n');
      console.log(feito.notas[juiz].ok ? ' ok' : ` FALHOU: ${feito.notas[juiz].motivo}`);
    }
    fs.writeFileSync(path.join(JUZ, `${p.id}.prompt-de-juiz.txt`), promptDeJuiz);
  }
  process.exit(0);
}

// ── comparar ───────────────────────────────────────────────────────────────
if (modo === 'comparar') {
  const rotas = JSON.parse(fs.readFileSync(path.join(M, 'rotas.json'), 'utf8'));
  const out = [VARIANTE === 'c1' ? '# M12-c1 — a chave presente, o arbiter desligado: o T1 passa a existir' : '# M12-c2 — o arbiter ligado, por cima da c1', '', `Pré-registo: \`m12c/${VARIANTE}/protocol.json\` (${prereg.congelado_em}). Gerado por \`m12c.mjs comparar --variante=${VARIANTE}\`.`, ''];
  out.push('| prompt | máx | rota principal | **rota m12c** | arbiter | B | **B(m12c)** | Δ | custo B → m12c $ |');
  out.push('|---|---|---|---|---|---|---|---|---|');
  const acc = { B0: 0, B1: 0, C: 0, A: 0, max: 0, n: 0, cB0: 0, cB1: 0, mudaram: 0, subiram: 0, gatilho: prereg.prompts_no_gatilho.length, arbCorreu: 0, refused: 0 };
  for (const p of prompts) {
    const rt = rotas[p.id]; if (!rt) continue;
    const fB = path.join(RES, `${p.id}.json`); if (!fs.existsSync(fB)) continue;
    const rB = JSON.parse(fs.readFileSync(fB, 'utf8'));
    const j0 = JSON.parse(fs.readFileSync(path.join(JUZ0, `${p.id}.json`), 'utf8'));
    const media = (jz, b) => { const xs = ['J1', 'J2'].map((J) => jz.notas[J] && jz.notas[J].notas[b]).filter((x) => x && Number.isFinite(x.total)).map((x) => x.total); return xs.length === 2 ? (xs[0] + xs[1]) / 2 : null; };
    const m = maximo(!!p.risco);
    const B0 = media(j0, 'B');
    let B1 = B0;
    if (!rB.reutilizado) { const fJ = path.join(JUZ, `${p.id}.json`); B1 = fs.existsSync(fJ) ? media(JSON.parse(fs.readFileSync(fJ, 'utf8')), 'B') : null; }
    const r0 = JSON.parse(fs.readFileSync(path.join(RES0, `${p.id}.json`), 'utf8'));
    const c0 = r0.bracos.B.custo_faturado_usd, c1 = rB.reutilizado ? c0 : rB.custo_faturado_usd;
    if (/honored|refused/.test(rt.arbiter)) acc.arbCorreu++;
    if (/refused/.test(rt.arbiter)) acc.refused++;
    if (rt.mudou) acc.mudaram++;
    const ordem = ['T0', 'T1', 'T2', 'T3'];
    if (ordem.indexOf(rt.tier) > ordem.indexOf(rt.original.tier)) acc.subiram++;
    if (B0 !== null && B1 !== null) { acc.B0 += B0; acc.B1 += B1; acc.max += m; acc.n++; acc.C += media(j0, 'C'); acc.A += media(j0, 'A'); }
    if (Number.isFinite(c0) && Number.isFinite(c1)) { acc.cB0 += c0; acc.cB1 += c1; }
    const f = (x) => (x === null ? 'n/d' : x.toFixed(1));
    out.push(`| ${p.id} | ${m} | ${rt.original.tier} ${rt.original.tier === 'T0' ? rt.original.modelo : ''} | **${rt.tier}** ${rt.tier === 'T0' ? rt.recommended_model : (rB.modelo || '')} | ${rt.arbiter} | ${f(B0)} | **${f(B1)}**${rB.reutilizado ? ' (=)' : ''} | ${B1 === null || B0 === null ? 'n/d' : ((B1 - B0) >= 0 ? '+' : '') + (B1 - B0).toFixed(1)} | ${Number.isFinite(c0) ? c0.toFixed(4) : 'n/d'} → ${Number.isFinite(c1) ? c1.toFixed(4) : 'n/d'} |`);
  }
  const f = (x) => x.toFixed(1);
  out.push(`| **total** | ${acc.max} | | | ${acc.arbCorreu} correu · ${acc.refused} refused | ${f(acc.B0)} | **${f(acc.B1)}** | ${(acc.B1 - acc.B0) >= 0 ? '+' : ''}${f(acc.B1 - acc.B0)} | ${acc.cB0.toFixed(4)} → ${acc.cB1.toFixed(4)} |`);
  out.push('');
  out.push(`Rotas que mudaram: **${acc.mudaram}** de 12 · subiram de degrau: **${acc.subiram}** · prompts no gatilho do arbiter: ${acc.gatilho} · arbiter correu em: ${acc.arbCorreu}.`);
  out.push(`Referência (mesmos juízes, mesma ronda): C ${f(acc.C)} · A ${f(acc.A)}.`);
  out.push('');
  if (VARIANTE === 'c1') {
    const r4 = ['LEGAL-1', 'LEGAL-3', 'DEV-2', 'MKT-4'];
    const subiram = Object.entries(rotas).filter(([, r]) => r.tier === 'T1').map(([id]) => id).sort();
    const semArb = Object.values(rotas).every((r) => /não correu/.test(r.arbiter));
    out.push('## Previsões pré-registadas (c1)'); out.push(''); out.push('| previsão | registado | resultado |'); out.push('|---|---|---|');
    out.push(`| exactamente LEGAL-1, LEGAL-3, DEV-2, MKT-4 sobem para T1; os outros 8 não mudam | SIM | ${JSON.stringify(subiram) === JSON.stringify(r4.slice().sort()) && acc.mudaram === 4 ? 'SIM' : 'NÃO'} (${subiram.join(', ')}; mudaram ${acc.mudaram}) |`);
    out.push(`| nenhuma linha ARBITER no hint | SIM | ${semArb ? 'SIM' : 'NÃO'} |`);
    out.push(`| B(c1) > B | SIM | ${acc.B1 > acc.B0 ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs ${f(acc.B0)}) |`);
    out.push(`| B(c1) ≥ C | NÃO | ${acc.B1 >= acc.C ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs ${f(acc.C)}) |`);
    out.push(`| custo B(c1) > custo C (0,1527) | SIM | ${acc.cB1 > 0.1527 ? 'SIM' : 'NÃO'} (${acc.cB1.toFixed(4)}) |`);
    out.push(`| paragem: B(c1) ≥ A (${f(acc.A)}) | — | ${acc.B1 >= acc.A ? '**DISPAROU — investigar**' : 'não disparou'} |`);
    fs.writeFileSync(path.join(M, 'COMPARACAO.md'), out.join('\n') + '\n'); console.log(out.join('\n')); process.exit(0);
  }
  out.push('## Previsões pré-registadas');
  out.push('');
  out.push('| previsão | registado | resultado |'); out.push('|---|---|---|');
  out.push(`| arbiter corre nos ${acc.gatilho} do gatilho | SIM | ${acc.arbCorreu === acc.gatilho ? 'SIM' : 'NÃO'} (${acc.arbCorreu}/${acc.gatilho}) |`);
  out.push(`| ≥ 4 do gatilho sobem de degrau | SIM | ${acc.subiram >= 4 ? 'SIM' : 'NÃO'} (${acc.subiram}) |`);
  out.push(`| OPS-3 sobe de degrau | SIM | ${rotas['OPS-3'] && rotas['OPS-3'].tier !== 'T0' ? 'SIM' : 'NÃO'} (${rotas['OPS-3'] ? rotas['OPS-3'].tier : 'n/d'}) |`);
  out.push(`| ≥ 1 refused por HIGH_RISK | não sei | ${acc.refused >= 1 ? 'SIM' : 'NÃO'} (${acc.refused}) |`);
  out.push(`| B(m12c) > B | SIM | ${acc.B1 > acc.B0 ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs ${f(acc.B0)}) |`);
  out.push(`| B(m12c) ≥ C | não sei | ${acc.B1 >= acc.C ? 'SIM' : 'NÃO'} (${f(acc.B1)} vs ${f(acc.C)}) |`);
  out.push(`| custo B(m12c) > custo C (0,1527) | não sei | ${acc.cB1 > 0.1527 ? 'SIM' : 'NÃO'} (${acc.cB1.toFixed(4)}) |`);
  out.push(`| paragem: B(m12c) ≥ A (${f(acc.A)}) | — | ${acc.B1 >= acc.A ? '**DISPAROU — investigar**' : 'não disparou'} |`);
  fs.writeFileSync(path.join(M, 'COMPARACAO.md'), out.join('\n') + '\n');
  console.log(out.join('\n'));
  process.exit(0);
}
console.error('modo: congelar | rotas | correr | julgar | comparar'); process.exit(2);
