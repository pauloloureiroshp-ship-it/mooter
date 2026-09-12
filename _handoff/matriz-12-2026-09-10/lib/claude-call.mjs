// @ts-check
/**
 * claude-call.mjs — chama o binario do Claude Code DIRECTO, sem shell.
 *
 * Porque directo: `claude` no PATH do Windows e um shim `.cmd`; um
 * `spawn('claude', ...)` sem shell devolve ENOENT, e COM shell o Node 24 emite
 * DEP0190 e o shell come argumentos vazios (`--tools ""` colapsa e engole a
 * flag seguinte -> 400 prompt_too_long com 0 tokens). Ambos os defeitos ja
 * foram medidos nesta maquina. Aqui resolve-se o .exe e passa-se argv como
 * array, sem interpretador pelo meio.
 *
 * Isolamento: `--setting-sources ""` (nenhum settings.json de user/projecto ->
 * nenhum hook do Mooter, nenhum plugin, nenhuma skill), `--strict-mcp-config`
 * (nenhum servidor MCP), `--tools ""` (sem ferramentas: queremos a RESPOSTA de
 * um modelo, nao um agente a ler ficheiros) e um cwd vazio (nenhum CLAUDE.md
 * auto-descoberto). Sem isto, o braco A levava o router-hint do Mooter dentro
 * do proprio prompt -- e o A/B media o Mooter contra o Mooter.
 */
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

/** Acima disto o prompt vai por stdin. O tecto duro do Windows sao 32767 chars
 * para a linha de comando INTEIRA (argumentos e ambiente incluidos), por isso o
 * limiar fica bem abaixo. */
export const LIMIAR_STDIN = 24000;

export function resolveClaudeExe() {
  const candidatos = [
    path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'),
    path.join(os.homedir(), '.local', 'bin', 'claude'),
    '/usr/local/bin/claude',
  ];
  for (const c of candidatos) { try { if (fs.statSync(c).isFile()) return c; } catch { /* proximo */ } }
  return null;
}

/**
 * `spawnImpl` existe para os testes poderem ver os argumentos construidos sem
 * gastar uma chamada real.
 *
 * @param {{prompt:string, model:string, cwd:string, timeoutMs?:number, exe?:string|null, spawnImpl?:Function}} o
 */
export function chamarClaude({ prompt, model, cwd, timeoutMs = 300_000, exe = null, spawnImpl = spawnSync }) {
  const bin = exe || resolveClaudeExe();
  if (!bin) return { ok: false, motivo: 'claude_exe_nao_encontrado', model };
  // O Windows corta a linha de comando aos 32767 chars e o spawn devolve
  // ENAMETOOLONG. Apanhado a 2026-09-10: o prompt de juiz do LEGAL-3 tinha
  // 33345 chars e os DOIS juizes falharam nele. Acima do limiar o prompt vai
  // por stdin (`claude -p` sem argumento le stdin) — mesmo texto, outro
  // transporte. O limiar e alto de proposito: so muda o caminho de quem nao
  // cabe, e quem ja correu por argv nao e repontuado.
  const porStdin = prompt.length > LIMIAR_STDIN;
  const args = [
    ...(porStdin ? ['-p'] : ['-p', prompt]),
    '--output-format', 'json',
    '--model', model,
    '--setting-sources', '',
    '--strict-mcp-config',
    '--tools', '',
    // Medido no ensaio de 2026-09-10: com `--tools ""` o system prompt do harness
    // continua a descrever ferramentas, e o Opus respondeu ao SMOKE-2 emitindo
    // `<invoke name="Bash">` seguido de output FABRICADO de um `ls` que nunca
    // correu. Um juiz cego pontuaria isso 0 -- e a derrota seria do instrumento,
    // nao do motor. Esta linha e identica nos quatro bracos Anthropic, por isso
    // nao inclina nenhum deles; fica declarada no pre-registo.
    '--append-system-prompt',
    'Nesta sessao nao tens ferramenta nenhuma disponivel e nao ha ficheiros para ler. Responde directamente ao pedido, em texto. Nunca emitas blocos de invocacao de ferramentas nem inventes o resultado de um comando.',
  ];
  const t0 = process.hrtime.bigint();
  const r = spawnImpl(bin, args, {
    cwd, encoding: 'utf8', timeout: timeoutMs, input: porStdin ? prompt : '',
    maxBuffer: 64 * 1024 * 1024, windowsHide: true,
  });
  const decorrido_ms = Number(process.hrtime.bigint() - t0) / 1e6;

  if (r.error) return { ok: false, motivo: `spawn:${r.error.code || r.error.message}`, model, decorrido_ms, chars_do_prompt: prompt.length, por_stdin: porStdin };
  if (r.signal) return { ok: false, motivo: `sinal:${r.signal} (tecto ${timeoutMs} ms)`, model, decorrido_ms };

  let json = null;
  try { json = JSON.parse(r.stdout || 'null'); } catch { /* fica null */ }
  if (!json) return { ok: false, motivo: 'stdout_nao_json', model, decorrido_ms, stdout_head: String(r.stdout || '').slice(0, 400), stderr_head: String(r.stderr || '').slice(0, 400), exit: r.status };

  const u = json.usage || {};
  const inp = Number(u.input_tokens);
  const out = Number(u.output_tokens);
  return {
    ok: json.is_error === false && Number.isFinite(out) && out > 0,
    is_error: json.is_error,
    motivo: json.is_error ? `is_error:${json.subtype || 'n/d'}` : null,
    model,
    model_reportado: json.modelUsage ? Object.keys(json.modelUsage) : null,
    texto: typeof json.result === 'string' ? json.result : null,
    tokens_in: Number.isFinite(inp) ? inp : null,
    tokens_out: Number.isFinite(out) ? out : null,
    cache_creation: Number(u.cache_creation_input_tokens) || 0,
    cache_read: Number(u.cache_read_input_tokens) || 0,
    custo_reportado_usd: Number.isFinite(Number(json.total_cost_usd)) ? Number(json.total_cost_usd) : null,
    duration_ms: Number(json.duration_ms) || null,
    duration_api_ms: Number(json.duration_api_ms) || null,
    decorrido_ms,
    num_turns: Number(json.num_turns) || null,
    session_id: json.session_id || null,
    exit: r.status,
    por_stdin: porStdin,
  };
}
