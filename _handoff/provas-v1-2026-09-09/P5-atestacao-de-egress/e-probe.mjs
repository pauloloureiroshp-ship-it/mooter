// e-probe.mjs — o claude.exe honra HTTPS_PROXY? v2 (AMENDMENT-2, ataque P5-10 do adversario):
// a v1 usava spawnSync com o counting-proxy NO MESMO event loop — o loop ficava bloqueado e o proxy nunca podia
// aceitar a ligacao; «exit null, 0 ligacoes» era compativel com o cliente HONRAR a variavel. Esta versao usa spawn
// assincrono (o proxy atende enquanto o filho corre) e limpa TODAS as variaveis de proxy do ambiente no controlo.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const { startCountingProxy } = await import('file:///' + path.join(HERE, '..', 'lib', 'counting-proxy.mjs').split('\\').join('/'));
const CLAUDE_EXE = process.env.PROVAS_CLAUDE_EXE || path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'); // PROVAS_CLAUDE_EXE: sem isto o caminho e do Windows desta maquina e nao ha como reapontar (achado R12 do exame de 2026-09-09)
const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
const ARGS = ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'];
const variants = [['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy'], ['HTTPS_PROXY'], []];
for (const variant of variants) {
  const p = await startCountingProxy({ block: false });
  const env = { ...process.env, CLAUDECODE: '' }; for (const k of PROXY_VARS) delete env[k]; for (const k of variant) env[k] = p.url;
  const t0 = Date.now();
  const r = await new Promise((res) => {
    const c = spawn(CLAUDE_EXE, ARGS, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { try { c.kill(); } catch { /* */ } }, 90000);
    c.on('close', (code) => { clearTimeout(t); res({ status: code, stdout: out, stderr: err }); });
    c.stdin.end('reply with the single word banana');
  });
  const rep = p.report(); await p.close();
  console.log(JSON.stringify({ variant, exit: r.status, ms: Date.now() - t0, conns: rep.total_connections, by_host: rep.by_host, stdout: (r.stdout || '').slice(0, 100), stderr: (r.stderr || '').slice(0, 300) }));
}
