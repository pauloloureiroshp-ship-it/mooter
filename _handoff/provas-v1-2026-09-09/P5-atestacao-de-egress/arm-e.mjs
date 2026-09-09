// arm-e.mjs — P5 braço E (v3, AMENDMENT-2): Claude Code nativo, referência, medido pelo counting-proxy.
// v1 (protocolo): counting-proxy com spawnSync -> o proxy vivia no mesmo event loop e ficava bloqueado; o cliente
//   pendurava e eu concluí (mal) que o claude.exe nao honra HTTPS_PROXY. Apanhado pelo adversario (P5-10).
// v2 (AMENDMENT-1): netstat amostrado, bytes n/d. Guardado em results/E-native-netstat-v2.json.
// v3 (esta): spawn ASSINCRONO + um proxy por prompt. O proxy conta CONNECT host:porta e os bytes do tunel TLS em cada
//   sentido, sem desencriptar. Bytes do tunel != bytes de prompt (handshake, cabecalhos, corpo, respostas, retries).
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LIB = path.join(HERE, '..', 'lib');
const ARGS = ['-p', '--model', 'haiku', '--output-format', 'json', '--max-turns', '1', '--no-session-persistence', '--settings', '{"disableAllHooks":true}', '--disallowedTools', 'Bash,Read,Write,Edit,Glob,Grep,Agent,WebFetch,WebSearch,Task'];
const PROXY_VARS = ['HTTPS_PROXY', 'https_proxy', 'HTTP_PROXY', 'http_proxy', 'ALL_PROXY', 'all_proxy', 'NO_PROXY', 'no_proxy'];
const sum = (o, k) => Object.values(o).reduce((a, h) => a + (h[k] || 0), 0);

export async function armE({ checkFrozen, prompts20, CLAUDE_EXE, save, now, ms }) {
  checkFrozen();
  const { startCountingProxy } = await import('file:///' + path.join(LIB, 'counting-proxy.mjs').split('\\').join('/'));
  const rows = [];
  for (const p of prompts20()) {
    const proxy = await startCountingProxy({ block: false });
    const env = { ...process.env, CLAUDECODE: '' }; for (const k of PROXY_VARS) delete env[k]; env.HTTPS_PROXY = proxy.url; env.HTTP_PROXY = proxy.url;
    const t0 = process.hrtime.bigint();
    const r = await new Promise((res) => {
      const c = spawn(CLAUDE_EXE, ARGS, { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
      let out = '', err = ''; c.stdout.on('data', (d) => { out += d; }); c.stderr.on('data', (d) => { err += d; });
      const t = setTimeout(() => { try { c.kill(); } catch { /* */ } }, 180000);
      c.on('close', (code) => { clearTimeout(t); res({ status: code, stdout: out, stderr: err }); });
      c.stdin.end(p.prompt);
    });
    await new Promise((rr) => setTimeout(rr, 700)); // deixar os tuneis fechar e contabilizar
    const rep = proxy.report(); await proxy.close();
    let j = null; try { j = JSON.parse(r.stdout); } catch { /* */ }
    const by = rep.by_host || {};
    const row = { id: p.id, prompt_chars: p.prompt.length, exit: r.status, is_error: j ? !!j.is_error : null, ms: ms(t0), connections: rep.total_connections, by_host: by, external_hosts: Object.keys(by), bytes_out_total: sum(by, 'bytes_out'), bytes_in_total: sum(by, 'bytes_in'), bytes_out_api_anthropic: (by['api.anthropic.com:443'] || {}).bytes_out || 0, connections_api_anthropic: (by['api.anthropic.com:443'] || {}).n || 0, usage: j && j.usage ? { in: j.usage.input_tokens, out: j.usage.output_tokens, cache_read: j.usage.cache_read_input_tokens, cache_create: j.usage.cache_creation_input_tokens } : null, stderr: r.stderr.slice(0, 160) };
    rows.push(row);
    console.log(p.id, 'exit', r.status, 'conns', row.connections, 'hosts', row.external_hosts.length, 'out', row.bytes_out_total, 'in', row.bytes_in_total, 'api_out', row.bytes_out_api_anthropic);
  }
  save('E-native.json', { arm: 'E', version: 3, at: now(), method: 'counting-proxy em loopback (HTTPS_PROXY/HTTP_PROXY), spawn assincrono, um proxy por prompt; conta CONNECT host:porta e bytes do tunel por sentido, sem desencriptar — AMENDMENT-2', note: 'bytes do tunel TLS: handshake + cabecalhos + corpo + respostas + retries; NAO sao bytes de prompt. Hosts alem da API (mcp-proxy, registry.npmjs.org, datadoghq) sao do proprio cliente, nao do prompt.', probe: 'e-probe.mjs v2 (results/e-probe-v2.log): com proxy 41-43 CONNECT a 4 hosts; sem variaveis de proxy 0 — controlo positivo e negativo na mesma corrida', rows });
}
