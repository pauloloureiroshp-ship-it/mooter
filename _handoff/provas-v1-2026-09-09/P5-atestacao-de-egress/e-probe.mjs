// e-probe.mjs — o claude.exe honra HTTPS_PROXY? Uma chamada por variante, 90 s de tecto.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { startCountingProxy } = await import('file:///' + path.join(HERE, '..', 'lib', 'counting-proxy.mjs').split('\\').join('/'));
const CLAUDE_EXE = path.join(process.env.APPDATA, 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
const variants = [{ HTTPS_PROXY: 1, https_proxy: 1, HTTP_PROXY: 1, http_proxy: 1 }, { HTTPS_PROXY: 1 }, {}];
for (const variant of variants) {
  const p = await startCountingProxy({ block: false });
  const env = { ...process.env, CLAUDECODE: '' }; for (const k of Object.keys(variant)) env[k] = p.url;
  const t0 = Date.now();
  const r = spawnSync(CLAUDE_EXE, ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'], { input: 'reply with the single word banana', encoding: 'utf8', windowsHide: true, timeout: 90000, env });
  const rep = p.report(); await p.close();
  console.log(JSON.stringify({ variant: Object.keys(variant), exit: r.status, ms: Date.now() - t0, conns: rep.total_connections, by_host: rep.by_host, stdout: (r.stdout || '').slice(0, 100), stderr: (r.stderr || '').slice(0, 300) }));
}
