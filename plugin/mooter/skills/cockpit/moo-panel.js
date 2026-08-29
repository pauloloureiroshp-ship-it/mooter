/* ============================================================
   MOO — motor. Ver a doutrina no topo do bloco HTML.
   Regra de ouro deste ficheiro: NADA aqui pode derrubar o Cockpit.
   Tudo o que toca no `state` do painel passa por sonda(); tudo o que
   corre no arranque está dentro de try/catch com falha visível.
   ============================================================ */
(function(){
'use strict';

/* ---------- 0. utilitários locais (não dependem do cockpit) ---------- */
const E = s => String(s==null?'':s)
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
const D = id => document.getElementById(id);
const KB = (typeof MOO_KB !== 'undefined') ? MOO_KB : { entradas:[], categorias:[] };

const COW = (typeof COW_INLINE === 'string' && COW_INLINE.indexOf('<svg') === 0)
  ? COW_INLINE
  : '<svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">'
  + '<ellipse cx="16" cy="19" rx="10" ry="8.5" fill="#D9C7A8"/>'
  + '<path d="M6 12c-2-2-3-5-1-6s4 1 5 3zM26 12c2-2 3-5 1-6s-4 1-5 3z" fill="#C9B190"/>'
  + '<ellipse cx="16" cy="22.5" rx="5" ry="4" fill="#E8B4B8"/>'
  + '<circle cx="13.2" cy="22" r=".9" fill="#7A5B5E"/><circle cx="18.8" cy="22" r=".9" fill="#7A5B5E"/>'
  + '<circle cx="12" cy="16" r="1.5" fill="#2E2A26"/><circle cx="20" cy="16" r="1.5" fill="#2E2A26"/>'
  + '<path d="M9 13c1.5-1.5 4-2 6-1M23 13c-1.5-1.5-4-2-6-1" stroke="#B49B78" stroke-width="1.2" fill="none" stroke-linecap="round"/>'
  + '</svg>';

/* ---------- 1. estado do Moo (memória de sessão, zero storage) ---------- */
const MOO = {
  aberto:false, cat:null, turnos:0,
  lacunas:[],            // perguntas sem resposta nesta sessão
  vistas:{},             // id → nº de vezes aberta (reordena os destaques)
  rejeitadas:[],         // entradas da KB sem fonte — rejeitadas no arranque
  idx:null, N:0, df:null
};

/* ---------- 2. normalização e tokenização ---------- */
const STOP = new Set(('o a os as um uma uns umas de do da dos das em no na nos nas por para com sem sob ' +
  'que qual quais quanto quantos como onde quando porque porquê pq e ou mas se ao aos à às pelo pela ' +
  'este esta esse essa isto isso aquele aquela meu minha teu tua seu sua eu tu ele ela nos vos eles elas ' +
  'ser estar ter haver e foi era sao são é sao tem tenho posso pode podes devo deve quero queria ' +
  'the a an of in on for to with is are was were be do does did i you it this that what which how why ' +
  'when where can could should would my your me').split(/\s+/));

function norm(s){
  return String(s==null?'':s)
    .normalize('NFD').replace(/[̀-ͯ]/g,'')   // tira acentos: "porquê" == "porque"
    .toLowerCase();
}
function tok(s){
  const out = [];
  for (const t of norm(s).split(/[^a-z0-9_.:-]+/)){
    if (!t || t.length < 2) continue;
    if (STOP.has(t)) continue;
    out.push(t);
    // um token com pontuação técnica vale também partido: "classify.js" → "classify","js"
    if (/[._:-]/.test(t)) for (const p of t.split(/[._:-]+/)) if (p.length >= 3 && !STOP.has(p)) out.push(p);
  }
  return out;
}

/* ---------- 3. índice: q ×3, título ×2, corpo ×1 ---------- */
function construirIndice(){
  const validas = [], df = Object.create(null);
  for (const e of KB.entradas){
    if (!e || !Array.isArray(e.src) || e.src.length === 0){
      MOO.rejeitadas.push((e && e.id) || '(sem id)');   // invariante 3: sem fonte, sem entrada
      continue;
    }
    const tf = Object.create(null);
    const add = (txt, w) => { for (const t of tok(txt)) tf[t] = (tf[t]||0) + w; };
    (e.q||[]).forEach(v => add(v, 3));
    add(e.title, 2);
    add(e.a, 1);
    add(e.porque_importa || '', 1);
    add(e.cat, 1);
    e._tf = tf;
    e._max = Math.max(1, ...Object.values(tf));
    for (const t in tf) df[t] = (df[t]||0) + 1;
    validas.push(e);
  }
  MOO.idx = validas; MOO.N = validas.length; MOO.df = df;
}
const idf = t => Math.log(1 + MOO.N / (1 + (MOO.df[t]||0)));

/* Score normalizado 0..1. O denominador é o melhor caso possível para ESTA
   pergunta (todos os tokens a bater com peso 3), por isso o limiar é
   comparável entre perguntas curtas e longas — sem isto, uma pergunta de
   uma palavra passa sempre e uma de dez nunca passa. */
const LIMIAR = 0.17;

function procurar(pergunta){
  const qs = tok(pergunta);
  if (!qs.length) return [];
  const teto = qs.reduce((s,t) => s + 3*idf(t), 0) || 1;
  const nq = norm(pergunta).replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
  const res = [];
  for (const e of MOO.idx){
    let s = 0, batidos = 0;
    for (const t of qs){
      const w = e._tf[t];
      if (w){ s += Math.min(w,3) * idf(t); batidos++; }
    }
    if (!batidos) continue;
    // bónus de frase: a pergunta inteira aparece numa das variantes declaradas
    if (nq.length >= 6 && (e.q||[]).some(v => norm(v).indexOf(nq) >= 0)) s += teto * 0.45;
    // cobertura: metade dos tokens a bater vale mais do que um token raro a bater muito
    s *= (0.55 + 0.45 * (batidos / qs.length));
    res.push({ e, score: s/teto, batidos, total: qs.length });
  }
  res.sort((a,b) => b.score - a.score || (MOO.vistas[b.e.id]||0) - (MOO.vistas[a.e.id]||0));
  return res;
}

/* ---------- 4. markdown-lite (escapa SEMPRE antes de formatar) ---------- */
function inline(s){
  return E(s)
    .replace(/`([^`]+)`/g, (m,c) => '<code>'+c+'</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>');
}
function mdLite(src){
  const linhas = String(src||'').split('\n');
  let h = '', i = 0;
  while (i < linhas.length){
    const l = linhas[i];
    if (/^```/.test(l)){                                   // bloco de código
      let c = ''; i++;
      while (i < linhas.length && !/^```/.test(linhas[i])) c += linhas[i++] + '\n';
      i++; h += '<pre><code>' + E(c.replace(/\n$/,'')) + '</code></pre>'; continue;
    }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|[\s:|-]+\|\s*$/.test(linhas[i+1]||'')){   // tabela
      const cel = r => r.trim().replace(/^\||\|$/g,'').split('|').map(c => c.trim());
      const ths = cel(l); i += 2;
      let t = '<table><thead><tr>' + ths.map(c => '<th>'+inline(c)+'</th>').join('') + '</tr></thead><tbody>';
      while (i < linhas.length && /^\s*\|.*\|\s*$/.test(linhas[i])){
        t += '<tr>' + cel(linhas[i++]).map(c => '<td>'+inline(c)+'</td>').join('') + '</tr>';
      }
      h += t + '</tbody></table>'; continue;
    }
    if (/^\s*[-*]\s+/.test(l)){                            // lista
      let u = '<ul>';
      while (i < linhas.length && /^\s*[-*]\s+/.test(linhas[i]))
        u += '<li>' + inline(linhas[i++].replace(/^\s*[-*]\s+/,'')) + '</li>';
      h += u + '</ul>'; continue;
    }
    if (/^\s*>\s?/.test(l)){                               // citação
      let q = '';
      while (i < linhas.length && /^\s*>\s?/.test(linhas[i])) q += linhas[i++].replace(/^\s*>\s?/,'') + ' ';
      h += '<div class="moo-why">' + inline(q.trim()) + '</div>'; continue;
    }
    if (!l.trim()){ i++; continue; }
    let p = '';                                            // parágrafo
    while (i < linhas.length && linhas[i].trim()
           && !/^```/.test(linhas[i]) && !/^\s*[-*]\s+/.test(linhas[i])
           && !/^\s*>\s?/.test(linhas[i]) && !/^\s*\|.*\|\s*$/.test(linhas[i]))
      p += linhas[i++] + ' ';
    h += '<p>' + inline(p.trim()) + '</p>';
  }
  return h;
}

/* ---------- 5. sonda ao estado vivo do Cockpit ---------- */
/* NUNCA acede ao `state` sem rede: se o Cockpit mudar de forma, o Moo
   degrada para n/d em vez de rebentar. */
function sonda(fn, def){ try{ const v = fn(); return (v===undefined||v===null) ? def : v; }catch(e){ return def; } }
const S = () => (typeof state !== 'undefined' && state) ? state : {};

/* A cascata do codex (loadAll) regista qual das 3 fontes venceu.
   O Moo TEM de a ler: em modo snapshot, dizer "agora" sobre um número
   congelado é a mesma mentira que o painel existe para matar. */
function fonteActiva(){
  const src = sonda(() => S().source, null);
  const at  = sonda(() => S().sourceAt, null);
  const falhas = sonda(() => S().sourceFailures, null);
  if (src === 'snapshot'){
    const q = at ? new Date(at) : null;
    const hh = q && !isNaN(q) ? q.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : null;
    return { k:'snapshot', quando: hh, rot: hh ? 'fotografia de ' + hh : 'fotografia congelada',
             prefixo: hh ? 'na fotografia de ' + hh + ':' : 'na fotografia:' };
  }
  if (src) return { k:'vivo', fonte: src, rot: src + ' · leitura viva', prefixo: 'agora:' };
  if (falhas && (Array.isArray(falhas) ? falhas.length : Object.keys(falhas).length))
    return { k:'falhou', rot:'nenhuma das fontes respondeu', prefixo:'sem leitura:' };
  return { k:'a-ler', rot:'ainda a escolher a fonte', prefixo:'sem leitura:' };
}

function fundo(caminho){                   // procura um caminho pontuado nas 4 vistas
  const partes = caminho.split('.');
  for (const v of ['jobs','board','recibo','pastas']){
    let n = sonda(() => S()[v], null);
    if (!n) continue;
    let ok = true;
    for (const p of partes){ if (n && Object.prototype.hasOwnProperty.call(n,p)) n = n[p]; else { ok = false; break; } }
    if (ok && n !== undefined && n !== null) return n;
  }
  return null;
}

function jobsVivos(){
  const js = sonda(() => (typeof jobsCanon === 'function') ? jobsCanon() : (S().jobs && S().jobs.jobs), []) || [];
  return Array.isArray(js) ? js : [];
}
function presos(){
  return jobsVivos().filter(j => {
    if (typeof realState === 'function'){
      const r = sonda(() => realState(j), null);
      const lab = r && (r.label || r.estado || r.state || r);
      if (typeof lab === 'string') return /parad|stall|aprova|approval/i.test(lab);
    }
    const ec = String((j && j.exit_code) || '');
    const st = String((j && (j.state || j.last)) || '');
    return /agent-awaiting-approval/i.test(ec) || (st === 'running' && /parado/i.test(String(sonda(()=>j.estimativa.vivo.estado,''))));
  });
}
function excepcoes(){
  const x = fundo('scorecard.excepcoes') || fundo('excepcoes');
  return Array.isArray(x) ? x : [];
}
function metrica(nome){ return fundo('scorecard.metricas.' + nome); }

/* quantos avisos justificam o ponto vermelho no botão */
function pendencias(){ return presos().length + excepcoes().length; }

/* ---------- 6. CTAs vivos: só existem se o dado existir ---------- */
function ctasVivos(entry){
  const cs = [];
  const gancho = entry && entry.live;
  const F = fonteActiva();
  const AG = F.prefixo;   // "agora:" só quando a leitura é mesmo viva

  if (gancho === 'stalled'){
    const ps = presos();
    if (ps.length){
      const j = ps[0];
      const jid = (j && (j.job_id || j.id)) || '';
      cs.push({ t:'focus', alvo:'cycEl', label:'▤ ver o log — ' + ps.length + ' preso(s) ' + (F.k==='snapshot' ? 'na fotografia' : 'agora') });
      if (jid) cs.push({ t:'copy', label:'📋 prompt para destravar ' + jid.slice(0,18),
        txt:'📥 COLAR EM: Claude Code · sessão FRESCA na pasta do projecto\n\n'
          + 'O job `' + jid + '` está em `running` mas não avança (suspeita: agent-awaiting-approval, ou registo preso).\n'
          + 'Confirma pelo ledger em ~/.mooter/jobs/ se o processo real ainda existe.\n'
          + 'Se não existir, o registo é que está preso — diz-me qual dos dois e não mates nada sem me dizer.\n'
          + 'Não uses `git add -A`. Não toques em tools/router/classify.js.' });
    } else {
      cs.push({ t:'nota', label:'✓ nenhum job preso nesta sessão, agora' });
    }
  }

  if (gancho === 'trabalho_zero'){
    const m = metrica('trabalho_zero_pct');
    if (m && m.valor != null){
      const fora = m.estado === 'fora';
      cs.push({ t:'nota', label:(fora?'⚠ ':'✓ ') + AG + ' ' + m.valor + '% · ' + (m.porque||'') });
      if (fora) cs.push({ t:'ask', label:'→ porque é que o local não pega?', alvo:'prep-circuit-breaker' });
    } else {
      cs.push({ t:'nota', label:'◌ n/d — o board ainda não respondeu nesta sessão' });
    }
  }

  if (gancho === 'gpu'){
    const g = fundo('gpu');
    if (g && g.live){
      const v = g.headroom && g.headroom.verdict;
      cs.push({ t:'nota', label:AG + ' ' + (g.name||'GPU') + ' · ' + g.live.util_pct + '% util · '
        + (g.headroom && g.headroom.free_mb != null ? g.headroom.free_mb + ' MB livres' : '◌ n/d')
        + (v ? ' · ' + v : '') });
    } else cs.push({ t:'nota', label:'◌ n/d — sem leitura de GPU nesta sessão' });
  }

  if (gancho === 'quota'){
    const q = metrica('pressao_quota');
    if (q) cs.push({ t:'nota', label: q.valor != null
      ? AG + ' pressão ' + q.valor + ' · ' + (q.estado||'')
      : '◌ n/d — ' + (q.porque||'sem medição') });
  }

  return cs;
}

/* ---------- 7. render ---------- */
function chipsFonte(e){
  /* O chip mostra o nome do ficheiro; o caminho inteiro vive no tooltip
     junto com a citação literal. `plugin/mooter/skills/cockpit/SKILL.md:51`
     comia uma linha inteira do painel e empurrava os CTAs para fora de vista —
     e o que interessa a quem lê é "isto veio do SKILL.md", não a árvore. */
  return '<div class="moo-src"><span class="moo-srclab">fonte</span>'
    + e.src.map(s => {
        const nome = String(s.file||'').split('/').pop();
        const tip = String(s.file||'') + (s.line ? ':' + s.line : '')
          + (s.quote ? '\n\n\u201c' + String(s.quote).slice(0,260) + '\u201d' : '');
        return '<span class="moo-srcchip" tabindex="0" data-tip="' + E(tip) + '">'
          + E(nome) + (s.line ? ':' + s.line : '') + '</span>';
      }).join('')
    + '</div>';
}
function htmlCTAs(cs){
  if (!cs.length) return '';
  return '<div class="moo-ctas">' + cs.map((c,i) => {
    if (c.t === 'nota') return '<span class="moo-cta done" style="cursor:default">' + E(c.label) + '</span>';
    const cls = c.t === 'copy' ? 'moo-cta prim' : (c.escreve ? 'moo-cta warnw' : 'moo-cta');
    return '<button type="button" class="' + cls + '" data-cta="' + i + '">' + E(c.label) + '</button>';
  }).join('') + '</div>';
}
function ligarCTAs(el, cs){
  el.querySelectorAll('[data-cta]').forEach(b => {
    const c = cs[+b.dataset.cta];
    b.addEventListener('click', () => {
      if (c.t === 'copy') copiar(c.txt, b);
      else if (c.t === 'focus') focar(c.alvo);
      else if (c.t === 'ask') abrirEntrada(c.alvo);
    });
  });
}

function bolha(q){
  const d = document.createElement('div');
  d.className = 'moo-q'; d.textContent = q;
  D('mooBody').appendChild(d);
}

function responder(entry, meta){
  MOO.vistas[entry.id] = (MOO.vistas[entry.id]||0) + 1;
  const cs = ctasVivos(entry);
  const rel = (entry.rel||[]).map(id => MOO.idx.find(x => x.id === id)).filter(Boolean);
  const d = document.createElement('div');
  d.className = 'moo-a';
  d.setAttribute('role','group');
  d.innerHTML =
      '<h4>' + E(entry.title) + '</h4>'
    + mdLite(entry.a)
    + (entry.porque_importa ? '<div class="moo-why"><b>porque importa —</b> ' + inline(entry.porque_importa) + '</div>' : '')
    + chipsFonte(entry)
    + htmlCTAs(cs)
    + (rel.length ? '<div class="moo-sec">a seguir</div><div class="moo-chips">'
        + rel.map(r => '<button type="button" class="moo-chip" data-go="' + E(r.id) + '">'
            + E(r.title) + '</button>').join('') + '</div>' : '')
    + (meta && meta.debug ? '<div class="moo-foot-meta" style="text-align:left">'
        + E(meta.debug) + '</div>' : '');
  D('mooBody').appendChild(d);
  ligarCTAs(d, cs);
  d.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => { bolha(b.textContent); abrirEntrada(b.dataset.go); }));
  fim();
}

function naoSei(pergunta, perto){
  MOO.lacunas.push(pergunta);
  const prompt =
      '📥 COLAR EM: Claude Code · sessão FRESCA na pasta do repo Mooter\n\n'
    + 'Falta uma entrada na base de conhecimento do Moo.\n\n'
    + 'Pergunta que ficou sem resposta: "' + pergunta + '"\n\n'
    + 'Acrescenta uma entrada a `plugin/mooter/skills/cockpit/moo-kb.json` com:\n'
    + '- `q`: 4 a 6 variantes reais de como isto se pergunta (PT e EN)\n'
    + '- `a`: a resposta, curta, em PT-BR\n'
    + '- `src`: pelo menos uma fonte file:line VERIFICÁVEL no repo (sem isto a entrada é rejeitada no arranque)\n'
    + '- `rel`: 2 ou 3 ids de entradas vizinhas\n\n'
    + 'Depois corre `node plugin/mooter/skills/cockpit/build-moo-kb.js` para reinjectar no cockpit.html\n'
    + 'e `node plugin/mooter/skills/cockpit/cockpit-invariants.test.js plugin/mooter/skills/cockpit/cockpit.html`.\n'
    + 'Stage selectivo — nunca `git add -A`.';

  const cs = [
    { t:'copy', label:'📋 prompt para criar esta entrada', txt:prompt },
    { t:'focus', alvo:'actEl', label:'▤ ver skills & actions' }
  ];
  const d = document.createElement('div');
  d.className = 'moo-a miss';
  d.innerHTML =
      '<h4>Não tenho isto na base.</h4>'
    + '<p>Procurei por <code>' + E(tok(pergunta).join(' ')||'—') + '</code> nas <b>' + MOO.N
    + '</b> entradas e nenhuma passou o limiar. Prefiro dizer isto a dar-te a entrada menos má '
    + 'com ar de resposta.</p>'
    + (perto.length
        ? '<div class="moo-sec">o mais perto que tenho</div><div class="moo-chips">'
          + perto.map(r => '<button type="button" class="moo-chip" data-go="' + E(r.e.id) + '">'
              + E(r.e.title) + ' <span class="cg">' + Math.round(r.score*100) + '%</span></button>').join('')
          + '</div>'
        : '')
    + htmlCTAs(cs)
    + '<div class="moo-foot-meta" style="text-align:left">lacunas nesta sessão: <b>' + MOO.lacunas.length + '</b>'
    + ' · isto não é guardado em lado nenhum (o artifact não tem storage) — o prompt acima é como persiste.</div>';
  D('mooBody').appendChild(d);
  ligarCTAs(d, cs);
  d.querySelectorAll('[data-go]').forEach(b =>
    b.addEventListener('click', () => { bolha(b.textContent.replace(/\s*\d+%$/,'')); abrirEntrada(b.dataset.go); }));
  fim();
}

function abrirEntrada(id){
  const e = MOO.idx.find(x => x.id === id);
  if (e) responder(e); else naoSei(id, []);
}

function perguntar(txt){
  const q = String(txt||'').trim();
  if (!q) return;
  MOO.turnos++;
  bolha(q);
  const r = procurar(q);
  const top = r[0];
  if (top && top.score >= LIMIAR) responder(top.e, { debug: null });
  else naoSei(q, r.slice(0,3).filter(x => x.score > 0.02));
}

/* ---------- 8. ecrã inicial ---------- */
function estadoVivo(){
  const js = jobsVivos(), ps = presos(), xs = excepcoes();
  const F = fonteActiva();
  const semDados = !js.length && !xs.length && !fundo('scorecard');
  if (semDados){
    /* ⚠️ A 1ª versão dizia sempre "sem leitura — carrega em Refresh".
       Com a cascata de 3 fontes isso passou a ser falso de duas maneiras:
       o painel pode estar AINDA a escolher a fonte, e em modo snapshot
       ele LEU (de uma fotografia) — mandar carregar em Refresh não ajuda
       e faz o utilizador procurar um problema que não existe. */
    const msg = F.k === 'a-ler'
      ? '◌ o painel ainda está a escolher a fonte — volta num instante.'
      : (F.k === 'snapshot'
          ? '◌ ' + F.rot + ' sem jobs na janela. Não é falta de leitura: é o que a fotografia tinha.'
          : '◌ nenhuma das três fontes respondeu (bridge · http · snapshot). '
            + 'Se acabaste de republicar o artifact, os grants do conector foram limpos — '
            + 're-autoriza o conector no cartão do artifact.');
    return '<div class="moo-live"><span class="lk">esta sessão</span>' + msg + '</div>';
  }
  const custo = sonda(() => fundo('totals.cost_usd').valor, null);
  const tz = metrica('trabalho_zero_pct');
  let h = '<div class="moo-live"><span class="lk">esta sessão · ' + E(F.rot) + '</span>';
  h += '<b>' + js.length + '</b> job(s) na janela';
  h += ' · ' + (ps.length ? '<b class="bad">' + ps.length + ' preso(s)</b>' : '<span class="ok">0 presos</span>');
  if (custo != null) h += ' · <b>$' + Number(custo).toFixed(4) + '</b>';
  if (tz && tz.valor != null) h += ' · GPU local <b class="' + (tz.estado==='fora'?'warn':'ok') + '">' + tz.valor + '%</b>';
  if (xs.length) h += '<br><span class="warn">⚠ ' + xs.length + ' excepção(ões) aberta(s)</span> — '
    + E(xs.map(x => (x.metrica||'?') + ' (' + (x.dono||'?') + ')').join(' · '));
  return h + '</div>';
}

function inicial(){
  const b = D('mooBody');
  const cats = KB.categorias || [];
  const destaques = MOO.idx.filter(e => e.destaque)
    .sort((a,b2) => (MOO.vistas[b2.id]||0) - (MOO.vistas[a.id]||0));
  const lista = MOO.cat ? MOO.idx.filter(e => e.cat === MOO.cat) : destaques;
  const rot = MOO.cat ? (cats.find(c => c.id === MOO.cat)||{}).label : 'comece por aqui';

  b.innerHTML =
      estadoVivo()
    + '<div class="moo-lead">Pergunta em português. Respondo do que está escrito no repo, '
    + 'com a fonte <code>file:line</code> em cada resposta. Se não souber, digo que não sei.</div>'
    + '<div class="moo-chips">'
    + cats.map(c => '<button type="button" class="moo-chip" role="button" data-cat="' + E(c.id) + '"'
        + ' aria-pressed="' + (MOO.cat===c.id?'true':'false') + '">'
        + '<span class="cg">' + E(c.glyph) + '</span>' + E(c.label) + '</button>').join('')
    + (MOO.cat ? '<button type="button" class="moo-chip" data-cat="">✕ limpar</button>' : '')
    + '</div>'
    + '<div class="moo-sec">' + E(rot) + '</div>'
    + lista.map(e => '<button type="button" class="moo-row" data-go="' + E(e.id) + '">'
        + '<span class="rg">›</span>' + E(e.title)
        + '<span class="rs">' + E((e.q&&e.q[0])||'') + '</span></button>').join('')
    + '<div class="moo-foot-meta">' + MOO.N + ' entradas · todas com fonte'
    + (MOO.rejeitadas.length ? ' · <span class="bad">' + MOO.rejeitadas.length
        + ' rejeitada(s) por não terem fonte: ' + E(MOO.rejeitadas.join(', ')) + '</span>' : '')
    + '<br>zero jobs criados · zero linhas no ledger · $0</div>';

  b.querySelectorAll('[data-cat]').forEach(x =>
    x.addEventListener('click', () => { MOO.cat = x.dataset.cat || null; inicial(); }));
  b.querySelectorAll('[data-go]').forEach(x =>
    x.addEventListener('click', () => {
      const e = MOO.idx.find(y => y.id === x.dataset.go);
      b.innerHTML = ''; bolha(e ? e.title : x.dataset.go); abrirEntrada(x.dataset.go);
    }));
}

/* ---------- 9. acções ---------- */
function toast(msg){
  const t = D('mooToast'); if (!t) return;
  t.textContent = msg; t.dataset.on = '1';
  clearTimeout(t._h); t._h = setTimeout(() => { t.dataset.on = '0'; }, 2200);
}
function copiar(txt, botao){
  const ok = () => {
    toast('copiado — cola onde diz 📥 COLAR EM');
    if (botao){ const o = botao.textContent; botao.textContent = '✓ copiado'; botao.classList.add('done');
      setTimeout(() => { botao.textContent = o; botao.classList.remove('done'); }, 1800); }
  };
  const falhou = () => {
    // Falha honesta: em vez de mentir "copiado", mostra o texto seleccionável.
    toast('a área de transferência recusou — texto aberto abaixo');
    const p = document.createElement('pre');
    p.style.cssText = 'white-space:pre-wrap;user-select:all;margin-top:6px';
    p.textContent = txt;
    if (botao && botao.parentNode) botao.parentNode.appendChild(p);
    fim();
  };
  try{
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(ok).catch(() => {
        try{
          const ta = document.createElement('textarea');
          ta.value = txt; ta.style.cssText = 'position:fixed;opacity:0';
          document.body.appendChild(ta); ta.select();
          const r = document.execCommand('copy'); document.body.removeChild(ta);
          r ? ok() : falhou();
        }catch(e){ falhou(); }
      });
    } else falhou();
  }catch(e){ falhou(); }
}
function focar(id){
  const el = D(id);
  if (!el){ toast('esse bloco não está neste painel'); return; }
  try{ if (el.tagName === 'DETAILS') el.open = true; }catch(e){}
  fechar();
  el.scrollIntoView({ behavior:'smooth', block:'start' });
  const b = el.style.boxShadow;
  el.style.boxShadow = '0 0 0 2px var(--terracotta)';
  setTimeout(() => { el.style.boxShadow = b; }, 1600);
}
function fim(){ const b = D('mooBody'); if (b) b.scrollTop = b.scrollHeight; }

function abrir(){
  MOO.aberto = true;
  D('mooPanel').dataset.open = '1';
  D('mooFab').dataset.open = '1';
  D('mooFab').setAttribute('aria-expanded','true');
  if (!MOO.turnos) inicial();
  setTimeout(() => { const i = D('mooInput'); if (i) i.focus(); }, 40);
  pintarPonto();
}
function fechar(){
  MOO.aberto = false;
  D('mooPanel').dataset.open = '0';
  D('mooFab').dataset.open = '0';
  D('mooFab').setAttribute('aria-expanded','false');
  D('mooFab').focus();
  pintarPonto();
}
function pintarPonto(){
  const d = D('mooDot'); if (!d) return;
  const n = sonda(pendencias, 0);
  if (n > 0 && !MOO.aberto){ d.hidden = false; d.textContent = n > 9 ? '9+' : String(n); }
  else d.hidden = true;
}

/* ---------- 10. arranque ---------- */
function arrancar(){
  construirIndice();
  D('mooFab').querySelector('.fabcow').innerHTML = COW;
  D('mooPanel').querySelector('.hcow').innerHTML = COW;
  D('mooSub').textContent = 'suporte · ' + MOO.N + ' entradas · $0, sem modelo';
  D('mooLegal').innerHTML =
      'Respostas por consulta determinística à base do repo — <b>nenhum modelo corre</b>, '
    + 'nenhum job é criado, nada entra no recibo. Não consigo ler esta conversa: '
    + '<code>callMcpTool</code> chega a conectores, não ao transcript.';

  D('mooFab').addEventListener('click', () => MOO.aberto ? fechar() : abrir());
  D('mooClose').addEventListener('click', fechar);
  D('mooSend').addEventListener('click', () => {
    const i = D('mooInput'); perguntar(i.value); i.value = ''; i.style.height = 'auto';
  });
  const inp = D('mooInput');
  inp.addEventListener('input', () => {
    inp.style.height = 'auto'; inp.style.height = Math.min(96, inp.scrollHeight) + 'px';
  });
  inp.addEventListener('keydown', ev => {
    if (ev.key === 'Enter' && !ev.shiftKey){
      ev.preventDefault(); perguntar(inp.value); inp.value = ''; inp.style.height = 'auto';
    }
  });
  document.addEventListener('keydown', ev => {
    const alvo = ev.target, aEscrever = alvo && /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName);
    if (ev.key === 'Escape' && MOO.aberto){ ev.preventDefault(); fechar(); return; }
    if (aEscrever) return;
    if (ev.key === '?' || (ev.key.toLowerCase() === 'k' && (ev.metaKey || ev.ctrlKey))){
      ev.preventDefault(); MOO.aberto ? fechar() : abrir();
    }
  });

  // o ponto vermelho segue o painel: repinta quando os dados mudarem
  pintarPonto();
  /* A cascata pode demorar (HTTP tenta 2-3 portas a 1500 ms cada). Se o painel
     abrir antes de os dados chegarem, o ecrã inicial fica com "a escolher a fonte"
     para sempre. Repinta em passos curtos no primeiro minuto, depois abranda. */
  let ticks = 0;
  setInterval(() => {
    try{
      pintarPonto();
      ticks++;
      const rapido = ticks <= 30;                       // ~60 s a 2 s
      if (MOO.aberto && !MOO.turnos && (rapido || ticks % 3 === 0)) inicial();
    }catch(e){}
  }, 2000);

  window.__moo = MOO;   // superfície de teste; não é usada pelo painel
}

try{ arrancar(); }
catch(e){
  // Falha visível: um suporte que morre em silêncio é pior do que nenhum.
  try{
    const f = D('mooFab');
    if (f){ f.title = 'Moo falhou no arranque: ' + ((e && e.message) || e); f.style.borderColor = 'var(--red)'; }
    console.error('[moo] arranque falhou', e);
  }catch(_){}
}
})();
