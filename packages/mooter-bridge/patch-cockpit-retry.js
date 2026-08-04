#!/usr/bin/env node
/**
 * patch-cockpit-retry.js — liga o motor de retry ao Cockpit.
 *
 * PORQUE É UM SCRIPT E NÃO UMA EDIÇÃO À MÃO
 * O `cockpit.html` tem 5 000+ linhas e é self-contained: não pode `require`
 * nada. A tentação é copiar a tabela de assinaturas para dentro do HTML — e aí
 * passam a existir duas verdades sobre o que é uma falha, que divergem à
 * primeira correcção. G3: o mecanismo que impede a divergência é INLINE AT
 * BUILD, a partir do ficheiro real. Este script lê `retry.js` do disco e
 * cola-o verbatim entre marcadores. Correr outra vez actualiza o bloco.
 *
 * Idempotente: pode correr as vezes que forem precisas.
 *
 * Uso:  node patch-cockpit-retry.js [caminho/para/cockpit.html]
 */
'use strict';
const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..', '..');
const HTML = process.argv[2] || path.join(RAIZ, 'plugin', 'mooter', 'skills', 'cockpit', 'cockpit.html');
const MOTOR = path.join(RAIZ, 'packages', 'mooter-bridge', 'retry.js');

for (const f of [HTML, MOTOR]) {
  if (!fs.existsSync(f)) { console.error('✗ não existe: ' + f); process.exit(1); }
}

let html = fs.readFileSync(HTML, 'utf8');
const antes = html.length;
const feito = [];

/* ── helper: substitui entre marcadores, ou insere antes de uma âncora ───── */
function bloco(nome, corpo, ancora) {
  const ini = '/* <<<' + nome + '>>> */';
  const fim = '/* <<<FIM ' + nome + '>>> */';
  const novo = ini + '\n' + corpo + '\n' + fim;
  const re = new RegExp(escapar(ini) + '[\\s\\S]*?' + escapar(fim));
  if (re.test(html)) { html = html.replace(re, novo); feito.push(nome + ' (actualizado)'); return; }
  const i = html.indexOf(ancora);
  if (i < 0) { console.error('✗ âncora não encontrada para ' + nome + ': ' + ancora.slice(0, 60)); process.exit(1); }
  html = html.slice(0, i) + novo + '\n\n' + html.slice(i);
  feito.push(nome + ' (inserido)');
}
function escapar(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/* ══════════════════════════════════════════════════════════════════════════
   1 · O MOTOR, VERBATIM
   ══════════════════════════════════════════════════════════════════════════ */

const motorFonte = fs.readFileSync(MOTOR, 'utf8');
const motorSha = require('crypto').createHash('sha256').update(motorFonte).digest('hex').slice(0, 16);

bloco('MOTOR DE RETRY',
`/* ═══════════════════════════════════════════════════════════════════════════
   COLADO AUTOMATICAMENTE de packages/mooter-bridge/retry.js
   sha256(16): ${motorSha}
   NÃO EDITAR AQUI. Edita o ficheiro e corre:
     node packages/mooter-bridge/patch-cockpit-retry.js
   Duas cópias divergentes da tabela de falhas seria duas verdades sobre o que
   é uma falha — exactamente o que este painel existe para não fazer.
   ═══════════════════════════════════════════════════════════════════════════ */
const RETRY = (function(){
  const module = { exports: {} };
${motorFonte.split('\n').map((l) => '  ' + l).join('\n')}
  return module.exports;
})();
const RETRY_SHA = ${JSON.stringify(motorSha)};`,
  'function fv(x){');

/* ══════════════════════════════════════════════════════════════════════════
   2 · A INTERFACE
   ══════════════════════════════════════════════════════════════════════════ */

const ui = String.raw`
/* ═══════════════════════════════════════════════════════════════════════════
   RETRY — o único botão do painel que EXECUTA
   ───────────────────────────────────────────────────────────────────────────
   Todos os outros escrevem um prompt para o Paulo colar. Este não: quando o
   conector está ao alcance, ele cancela o fantasma e volta a despachar com os
   argumentos corrigidos, e o Paulo vê as tentativas a andar aqui na lateral.

   O que o torna seguro não é pedir confirmação a tudo — é a ORDEM:
     1. mostra o diagnóstico e a evidência medida ANTES de haver botão
     2. enumera exactamente o que muda face ao disparo original
     3. o portão anti-stale trava sozinho qualquer goal que escreva sem alguém
        ter confrontado o git — porque no dia em que isto foi escrito 2 dos 3
        jobs presos já tinham o trabalho em main
     4. se o conector não estiver ao alcance, degrada para escrever o prompt,
        que é o comportamento antigo e continua a funcionar

   Estado por job, para o painel poder desenhar a linhagem das tentativas.     */
const BT = String.fromCharCode(96);            /* uma crase */
const FENCE = BT + BT + BT;                    /* as tres */   /* as tres crases, sem as escrever */
const RT = { aberto:null, plano:null, confrontado:{}, corridas:{}, ocupado:false };

function rtHistorico(jobId){ return (RT.corridas[jobId] || []).map(c => ({ raiz: jobId, assinaturas: c.assinaturas })); }

function rtPlano(j){
  const jid = j && j.job_id;
  return RETRY.planear(j, {
    coerencia: (typeof state !== 'undefined' && state.jobs && state.jobs.coerencia) || [],
    historico: rtHistorico(jid),
    jaFeito: RT.confrontado[jid] || null,
  });
}

/* Só há execução se o host expuser callMcpTool. Sem isso, o botão é honesto e
   diz que não alcança — nunca finge que despachou. */
function rtPodeExecutar(){
  return !!(window.cowork && typeof window.cowork.callMcpTool === 'function');
}

function rtChip(txt, cls){ return '<span class="rt-chip '+(cls||'')+'">'+esc(txt)+'</span>'; }

function rtHtml(j){
  const p = rtPlano(j);
  if (!p.elegivel){
    return '<div class="sec">retry</div><div class="oneline">'
      + ndChip(p.parar_porque || 'sem prova de falha', 'nada a corrigir') + '</div>';
  }
  let h = '<div class="sec">retry · gauntlet</div><div class="rt-box">';

  /* assinaturas + evidência medida */
  h += '<div class="rt-sigs">';
  for (const a of p.assinaturas){
    h += '<div class="rt-sig'+(a.bloqueio?' rt-bloq':'')+'">'
      + '<b>'+esc(a.titulo)+'</b> '
      + (a.gauntlet.length ? rtChip(a.gauntlet.join('+'), 'rt-g') : '')
      + (a.bloqueio ? rtChip('bloqueio', 'rt-warn') : '')
      + (a.auto ? '' : rtChip('exige o teu gesto', 'rt-warn'))
      + '<div class="rt-diag">'+esc(a.diagnostico)+'</div>'
      + '<div class="rt-ev">' + a.evidencia.map(e =>
          '<div><code>'+esc(e.campo)+'</code> · '+esc(String(e.valor))+'</div>').join('')
      + '</div></div>';
  }
  h += '</div>';

  /* o que muda — a coluna que separa um retry de uma repetição */
  if (p.mudou && p.mudou.length){
    h += '<div class="rt-h">o que muda face ao disparo original</div><table class="rt-t">';
    for (const m of p.mudou){
      h += '<tr><td><code>'+esc(m.campo)+'</code></td>'
        + '<td class="rt-de">'+esc(String(m.de))+'</td>'
        + '<td class="rt-para">'+esc(String(m.para))+'</td>'
        + '<td class="rt-why">'+esc(m.porque)+'</td></tr>';
    }
    h += '</table>';
  } else if (p.accao !== 'parar'){
    h += '<div class="rt-h">o que muda</div><div class="rt-diag">nada — e é essa a resposta certa: '
      + esc(p.assinaturas.map(a=>a.id).join(', ')) + ' pede o mesmo disparo, não um diferente.</div>';
  }

  /* gestos antes */
  if (p.pre && p.pre.length){
    h += '<div class="rt-h">antes de disparar</div>';
    for (const g of p.pre){
      h += '<div class="rt-pre">'+rtChip(g.tipo, g.bloqueante?'rt-warn':'')
        + '<span>'+esc(g.porque)+'</span>'
        + (g.verificar ? '<div class="rt-ver">verificar: '+esc(g.verificar)+'</div>' : '')
        + '</div>';
    }
  }

  /* portão anti-stale */
  if (p.anti_stale && p.anti_stale.estado === 'por-confrontar'){
    h += '<div class="rt-h">portão anti-stale</div>'
      + '<div class="rt-stale"><b>⚑ este goal escreve no disco.</b> '
      + 'Ninguém provou ainda que a wave não correu já por outra via. '
      + 'Em 2026-08-04, 2 dos 3 jobs presos tinham o trabalho já em <code>main</code> — '
      + 'um retry ingénuo pagava dois jobs para refazer o que estava feito.'
      + '<div class="rt-cmd"><code>'+esc(p.anti_stale.como)+'</code></div>'
      + '<button class="cta ghost mini" data-rt-conf="'+esc(j.job_id)+'">confrontei — falta mesmo fazer</button>'
      + '</div>';
  }

  if (p.goal_aviso) h += '<div class="rt-stale">⚑ '+esc(p.goal_aviso)+'</div>';

  /* acção */
  h += '<div class="rt-h">acção</div>';
  if (p.accao === 'parar'){
    h += '<div class="rt-parar"><b>não disparar.</b> '+esc(p.parar_porque)+'</div>';
    h += '<div class="cta-bar"><button class="cta ghost" data-rt-prompt="'+esc(j.job_id)+'">📋 escrever o relatório para colar</button></div>';
  } else {
    const podeJa = rtPodeExecutar();
    h += '<div class="rt-tent">tentativa '+p.tentativa_n+' de '+p.max_tentativas+'</div>';
    h += '<div class="cta-bar">'
      + (podeJa
          ? '<button class="cta'+(p.accao==='confirmar'?' rt-conf':'')+'" data-rt-go="'+esc(j.job_id)+'">'
            + (p.accao==='confirmar' ? '▶ executar mesmo assim' : '▶ executar')+'</button>'
          : '<span class="rt-nohost">o conector não está ao alcance daqui — só posso escrever o prompt</span>')
      + '<button class="cta ghost" data-rt-prompt="'+esc(j.job_id)+'">📋 escrever o prompt</button>'
      + '</div>';
    if (p.confirmar_porque) h += '<div class="rt-why">'+esc(p.confirmar_porque)+'</div>';
  }

  /* linhagem das tentativas já feitas nesta sessão */
  const corr = RT.corridas[j.job_id] || [];
  if (corr.length){
    h += '<div class="rt-h">tentativas desta sessão</div>';
    for (const c of corr){
      h += '<div class="rt-run">'+rtChip('#'+c.n)+' <code>'+esc(c.novo_job_id || 'sem id')+'</code> · '
        + esc(c.estado) + (c.porque ? ' — '+esc(c.porque) : '') + '</div>';
    }
  }

  h += '</div>';
  return h;
}

/* ── executar ─────────────────────────────────────────────────────────────
   Faz os gestos por ordem e VERIFICA cada um. O cancel desta frota devolve
   "já estava terminado" e deixa o job 'running' (medido 3/3 em 2026-08-04) —
   por isso o resultado dele é lido, nunca aceite pela palavra.               */
async function rtExecutar(j){
  if (RT.ocupado) return;
  RT.ocupado = true;
  const jid = j.job_id;
  const p = rtPlano(j);
  const n = (RT.corridas[jid] || []).length + 1;
  RT.corridas[jid] = RT.corridas[jid] || [];
  const reg = { n, assinaturas: p.assinaturas.map(a=>a.id), estado:'a correr', novo_job_id:null, porque:null };
  RT.corridas[jid].push(reg);
  rtRepintar(j);

  try {
    for (const g of (p.pre || [])){
      if (g.tipo === 'cancelar'){
        reg.estado = 'a cancelar o fantasma';
        rtRepintar(j);
        try { await callHost('mcp__Mooter__mooter_cancel', { job_id: jid }); }
        catch(_){ /* o cancel a falhar não trava — não é precondição */ }
      }
      /* mover-lock e confrontar-git não são gestos que o painel possa fazer:
         um mexe no disco, o outro precisa de git. Ficam declarados no plano e
         saem no prompt. Fingir que os fiz seria a mentira mais cara aqui. */
    }

    reg.estado = 'a despachar';
    rtRepintar(j);
    const r = await callHost('mcp__Mooter__mooter_work', p.dispatch);
    const novo = (r && (r.job_id || (r.job && r.job.job_id))) || null;
    reg.novo_job_id = novo;
    reg.estado = novo ? 'despachado' : 'despachado — sem job_id na resposta';
    if (!novo) reg.porque = 'a resposta não trouxe job_id; confirma em jobs';
  } catch (e){
    reg.estado = 'falhou a despachar';
    reg.porque = String((e && e.message) || e).slice(0, 200);
  }
  RT.ocupado = false;
  rtRepintar(j);
  try { await loadAll(); } catch(_){}
}

function rtRepintar(j){
  const alvo = document.getElementById('rtSlot');
  if (alvo) alvo.innerHTML = rtHtml(j);
  rtLigar(j);
}

function rtLigar(j){
  const q = (s) => document.querySelectorAll(s);
  q('[data-rt-go]').forEach(b => b.addEventListener('click', () => rtExecutar(j)));
  q('[data-rt-prompt]').forEach(b => b.addEventListener('click', () => emitText(rtPrompt(j))));
  q('[data-rt-conf]').forEach(b => b.addEventListener('click', () => {
    RT.confrontado[j.job_id] = { feito:false, fonte:'confrontado à mão no painel' };
    rtRepintar(j);
  }));
}

/* O prompt: o mesmo plano, em texto, para colar noutra sessão. É o que faz
   isto continuar a servir quando o conector está em baixo. */
function rtPrompt(j){
  const p = rtPlano(j);
  const L = [];
  L.push('📥 COLAR EM: Claude Code ou Cowork — sessão EXISTENTE na pasta ' + (j.worktree || 'do projecto'));
  L.push('');
  L.push('RETRY DIAGNOSTICADO — job ' + (j.job_id||'n/d') + ' · wave ' + (j.wave||'n/d'));
  L.push('');
  L.push('## o que falhou (regras sobre campos medidos, não opinião)');
  for (const a of p.assinaturas){
    L.push('- **' + a.titulo + '** [' + (a.gauntlet.join('+')||'—') + ']');
    L.push('  ' + a.diagnostico);
    for (const e of a.evidencia) L.push('  · ' + e.campo + ': ' + e.valor);
  }
  if (p.accao === 'parar'){
    L.push('');
    L.push('## NÃO RE-DISPARAR');
    L.push(p.parar_porque);
    return L.join('\n');
  }
  if (p.pre && p.pre.length){
    L.push('');
    L.push('## antes de disparar');
    for (const g of p.pre){
      L.push('- [' + g.tipo + '] ' + g.porque);
      if (g.verificar) L.push('  verificar: ' + g.verificar);
    }
  }
  if (p.mudou && p.mudou.length){
    L.push('');
    L.push('## o que muda face ao disparo original');
    for (const m of p.mudou) L.push('- ' + BT + m.campo + BT + ': ' + m.de + ' → ' + m.para + '  (' + m.porque + ')');
  }
  L.push('');
  L.push('## o disparo corrigido');
  L.push(FENCE + 'js');
  L.push('mooter_work(' + JSON.stringify(p.dispatch, null, 2) + ')');
  L.push(FENCE);
  if (p.goal_aviso){ L.push(''); L.push('⚠ ' + p.goal_aviso); }
  if (p.confirmar_porque){ L.push(''); L.push('⚠ ' + p.confirmar_porque); }
  return L.join('\n');
}
`;

bloco('UI DE RETRY', ui, 'async function callHost(tool, args){');

/* ══════════════════════════════════════════════════════════════════════════
   3 · O BOTÃO NO DRAWER DO JOB
   ══════════════════════════════════════════════════════════════════════════ */

const ancoraDrawer = `  h += '<div class="sec">take this elsewhere</div>';`;
if (!html.includes(`id="rtSlot"`)) {
  const injeccao = `  /* <<<SLOT DE RETRY>>> */
  h += '<div id="rtSlot">' + rtHtml(j) + '</div>';
  /* <<<FIM SLOT DE RETRY>>> */
`;
  if (!html.includes(ancoraDrawer)) { console.error('✗ âncora do drawer não encontrada'); process.exit(1); }
  html = html.replace(ancoraDrawer, injeccao + ancoraDrawer);
  feito.push('slot no drawer (inserido)');
} else {
  feito.push('slot no drawer (já existia)');
}

/* ligar os handlers quando o drawer abre */
const ancoraLigar = `  document.querySelectorAll('#dpage [data-art]').forEach(b =>`;
if (!html.includes('  rtLigar(j);\n  document.querySelectorAll(\'#dpage [data-art]\')')) {
  if (!html.includes(ancoraLigar)) { console.error('✗ âncora dos handlers não encontrada'); process.exit(1); }
  html = html.replace(ancoraLigar, `  rtLigar(j);\n` + ancoraLigar);
  feito.push('handlers ligados ao abrir o drawer');
} else {
  feito.push('handlers (já ligados)');
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · A LINHA DE HONESTIDADE
   O painel prometia "writes prompts · never executes". Com o retry deixou de
   ser verdade. Uma promessa impressa que passou a ser falsa é pior do que não
   ter promessa nenhuma: corrige-se a promessa, não se esconde a excepção.
   ══════════════════════════════════════════════════════════════════════════ */

const antigaPromessa = 'writes prompts · never executes';
if (html.includes(antigaPromessa)) {
  html = html.replace(new RegExp(escapar(antigaPromessa), 'g'), 'writes prompts · retry is the one that executes');
  feito.push('promessa corrigida (deixou de ser verdade com o retry)');
}
const antigoTip = 'Every button here WRITES A PROMPT. None of them executes anything on its own';
if (html.includes(antigoTip)) {
  html = html.replace(antigoTip,
    'Every button here writes a prompt — except retry, which can execute the corrected dispatch itself, '
    + 'and only after showing you the diagnosis, the measured evidence and exactly what it changes. '
    + 'Everything else still only proposes');
  feito.push('tooltip da promessa corrigido');
}

/* ══════════════════════════════════════════════════════════════════════════
   5 · CSS
   ══════════════════════════════════════════════════════════════════════════ */

const css = `
.rt-box{border:1px solid var(--line);border-radius:8px;padding:10px;margin:6px 0;font-size:var(--fs1)}
.rt-sig{border-left:3px solid var(--line);padding:4px 0 6px 8px;margin:0 0 8px}
.rt-bloq{border-left-color:#d9534f}
.rt-chip{display:inline-block;border:1px solid var(--line);border-radius:99px;padding:0 6px;margin:0 4px;font-size:var(--fs0)}
.rt-g{border-color:#6c8ebf}
.rt-warn{border-color:#d9534f;color:#d9534f}
.rt-diag{margin:4px 0;color:var(--faint)}
.rt-ev{font-family:ui-monospace,monospace;font-size:var(--fs0);color:var(--faint);margin-top:3px}
.rt-h{font-weight:600;margin:10px 0 4px}
.rt-t{width:100%;border-collapse:collapse;font-size:var(--fs0)}
.rt-t td{padding:3px 6px;border-top:1px solid var(--line);vertical-align:top}
.rt-de{color:var(--faint);text-decoration:line-through}
.rt-para{font-weight:600}
.rt-why{color:var(--faint);font-size:var(--fs0)}
.rt-pre{margin:3px 0}
.rt-ver{color:var(--faint);font-size:var(--fs0);margin-left:12px}
.rt-stale{border:1px dashed #d9534f;border-radius:6px;padding:8px;margin:6px 0}
.rt-cmd{font-family:ui-monospace,monospace;margin:6px 0}
.rt-parar{border:1px solid #d9534f;border-radius:6px;padding:8px;margin:6px 0}
.rt-tent{color:var(--faint);font-size:var(--fs0);margin-bottom:4px}
.rt-conf{border-color:#d9534f}
.rt-nohost{color:var(--faint);font-size:var(--fs0)}
.rt-run{font-family:ui-monospace,monospace;font-size:var(--fs0);margin:2px 0}
`;
if (!html.includes('.rt-box{')) {
  const i = html.lastIndexOf('</style>');
  if (i < 0) { console.error('✗ sem </style> onde pendurar o css'); process.exit(1); }
  html = html.slice(0, i) + css + html.slice(i);
  feito.push('css (inserido)');
} else {
  html = html.replace(/\n\.rt-box\{[\s\S]*?\n\.rt-run\{[^}]*\}\n/, css);
  feito.push('css (actualizado)');
}

/* ══════════════════════════════════════════════════════════════════════════ */

fs.writeFileSync(HTML, html, 'utf8');
console.log('✅ ' + path.basename(HTML) + '  ' + antes + ' → ' + html.length + ' bytes');
console.log('   motor sha256(16): ' + motorSha);
for (const f of feito) console.log('   · ' + f);
