'use strict';
/**
 * progresso.js — escreve _handoff/progresso.html de 5 em 5 segundos.
 *
 * Responde à pergunta que o produto ainda não responde (achado B7 da auditoria:
 * "sem ETA em lado nenhum"): o que está a correr, há quanto tempo, o que está a
 * fazer AGORA, e quanto falta — com a estimativa derivada do histórico REAL
 * desta máquina, não de um palpite.
 *
 * Custo: zero. Não fala com o Cowork, não gasta tokens, não precisa do Claude.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const MOOTER = path.join(os.homedir(), '.mooter');
const LEDGER = path.join(MOOTER, 'ledger.jsonl');
const JOBS = path.join(MOOTER, 'jobs');
const OUT = path.join(__dirname, 'progresso.html');

function eventos(tail) {
  let linhas = [];
  try { linhas = fs.readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean); } catch { return []; }
  const fatia = tail ? linhas.slice(-tail) : linhas;
  const out = [];
  for (const l of fatia) { try { out.push(JSON.parse(l)); } catch { /* */ } }
  return out;
}

function estadoDosJobs(evs) {
  const m = new Map();
  for (const e of evs) {
    if (!e.job_id) continue;
    const j = m.get(e.job_id) || { id: e.job_id, agent: null, wave: null, ev: null, ts: null, dur: null };
    if (e.agent) j.agent = e.agent;
    if (e.wave) j.wave = e.wave;
    if (e.event) j.ev = e.event;
    if (e.ts) j.ts = e.ts;
    if (e.duration_s != null) j.dur = e.duration_s;
    m.set(e.job_id, j);
  }
  return [...m.values()];
}

/** Mediana das durações REAIS por agente — a base honesta da estimativa. */
function historico(evs, agente) {
  const d = evs.filter((e) => e.agent === agente && Number(e.duration_s) > 30)
    .map((e) => Number(e.duration_s)).sort((a, b) => a - b);
  if (!d.length) return null;
  return { n: d.length, mediana: d[Math.floor(d.length / 2)], max: d[d.length - 1] };
}

/** O que o job está a fazer AGORA, lido do seu próprio out.log. */
function actividade(jobId) {
  const p = path.join(JOBS, jobId, 'out.log');
  let st;
  try { st = fs.statSync(p); } catch { return { kb: null, linhas: [], porque: 'ainda não há out.log' }; }
  let txt = '';
  try {
    const fd = fs.openSync(p, 'r');
    const tamanho = Math.min(st.size, 60000);
    const buf = Buffer.alloc(tamanho);
    fs.readSync(fd, buf, 0, tamanho, Math.max(0, st.size - tamanho));
    fs.closeSync(fd);
    txt = buf.toString('utf8');
  } catch { return { kb: Math.round(st.size / 1024), linhas: [], porque: 'não consegui ler o fim do log' }; }
  const linhas = [];
  for (const l of txt.split('\n').slice(-120)) {
    let m = l.match(/"command"\s*:\s*"([^"]{1,120})/);
    if (m) { linhas.push('$ ' + m[1].replace(/\\\\/g, '\\')); continue; }
    m = l.match(/"text"\s*:\s*"([^"]{1,120})/);
    if (m) { linhas.push(m[1]); }
  }
  return { kb: Math.round(st.size / 1024), linhas: linhas.slice(-4), porque: null };
}

function html() {
  const evs = eventos(4000);
  const jobs = estadoDosJobs(eventos(400));
  const vivos = jobs.filter((j) => j.ev === 'started' || j.ev === 'dispatched');
  const agora = Date.now();
  let corpo = '';

  if (!vivos.length) {
    const ultimos = jobs.filter((j) => j.ts).sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts)).slice(0, 4);
    corpo = '<div class="ok">Nenhum job a correr.</div><table><tr><th>estado</th><th>agente</th><th>wave</th><th>duração</th></tr>'
      + ultimos.map((u) => '<tr><td>' + (u.ev || 'n/d') + '</td><td>' + (u.agent || 'n/d')
        + '</td><td>' + (u.wave || 'n/d') + '</td><td>' + (u.dur != null ? u.dur + ' s' : 'n/d') + '</td></tr>').join('')
      + '</table>';
  } else {
    for (const v of vivos) {
      const el = v.ts ? Math.round((agora - Date.parse(v.ts)) / 1000) : 0;
      const h = historico(evs, v.agent);
      let eta;
      if (!h) eta = '<span class="nd">n/d — sem histórico deste agente para estimar</span>';
      else {
        const falta = h.mediana - el;
        eta = falta > 0
          ? '<b class="cyan">faltam ~' + Math.round(falta / 60) + ' min</b> <span class="nd">(mediana de ' + h.n + ' jobs ' + v.agent + ': ' + Math.round(h.mediana / 60) + ' min)</span>'
          : '<b class="mag">já passou a mediana de ' + Math.round(h.mediana / 60) + ' min</b> <span class="nd">(máximo histórico: ' + Math.round(h.max / 60) + ' min)</span>';
      }
      const a = actividade(v.id);
      corpo += '<div class="job"><div class="id">' + v.id + ' <span class="ag">' + (v.agent || 'n/d') + '</span></div>'
        + '<div class="l">wave: <b>' + (v.wave || 'n/d') + '</b></div>'
        + '<div class="l">a correr há: <b>' + Math.floor(el / 60) + ' min ' + (el % 60) + ' s</b></div>'
        + '<div class="l">' + eta + '</div>'
        + '<div class="l">out.log: ' + (a.kb != null ? a.kb + ' KB <span class="nd">(cresce = está vivo)</span>' : '<span class="nd">' + a.porque + '</span>') + '</div>'
        + (a.linhas.length ? '<pre>' + a.linhas.map((x) => x.replace(/</g, '&lt;')).join('\n') + '</pre>' : '')
        + '</div>';
    }
  }

  return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="refresh" content="5">'
    + '<title>Mooter — progresso</title><style>'
    + 'body{background:#0b0d10;color:#d8dee9;font:14px/1.5 ui-monospace,Consolas,monospace;margin:0;padding:18px}'
    + 'h1{font-size:15px;color:#88c0d0;margin:0 0 2px}.sub{color:#4c566a;font-size:12px;margin-bottom:14px}'
    + '.job{border:1px solid #2e3440;border-radius:8px;padding:12px;margin-bottom:12px;background:#11151a}'
    + '.id{color:#ebcb8b;font-weight:600;margin-bottom:6px}.ag{color:#4c566a;font-weight:400}'
    + '.l{margin:2px 0}.nd{color:#4c566a}.cyan{color:#88c0d0}.mag{color:#b48ead}.ok{color:#a3be8c;margin-bottom:12px}'
    + 'pre{background:#0b0d10;border-left:2px solid #2e3440;padding:8px;margin:8px 0 0;color:#7b8794;overflow-x:auto;font-size:12px}'
    + 'table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:4px 10px 4px 0;border-bottom:1px solid #2e3440;font-size:13px}th{color:#4c566a;font-weight:400}'
    + '</style></head><body><h1>MOOTER — progresso ao vivo</h1>'
    + '<div class="sub">actualiza-se sozinho de 5 em 5 s · lê o ledger e o out.log · não gasta interações nem tokens · '
    + new Date().toLocaleTimeString('pt-PT') + '</div>' + corpo + '</body></html>';
}

fs.writeFileSync(OUT, html());
console.log('escrito: ' + OUT);
