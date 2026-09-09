// conferir.mjs — relê cada número titular dos cartões a partir do bruto e compara com o que os
// ficheiros do pacote publicam. Não corre modelo nenhum: só lê results/ e faz grep nos .md.
import fs from 'node:fs';
import path from 'node:path';

const PKG = process.argv[2];
const ok = [];
const bad = [];
const nd = [];

const md = (rel) => { try { return fs.readFileSync(path.join(PKG, rel), 'utf8'); } catch { return null; } };
const js = (rel) => { try { return JSON.parse(fs.readFileSync(path.join(PKG, rel), 'utf8')); } catch { return null; } };

// contem(texto, agulha) — a agulha tem de aparecer literalmente
function afirma(nome, cond, detalhe) {
  (cond ? ok : bad).push(nome + (detalhe ? ' :: ' + detalhe : ''));
}

const indice = md('08-PACOTE.md');
const p8 = md('P8-cabeca-a-cabeca/slide.md');

// ── P1 ──────────────────────────────────────────────────────────────────────
const a1 = js('P1-decidir-custa-zero/results/analysis.json');
if (!a1) nd.push('P1 analysis.json ausente');
else {
  const A = a1.arms['A-key'], B = a1.arms['B'];
  const s1 = md('P1-decidir-custa-zero/slide.md');
  afirma('P1 acc63 regra 22.2 no slide', s1.includes('22.2 %'), (A.acc63.p * 100).toFixed(1));
  afirma('P1 acc63 juiz 69.8 no slide', s1.includes('69.8 %'), (B.acc63.p * 100).toFixed(1));
  afirma('P1 acc63 regra bate com bruto', (A.acc63.p * 100).toFixed(1) === '22.2');
  afirma('P1 acc63 juiz bate com bruto', (B.acc63.p * 100).toFixed(1) === '69.8');
  afirma('P1 p63 bate com bruto', a1.mcnemar_Akey_vs_B_63.p_one_sided_B_gt_A < 1e-6);
  afirma('P1 p40 bate com bruto', Math.abs(a1.mcnemar_Akey_vs_B_40.p_one_sided_B_gt_A - 0.0592) < 1e-3);
  afirma('P1 63 tambem no indice', indice.includes('22,2 %'));
  const raw = JSON.stringify(a1);
  const m23 = [...raw.matchAll(/"acc23":\{"k":(\d+),"n":23/g)].map((x) => Number(x[1]));
  afirma('P1 acc23 regra = 0 e juiz = 23', m23[0] === 0 && m23[m23.length - 1] === 23, m23.join(','));
  afirma('P1 slide imprime 0/23', s1.includes('0/23'));
}

// ── P2 ──────────────────────────────────────────────────────────────────────
const a2 = js('P2-o-tier-vale-alguma-coisa/results/analysis.json');
if (!a2) nd.push('P2 analysis.json ausente');
else {
  const s2 = md('P2-o-tier-vale-alguma-coisa/slide.md');
  // O slide dá percentagens (35 / 85 / 95 sobre 20) e o índice dá fracções (7 / 17 / 19 sobre 20).
  // São o MESMO número em duas moedas: é isso que se confere, não a forma literal.
  const pct = (k) => (100 * k / 20).toFixed(0) + ' %';
  afirma('P2 titulo do slide traz 17, 7 e 19', /17 accepted/.test(s2) && /local alone 7/.test(s2) && /Haiku on all 19/.test(s2));
  afirma('P2 tabela do slide em % bate com 7/17/19', s2.includes(pct(7)) && s2.includes(pct(17)) && s2.includes(pct(19)), [pct(7), pct(17), pct(19)].join(' '));
  afirma('P2 indice diz 17/20', indice.includes('17/20'));
}

// ── P3 ──────────────────────────────────────────────────────────────────────
const a3 = js('P3-obediencia/results/analysis.json');
if (!a3) nd.push('P3 analysis.json ausente');
else {
  const raw = JSON.stringify(a3);
  const s3 = md('P3-obediencia/slide.md');
  // O campo guarda k e o intervalo, mas NÃO guarda n. O denominador lê-se do limite superior de
  // Wilson: hi ≈ 0,1611 é n = 20, hi ≈ 0,4345 é n = 5. É a conferência que importa aqui, porque
  // «0/20» e «0/5» lêem-se iguais no slide e são coisas diferentes: os dois braços Sonnet correram
  // 20 sessões cada, o braço Opus foi uma sonda de 5 e o slide di-lo em separado.
  const estrito = Object.entries(a3.arms).map(([n, b]) => [n, b.sessions_with_EXECUTED_local_delegation_strict]).filter(([, v]) => v);
  afirma('P3 metrica estrita existe nos tres bracos', estrito.length === 3, estrito.map(([n]) => n).join(','));
  afirma('P3 metrica estrita = 0 em todos', estrito.every(([, v]) => v.k === 0), estrito.map(([n, v]) => n + ':' + v.k).join(' '));
  const n20 = estrito.filter(([, v]) => Math.abs(v.hi - 0.16112516018512968) < 1e-9).map(([n]) => n);
  const n5 = estrito.filter(([, v]) => Math.abs(v.hi - 0.4344824686593928) < 1e-9).map(([n]) => n);
  afirma('P3 dois bracos com n = 20 (os Sonnet)', n20.length === 2 && n20.every((x) => /sonnet/i.test(x)), n20.join(','));
  afirma('P3 um braco com n = 5 (a sonda Opus)', n5.length === 1 && /opus/i.test(n5[0]), n5.join(','));
  afirma('P3 slide separa a sonda Opus de 5', /Opus probe on 5 prompts/i.test(s3));
  afirma('P3 slide diz 0/20', s3.includes('0/20'));
  afirma('P3 slide ja nao diz "never called the local model"', !s3.includes('never called the local model'));
  afirma('P3 slide sem palavra proibida enforces', !/enforces/i.test(s3));
}

// ── P4 ──────────────────────────────────────────────────────────────────────
const a4 = js('P4-critico-nao-autor/results/analysis.json');
if (!a4) nd.push('P4 analysis.json ausente');
else {
  const s4 = md('P4-critico-nao-autor/slide.md');
  const A = a4.arms && a4.arms.A_self_review_opus, B = a4.arms && a4.arms.B_critic_codex;
  if (A && B) {
    afirma('P4 Opus TP = 27 no bruto', A.TP === 27, String(A.TP));
    afirma('P4 Codex TP = 26 no bruto', B.TP === 26, String(B.TP));
    afirma('P4 Opus FP = 2 no bruto', A.FP === 2, String(A.FP));
    afirma('P4 Codex FP = 4 no bruto', B.FP === 4, String(B.FP));
    afirma('P4 slide diz 27/28', s4.includes('27/28'));
    afirma('P4 slide diz 26/28', s4.includes('26/28'));
  } else nd.push('P4 arms com outra forma: ' + Object.keys(a4).join(','));
  afirma('P4 p McNemar = 1 nos dois sentidos', a4.mcnemar_mutants_B_catches_more && a4.mcnemar_mutants_B_catches_more.p_B_gt_A === 1);
  afirma('P4 slide diz que a linha foi marcada', /when told which line changed/i.test(s4));
}

// ── P6 ──────────────────────────────────────────────────────────────────────
const a6 = js('P6-custo-na-linha/results/analysis.json') || js('P6-custo-na-linha/results/linhas.json');
const s6 = md('P6-custo-na-linha/slide.md');
if (!a6) nd.push('P6 analysis.json ausente (procurei analysis.json e linhas.json)');
else {
  // O 1 451 do slide NÃO está guardado em campo nenhum: é a soma do corte pré-registado.
  // Confere-se somando as três parcelas do bruto, que é o que o próprio slide enumera.
  const L = a6.A_ledger_actual;
  const soma = L.decisions_log.classified.total + L.decisions_log.executed.total + L.mooter_ledger.done.total;
  afirma('P6 corte pre-registado = 939 + 492 + 20 = 1451', soma === 1451, String(soma));
  afirma('P6 slide enumera as tres parcelas', /939/.test(s6) && /492/.test(s6) && /20 ledger/.test(s6));
  afirma('P6 slide diz 1,451', s6.includes('1,451') || s6.includes('1451'));
  afirma('P6 zero com custo E origem nas tres parcelas', L.decisions_log.classified.with_cost_and_source === 0 && L.decisions_log.executed.with_cost_and_source === 0 && L.mooter_ledger.done.with_cost_and_source === 0);
  afirma('P6 slide diz 156/156', s6.includes('156/156'));
}

// ── P5 ──────────────────────────────────────────────────────────────────────
// Este é o único cartão cujo titular se confere DUAS vezes: contra o analysis.json e, por baixo
// dele, recontando o tap em bruto linha a linha. É de propósito — o titular do P5 é um negativo
// («nada saiu»), e um negativo só vale se o instrumento demonstrar que estava a funcionar.
const a5 = js('P5-atestacao-de-egress/results/analysis.json');
const s5 = md('P5-atestacao-de-egress/slide.md');
if (!a5) nd.push('P5 analysis.json ausente');
else {
  afirma('P5 tap carregou em 75 processos', a5.A.tap.processes === 75, String(a5.A.tap.processes));
  afirma('P5 tap registou 35 ligacoes', a5.A.tap.connections === 35, String(a5.A.tap.connections));
  afirma('P5 zero hosts externos no braco A', Array.isArray(a5.A.tap.external_hosts) && a5.A.tap.external_hosts.length === 0, JSON.stringify(a5.A.tap.external_hosts));
  afirma('P5 slide diz 75 processos e 35 ligacoes', /75/.test(s5) && /35 connections/i.test(s5));
  afirma('P5 slide diz que as 35 sao loopback', /loopback/i.test(s5));

  // recontagem independente a partir do bruto resgatado
  const tapPath = path.join(PKG, 'P5-atestacao-de-egress/results/bruto-resgatado/tap-braco-A.jsonl');
  if (!fs.existsSync(tapPath)) nd.push('P5 tap em bruto ausente (bruto-resgatado)');
  else {
    const rows = fs.readFileSync(tapPath, 'utf8').trim().split('\n').map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    const carregados = rows.filter((r) => r.event === 'tap-loaded').length;
    const conns = rows.filter((r) => r.host !== undefined);
    const fora = conns.filter((r) => !/^127\.|^::1$|^localhost$/.test(String(r.host)));
    const porDestino = {};
    for (const c of conns) porDestino[c.host + ':' + c.port] = (porDestino[c.host + ':' + c.port] || 0) + 1;
    afirma('P5 bruto: 75 processos com tap', carregados === 75, String(carregados));
    afirma('P5 bruto: 35 registos de ligacao', conns.length === 35, String(conns.length));
    afirma('P5 bruto: ZERO ligacoes fora do loopback', fora.length === 0, String(fora.length));
    afirma('P5 bruto: o controlo positivo existe (ligacoes > 0)', conns.length > 0, 'um negativo de um instrumento mudo nao vale nada');
    afirma('P5 bruto: destinos sao 7821 (metricas do hook) e 11434 (Ollama)', porDestino['127.0.0.1:7821'] === 20 && porDestino['127.0.0.1:11434'] === 15, JSON.stringify(porDestino));
    afirma('P5 bruto bate com o analysis.json', carregados === a5.A.tap.processes && conns.length === a5.A.tap.connections);
  }

  // o cartao imprime a derrota: com chave, o arbitro monta o pedido com o prompt inteiro
  const arb = a5.B_arbiter;
  afirma('P5 arbitro instrumentado em 20/20', arb && arb.prompts === 20, arb ? String(arb.prompts) : 'n/d');
  afirma('P5 slide imprime a derrota do arbitro', /whole prompt|full prompt/i.test(s5));
  // e a derrota do concorrente: 0 de 40, sem quantificador universal
  afirma('P5 slide sem "never" absoluto sobre o LiteLLM', !/never (picked|selected|chose)/i.test(s5));
}

// ── P8 / transversais ───────────────────────────────────────────────────────
afirma('P8 sem celula n/a sem motivo', !/\|\s*n\/a\s*\|/.test(p8));
afirma('P8 nao diz "Ties:"', !/\*\*Ties:\*\*/.test(p8));
afirma('P8 nao diz "never picked"', !/never picked/i.test(p8));
afirma('P8 tem legenda n/d vs n/a', /\*\*Legend:\*\*/.test(p8));
const slides = fs.readdirSync(PKG).filter((d) => /^P\d/.test(d)).map((d) => path.join(d, 'slide.md')).filter((f) => fs.existsSync(path.join(PKG, f)));
const proibidas = slides.filter((f) => /enforces|most accurate|\bprivate\b|\bsecure\b/i.test(md(f)));
afirma('nenhum slide com palavra proibida', proibidas.length === 0, proibidas.join(','));
const semNaoProva = slides.filter((f) => !/does not prove/i.test(md(f)));
afirma('todos os slides com a linha "does not prove"', semNaoProva.length === 0, semNaoProva.join(','));

console.log('CONFERE (' + ok.length + ')');
for (const x of ok) console.log('  ok   ' + x);
if (bad.length) { console.log('DIVERGE (' + bad.length + ')'); for (const x of bad) console.log('  XX   ' + x); }
if (nd.length) { console.log('n/d (' + nd.length + ')'); for (const x of nd) console.log('  --   ' + x); }
process.exit(bad.length ? 1 : 0);
