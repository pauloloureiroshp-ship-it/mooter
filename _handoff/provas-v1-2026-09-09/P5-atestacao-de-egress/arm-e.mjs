// arm-e.mjs — P5 braço E (AMENDMENT-1): Claude Code nativo, referência.
// O claude.exe NAO honra HTTPS_PROXY nesta maquina (e-probe.mjs, 2026-09-09: com HTTPS_PROXY -> exit null aos 90 s e
// 0 ligacoes ao proxy; sem proxy -> exit 0 em 8 s). Por isso o counting-proxy nao se aplica e cai-se no controlo grosseiro
// que o protocolo ja declarava para processos nao-Node: `netstat -ano` amostrado (150 ms) durante a chamada, filtrado pelo
// pid do claude.exe e dos filhos. Bytes: n/d (nao observaveis sem proxy). O que sai por desenho e atestado pelo proprio host:
// usage.input_tokens do JSON de saida.
import { spawn, execFileSync } from 'node:child_process';
import dns from 'node:dns/promises';

const ARGS = ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'];
const NETSTAT_RE = /^TCP\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)$/;

export async function armE({ checkFrozen, prompts20, CLAUDE_EXE, save, now, ms }) {
  checkFrozen();
  const rows = []; const ipCache = {};
  const rdns = async (ip) => { if (ipCache[ip] !== undefined) return ipCache[ip]; try { ipCache[ip] = (await dns.reverse(ip))[0] || null; } catch { ipCache[ip] = null; } return ipCache[ip]; };
  for (const p of prompts20()) {
    const t0 = process.hrtime.bigint();
    const child = spawn(CLAUDE_EXE, ARGS, { windowsHide: true, env: { ...process.env, CLAUDECODE: '' }, stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.end(p.prompt);
    let out = '', err = ''; child.stdout.on('data', (d) => { out += d; }); child.stderr.on('data', (d) => { err += d; });
    const pids = new Set([child.pid]); const seen = {}; let samples = 0, finished = false, childrenChecks = 0;
    const done = new Promise((res) => child.on('close', (code) => { finished = true; res(code); }));
    const killer = setTimeout(() => { try { child.kill(); } catch { /* */ } }, 180000);
    while (!finished) {
      try {
        if (childrenChecks < 3 && samples % 7 === 3) { childrenChecks++; const o = execFileSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter "ParentProcessId=${child.pid}" | Select-Object -ExpandProperty ProcessId`], { encoding: 'utf8', windowsHide: true, timeout: 8000 }); for (const l of o.split(/\r?\n/)) if (/^\d+$/.test(l.trim())) pids.add(Number(l.trim())); }
        const ns = execFileSync('netstat', ['-ano', '-p', 'tcp'], { encoding: 'utf8', windowsHide: true, timeout: 8000 });
        samples++;
        for (const l of ns.split(/\r?\n/)) { const m = l.trim().match(NETSTAT_RE); if (!m) continue; const pid = Number(m[4]); if (!pids.has(pid)) continue; const k = `${m[2]}|${pid}`; if (!seen[k]) seen[k] = { remote: m[2], pid, states: new Set() }; seen[k].states.add(m[3]); }
      } catch { /* amostra perdida: conta-se pelo numero de samples */ }
      await new Promise((r) => setTimeout(r, 150));
    }
    clearTimeout(killer); const code = await done;
    let j = null; try { j = JSON.parse(out); } catch { /* */ }
    const conns = [];
    for (const c of Object.values(seen)) { const ip = c.remote.replace(/:\d+$/, ''); const port = Number(c.remote.split(':').pop()); const loop = /^(127\.|\[::1\]|0\.0\.0\.0|\*)/.test(ip); conns.push({ remote: c.remote, ip, port, pid: c.pid, loopback: loop, rdns: loop ? null : await rdns(ip), states: [...c.states] }); }
    const ext = conns.filter((c) => !c.loopback);
    rows.push({ id: p.id, prompt_chars: p.prompt.length, exit: code, ms: ms(t0), netstat_samples: samples, pids: [...pids], connections: conns, external_connections: ext.length, external_hosts: [...new Set(ext.map((c) => c.rdns || c.ip))], bytes_out: 'n/d', prompt_left_by_design: j && j.usage ? `usage.input_tokens=${j.usage.input_tokens} reportado pelo host` : 'n/d', usage: j && j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens, cache_read: j.usage.cache_read_input_tokens, cache_create: j.usage.cache_creation_input_tokens } : null, stderr: err.slice(0, 160) });
    console.log(p.id, 'exit', code, 'samples', samples, 'ext', ext.length, ext.map((c) => c.rdns || c.ip).join(','));
  }
  save('E-native.json', { arm: 'E', at: now(), method: 'netstat -ano amostrado a 150 ms por pid (claude.exe + filhos) — AMENDMENT-1; bytes n/d', proxy_probe: 'e-probe.mjs 2026-09-09: com HTTPS_PROXY o claude.exe fica pendurado (exit null aos 90 s, 0 ligacoes ao proxy); sem proxy exit 0 em 8 s', rows });
}
