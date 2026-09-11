// @ts-check
/**
 * codex-call.mjs — chama o binario nativo do Codex CLI, sem shell.
 *
 * `codex` no PATH e um shim que arranca node; o binario real esta dentro do
 * pacote de plataforma. Resolve-se e chama-se directo, pela mesma razao do
 * claude-call.mjs (DEP0190 + argumentos vazios comidos pelo interpretador).
 *
 * O braco D NAO e um modelo nu: `codex exec` e um agente com harness proprio
 * (system prompt, ferramentas, sandbox). Isso e declarado em todo o lado onde
 * o resultado aparece -- comparar isto com um `claude -p --tools ""` e comparar
 * um agente com um modelo, e a diferenca conta a favor do agente.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function resolveCodexExe() {
  const c = path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules',
    '@openai', 'codex', 'node_modules', '@openai', 'codex-win32-x64',
    'vendor', 'x86_64-pc-windows-msvc', 'bin', 'codex.exe');
  try { if (fs.statSync(c).isFile()) return c; } catch { /* nao existe */ }
  return null;
}

/**
 * @param {{prompt:string, cwd:string, model?:string, effort?:string, timeoutMs?:number}} o
 */
export const LIMIAR_STDIN = 24000;

export function chamarCodex({ prompt, cwd, model = 'gpt-6-astra', effort = 'medium', timeoutMs = 600000 }) {
  const exe = resolveCodexExe();
  if (!exe) return { ok: false, motivo: 'codex_exe_nao_encontrado' };
  // Mesmo tecto de 32767 chars do Windows que apanhou o LEGAL-3. `codex exec -`
  // le as instrucoes de stdin.
  const porStdin = prompt.length > LIMIAR_STDIN;
  const args = [
    'exec', '--json',
    '--ignore-user-config',          // sem os MCP/skills pessoais do dono no contexto
    '-m', model,
    '-c', `model_reasoning_effort="${effort}"`,
    '-C', cwd,
    '--skip-git-repo-check',
    '--ephemeral',
    '-s', 'read-only',
    porStdin ? '-' : prompt,
  ];
  const t0 = process.hrtime.bigint();
  const r = spawnSync(exe, args, { encoding: 'utf8', timeout: timeoutMs, input: porStdin ? prompt : '', maxBuffer: 64 * 1024 * 1024, windowsHide: true });
  const decorrido_ms = Number(process.hrtime.bigint() - t0) / 1e6;

  if (r.error) return { ok: false, motivo: `spawn:${r.error.code || r.error.message}`, decorrido_ms };
  if (r.signal) return { ok: false, motivo: `sinal:${r.signal} (tecto ${timeoutMs} ms)`, decorrido_ms };

  const evs = (r.stdout || '').split('\n').filter(Boolean)
    .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const msgs = evs.filter((e) => e.item && e.item.type === 'agent_message');
  const erros = evs.filter((e) => e.item && e.item.type === 'error').map((e) => e.item.message);
  const fim = evs.find((e) => e.type === 'turn.completed');
  const u = (fim && fim.usage) || {};

  const texto = msgs.length ? msgs.map((m) => m.item.text).join('\n') : null;
  return {
    ok: r.status === 0 && !!texto,
    motivo: texto ? null : (erros[0] || `exit:${r.status}`),
    exit: r.status,
    modelo: model,
    effort,
    texto,
    // O Codex reporta input_tokens ja INCLUINDO os cached; separa-se para nao
    // contar o mesmo token duas vezes na coluna de entrada nova.
    tokens_in: Number.isFinite(Number(u.input_tokens)) ? Number(u.input_tokens) : null,
    tokens_in_cached: Number(u.cached_input_tokens) || 0,
    cache_write: Number(u.cache_write_input_tokens) || 0,
    tokens_out: Number.isFinite(Number(u.output_tokens)) ? Number(u.output_tokens) : null,
    tokens_reasoning: Number(u.reasoning_output_tokens) || 0,
    erros_do_harness: erros,
    por_stdin: porStdin,
    decorrido_ms,
  };
}
