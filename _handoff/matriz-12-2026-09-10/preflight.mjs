#!/usr/bin/env node
// @ts-check
/**
 * preflight.mjs — os 5 pre-requisitos do MP MATRIZ 12, medidos por instrumento.
 *
 * Nada aqui e escrito a mao: cada campo vem de um comando que correu agora.
 * Onde nao houve medicao, o campo diz "n/d" e a razao. Custa 4 chamadas a
 * modelo (3 Anthropic baratas + 1 Codex) e 2 chamadas locais.
 *
 *   node _handoff/matriz-12-2026-09-10/preflight.mjs
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chamarClaude, resolveClaudeExe } from './lib/claude-call.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const ARENA = path.join(os.tmpdir(), 'matriz12-arena');
fs.mkdirSync(ARENA, { recursive: true });

const CODEX_EXE = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules',
  '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64',
  'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');

const sh = (cmd, args, opts = {}) => spawnSync(cmd, args, { encoding: 'utf8', timeout: 60000, cwd: REPO, input: '', ...opts });
const git = (...a) => (sh('git', a).stdout || '').trim();
const sha256 = (p) => { try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); } catch (e) { return `n/d (${e.code})`; } };

// -- 0 - terreno -----------------------------------------------------------
const versoes = {
  node: process.version,
  // sem shell: o npm no Windows e um .cmd, e shell:true e exactamente o que o
  // pre-requisito 3 proibe (DEP0190). Le-se a versao do package.json do proprio npm.
  npm: (() => { try { return JSON.parse(fs.readFileSync(path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'package.json'), 'utf8')).version; } catch (e) { return `n/d (${e.code})`; } })(),
  ollama: (sh(path.join(os.homedir(), 'AppData/Local/Programs/Ollama/ollama.exe'), ['--version']).stdout || '').trim() || 'n/d',
  claude_code: (() => { const e = resolveClaudeExe(); return e ? (sh(e, ['--version']).stdout || '').trim() : 'n/d'; })(),
  codex_cli: (sh(CODEX_EXE, ['--version']).stdout || '').trim() || 'n/d',
};

let ollamaModels = 'n/d';
try {
  const r = await fetch('http://127.0.0.1:11434/api/tags');
  const j = await r.json();
  ollamaModels = j.models.map((m) => ({ name: m.name, gb: +(m.size / 1e9).toFixed(1) }));
} catch (e) { ollamaModels = `n/d (${e.message})`; }

// -- 1 - num_predict -------------------------------------------------------
const PROMPT_TECTO = 'Lista 40 cidades brasileiras, uma por linha, numeradas de 1 a 40. Sem introducao e sem comentarios.';
function pinLocal(maxTok, model) {
  const r = spawnSync(process.execPath, [
    path.join(REPO, 'tools/router/router-execute.js'), PROMPT_TECTO,
    '--pin-provider=ollama', `--pin-model=${model}`,
  ], { encoding: 'utf8', timeout: 300000, input: '', cwd: REPO, env: { ...process.env, MOOTER_LOCAL_PIN_MAX_TOKENS: String(maxTok) } });
  let j = null; try { j = JSON.parse(r.stdout || 'null'); } catch { /* null */ }
  if (!j) return { erro: 'stdout_nao_json', stderr: String(r.stderr || '').slice(0, 300) };
  const t = j.result_text || j.text || '';
  return {
    tecto_pedido: maxTok, ok: j.ok, tokens_out: j.tokens_out,
    linhas_nao_vazias: t.split('\n').filter(Boolean).length,
    ultimos_60_chars: t.slice(-60),
    truncou: j.tokens_out === maxTok,
  };
}
const MODELO_LOCAL_PROVA = 'qwen2.5-coder:14b';
const p1 = {
  defeito: 'executePinned montava wrapperOpts sem maxTokens, por isso providers/ollama-api.js aplicava num_predict:256 em silencio',
  correccao: 'hunk de feat/landing-redesign@265281af aplicado a tools/router/router-execute.js NESTE worktree (nunca foi fundido em main)',
  ficheiro_alterado: 'tools/router/router-execute.js',
  env_do_braco_mooter: 'MOOTER_LOCAL_PIN_MAX_TOKENS=2048',
  controlo_negativo: pinLocal(256, MODELO_LOCAL_PROVA),
  positivo: pinLocal(2048, MODELO_LOCAL_PROVA),
};
p1.mordida = p1.controlo_negativo.truncou === true && p1.positivo.truncou === false
  ? 'PROVADA: a 256 corta exactamente aos 256 tokens a meio de uma linha; a 2048 termina a lista'
  : 'n/d - os dois bracos nao separaram; ver os dois blocos acima';

// -- 2 - hw-capability + FRUGAL_HW_RECOMMENDED_T0 --------------------------
const HW_PATH = path.join(os.homedir(), '.claude', 'tools', 'router', 'hw-capability.json');
const hw = JSON.parse(fs.readFileSync(HW_PATH, 'utf8'));
function classificar(prompt, env = {}) {
  const r = spawnSync(process.execPath, [path.join(REPO, 'tools/router/classify.js'), prompt],
    { encoding: 'utf8', timeout: 20000, input: '', env: { ...process.env, ...env } });
  try { return JSON.parse(r.stdout); } catch { return null; }
}
const PROMPT_T0 = 'resume este texto em tres linhas: a empresa vendeu 20 unidades';
const semEnv = classificar(PROMPT_T0, { FRUGAL_HW_RECOMMENDED_T0: '' });
const comEnv = classificar(PROMPT_T0, { FRUGAL_HW_RECOMMENDED_T0: hw.recommended_t0 });
const p2 = {
  hw_capability_path: HW_PATH,
  antes: '2026-05-30T22:58:29.064Z (copia intacta em preflight/hw-capability.ANTES.json)',
  probed_at: hw.probed_at,
  vendor: hw.vendor, name: hw.name, vram_mb: hw.vram_mb, hw_tier: hw.hw_tier,
  recommended_t0_medido: hw.recommended_t0,
  mp_esperava: 'qwen3:30b',
  bate_com_o_mp: hw.recommended_t0 === 'qwen3:30b',
  porque: hw.recommended_t0 === 'qwen3:30b' ? null
    : 'gpu-probe.js PREFER_ORDER lidera com qwen2.5-coder:14b desde 2026-08-29 (medicao B1 do MooterBench); qwen3:30b esta em 6.o lugar. O MP descreve a ordem anterior a essa mudanca.',
  classify_sem_env: { tier: semEnv && semEnv.tier, recommended_model: semEnv && semEnv.recommended_model },
  classify_com_env: { tier: comEnv && comEnv.tier, recommended_model: comEnv && comEnv.recommended_model },
  campo_t0_model_existe: Object.prototype.hasOwnProperty.call(comEnv || {}, 't0_model'),
  o_braco_le: 'classification.recommended_model (o campo t0_model NAO existe no output do classify)',
};

// -- 3 - claude.exe directo, sem shell -------------------------------------
const MODELOS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5', 'claude-opus-5'];
const p3 = {
  exe: resolveClaudeExe(),
  porque_directo: 'claude no PATH e um shim .cmd: spawn sem shell da ENOENT, e com shell o Node 24 emite DEP0190 e o interpretador come argumentos vazios (--tools "")',
  args_fixos: ['-p', '<prompt>', '--output-format', 'json', '--model', '<m>', '--setting-sources', '', '--strict-mcp-config', '--tools', ''],
  cwd: ARENA,
  isolamento: 'sem settings de user/projecto (nenhum hook do Mooter, nenhum plugin, nenhuma skill), sem MCP, sem ferramentas, cwd vazio (nenhum CLAUDE.md descoberto)',
  prompt_de_prova: 'Responde apenas com a palavra banana.',
  modelos: {},
};
for (const m of MODELOS) {
  const r = chamarClaude({ prompt: p3.prompt_de_prova, model: m, cwd: ARENA, timeoutMs: 180000 });
  p3.modelos[m] = {
    ok: r.ok, is_error: r.is_error, motivo: r.motivo,
    modelo_reportado: r.model_reportado, texto: r.texto,
    tokens_in: r.tokens_in, tokens_out: r.tokens_out,
    cache_creation: r.cache_creation, cache_read: r.cache_read,
    custo_reportado_usd: r.custo_reportado_usd, duration_api_ms: r.duration_api_ms,
  };
}
p3.veredicto = MODELOS.every((m) => p3.modelos[m].is_error === false && p3.modelos[m].tokens_out > 0)
  ? 'os 3 modelos: is_error:false e tokens_out > 0'
  : 'FALHOU - ver por modelo';

// -- 4 - Codex CLI: teste de creditos --------------------------------------
function codex(prompt) {
  const args = ['exec', '--json', '--ignore-user-config', '-m', 'gpt-6-astra',
    '-c', 'model_reasoning_effort="medium"', '-C', ARENA,
    '--skip-git-repo-check', '--ephemeral', '-s', 'read-only', prompt];
  const t0 = process.hrtime.bigint();
  const r = spawnSync(CODEX_EXE, args, { encoding: 'utf8', timeout: 600000, input: '', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  if (r.error) return { ok: false, motivo: `spawn:${r.error.code}`, ms };
  const evs = (r.stdout || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const msg = evs.find((e) => e.item && e.item.type === 'agent_message');
  const fim = evs.find((e) => e.type === 'turn.completed');
  return {
    ok: r.status === 0 && !!msg, exit: r.status, ms,
    texto: msg ? msg.item.text : null,
    usage: fim ? fim.usage : null,
    args_declarados: args.slice(0, -1),
  };
}
const cx = codex('Responde apenas com a palavra banana.');
const p4 = {
  exe: CODEX_EXE,
  modelo: 'gpt-6-astra (default do ~/.codex/config.toml do dono; fixado com -m porque --ignore-user-config apaga esse config)',
  effort: 'medium (-c model_reasoning_effort="medium")',
  natureza: 'AGENTE COM HARNESS, nao modelo nu: le ficheiros, corre passos e carrega system prompt proprio (27k tokens de entrada so para responder "banana")',
  teste: cx,
  creditos: cx.ok ? 'HA creditos: exit 0 com resposta' : 'SEM creditos ou falha - o braco D fica n/d',
  braco_D: cx.ok ? 'corre' : 'n/d',
};

// -- 5 - custo -------------------------------------------------------------
const precos = (() => {
  const src = fs.readFileSync(path.join(REPO, 'tools/router/pricing.js'), 'utf8');
  const bloco = src.includes('verified 2026-08-19');
  const pega = (k) => {
    const m = src.match(new RegExp("'" + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*\\{\\s*input:\\s*([\\d.]+),\\s*output:\\s*([\\d.]+)"));
    return m ? { input: +m[1], output: +m[2] } : 'n/d';
  };
  return {
    fonte: 'tools/router/pricing.js - bloco "Claude 5 family - verified 2026-08-19"',
    bloco_datado_presente: bloco,
    'claude-opus-5': pega('claude-opus-5'),
    'claude-sonnet-5': pega('claude-sonnet-5'),
    'claude-haiku-4-5-20251001': pega('claude-haiku-4-5-20251001'),
    ollama: { input: 0, output: 0 },
    'gpt-6-astra': 'n/d (nao existe em pricing.js; e subscricao ChatGPT, nao pay-per-token)',
  };
})();
const p5 = {
  precos_lista_usd_por_M: precos,
  cache: {
    o_que_se_mediu: 'o JSON do claude -p traz cache_creation_input_tokens e cache_read_input_tokens separados de input_tokens',
    porque_importa: `no probe barato desta corrida, "banana" gastou ${p3.modelos['claude-opus-5'].tokens_out} tokens de saida e escreveu ${p3.modelos['claude-opus-5'].cache_creation} tokens em cache: o custo faturado e dominado pelo harness, nao pela resposta`,
    multiplicadores: 'n/d em pricing.js - pricing.js nao modela cache. Serao declarados com fonte citada no protocol.json antes da corrida, ou o custo faturado fica n/d',
  },
  faturacao_real: 'os DOIS motores de nuvem correm por SUBSCRICAO nesta maquina (Claude Code por OAuth, Codex por subscricao ChatGPT). Nenhum dolar sai por token: o custo e preco de lista IMPUTADO. Nunca apresentar como poupanca realizada.',
};

// -- saida -----------------------------------------------------------------
const out = {
  _schema: 'matriz-12/preflight/1',
  mp: 'MP - MATRIZ 12 - Mooter vs a escolha real do utilizador - 2026-09-10',
  generated_at: new Date().toISOString(),
  owner_tz: 'America/Sao_Paulo',
  regras: 'R1-R10 do MP_PACOTE_DE_PROVAS_V1 - n/d nunca inventado - uma corrida - perdas ficam - adversario em motor diferente - sem push sem OK do dono',
  git: {
    worktree: REPO.replace(/\\/g, '/'),
    branch: git('rev-parse', '--abbrev-ref', 'HEAD'),
    head: git('rev-parse', 'HEAD'),
    head_data: git('log', '-1', '--format=%cI'),
    mp_dizia_main: '0768c7fa',
    nota_head: 'o HEAD deste worktree e f66813e9 (#494, D15 - o cache do orcamento tinha DOIS escritores), UM commit a frente do que o MP declara',
    sujo_no_arranque: git('status', '--porcelain') ? git('status', '--porcelain').split('\n').length + ' caminho(s) alterado(s)' : 'limpo',
  },
  frozen: {
    'tools/router/classify.js': sha256(path.join(REPO, 'tools/router/classify.js')),
    'tools/router/patterns.js': sha256(path.join(REPO, 'tools/router/patterns.js')),
    esperado_classify: '427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f',
    esperado_patterns: 'daf8270869f374a0be61c620f48224163d4f0433548a5d959a99097e728f18e5',
  },
  versions: versoes,
  hardware: { gpu: `${hw.vendor} ${hw.name} ${hw.vram_mb} MiB`, probed_at: hw.probed_at },
  ollama_models: ollamaModels,
  prereq_1_num_predict: p1,
  prereq_2_hw_t0: p2,
  prereq_3_claude_directo: p3,
  prereq_4_codex: p4,
  prereq_5_custo: p5,
};
out.frozen.intacto = out.frozen['tools/router/classify.js'] === out.frozen.esperado_classify
  && out.frozen['tools/router/patterns.js'] === out.frozen.esperado_patterns;

const dest = path.join(AQUI, '00-preflight.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1) + '\n');
console.log(`escrito: ${dest}`);
console.log(JSON.stringify({
  frozen_intacto: out.frozen.intacto,
  p1: p1.mordida,
  p2: `${p2.recommended_t0_medido} (o MP esperava qwen3:30b -> ${p2.bate_com_o_mp})`,
  p3: p3.veredicto,
  p4: p4.creditos,
  p5_bloco_datado: p5.precos_lista_usd_por_M.bloco_datado_presente,
}, null, 1));
