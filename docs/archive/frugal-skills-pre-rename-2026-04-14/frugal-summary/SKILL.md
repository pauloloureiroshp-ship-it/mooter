---
name: frugal-summary
description: >
  Generates a rich Intelligence Dashboard with session stats, all-time savings,
  quality signals, hardware info, provider status, budget, and router version.
  Use when the user types "/frugal-summary", "/mooter-summary", "resume a sessão",
  "o que fizemos hoje", "frugal session report", "show routing history",
  "o que o mooter decidiu hoje", "dashboard", "quanto poupei", or at the end
  of a work session.
---

# /frugal-summary — Mooter Intelligence Dashboard

Apresenta um dashboard completo com métricas de sessão, poupanças, qualidade,
hardware, providers, budget e versão do router.

---

## Execution

```bash
node -e "
'use strict';
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');

const ROUTER_DIR = path.join(os.homedir(), '.claude', 'tools', 'router');

// ── helpers ────────────────────────────────────────────────────────────────
function safeRead(p) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } }
function safeReadText(p) { try { return fs.readFileSync(p, 'utf8'); } catch { return ''; } }
function bar(pct, width) {
  width = width || 20;
  const filled = Math.round(pct / 100 * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}
function fmt\$\$(n) { return '\$' + (n || 0).toFixed(2); }
function fmtNum(n) { return (n || 0).toLocaleString(); }

// ── data collection ────────────────────────────────────────────────────────
const hw       = safeRead(path.join(ROUTER_DIR, 'hw-capability.json')) || {};
const profile  = safeRead(path.join(ROUTER_DIR, 'user-profile.json')) || {};
const verJson  = safeRead(path.join(ROUTER_DIR, 'version.json')) || {};
const modeFile = safeRead(path.join(ROUTER_DIR, '.mooter-mode.json')) || {};
const snapshot = safeRead(path.join(ROUTER_DIR, 'metrics-snapshot.json')) || {};
const creds    = safeRead(path.join(os.homedir(), '.claude', '.credentials.json')) || {};
const subProfile = safeRead(path.join(ROUTER_DIR, 'subscription-profile.json')) || {};

// ── OAuth plan detection ──────────────────────────────────────────────────
const oauthData = creds.claudeAiOauth || {};
const planRaw = oauthData.subscriptionType || subProfile.profiles?.anthropic || 'unknown';
const planLabel = planRaw === 'max' ? 'Claude Max' : planRaw === 'pro' ? 'Claude Pro' : planRaw === 'free' ? 'Free' : planRaw;
const rateLimitTier = oauthData.rateLimitTier || 'n/a';
const userEmail = oauthData.user?.email || 'n/a';

// ── decisions.log parsing ─────────────────────────────────────────────────
const logPath = path.join(ROUTER_DIR, 'decisions.log');
const logText = safeReadText(logPath);
const allLines = logText.trim().split('\n').filter(Boolean);
const allDecisions = allLines.map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

const now = Date.now();
const TWO_H = 2 * 60 * 60 * 1000;
const SESSION_CUTOFF = now - TWO_H;

// Tier cost baselines (USD) — used for counterfactual Opus-only estimate
const TIER_COST_APPROX = { T0: 0.000, T1: 0.003, T2: 0.018, T3: 0.120 };
const OPUS_COST_APPROX = 0.120;

// Session (last 2h)
const sessionDecisions = allDecisions.filter(d => d.ts && new Date(d.ts).getTime() >= SESSION_CUTOFF);
const sessionTotal = sessionDecisions.length;

const sessionTierCounts = {};
const sessionTierCost   = {};
['T0','T1','T2','T3'].forEach(t => { sessionTierCounts[t] = 0; sessionTierCost[t] = 0; });
sessionDecisions.forEach(d => {
  const t = d.tier || 'T0';
  sessionTierCounts[t] = (sessionTierCounts[t] || 0) + 1;
  const tCost = TIER_COST_APPROX[t] || 0;
  sessionTierCost[t] = (sessionTierCost[t] || 0) + tCost;
});
const sessionActualCost = Object.values(sessionTierCost).reduce((a,b)=>a+b,0);
const sessionOpusCost   = sessionTotal * OPUS_COST_APPROX;
const sessionSaved      = Math.max(0, sessionOpusCost - sessionActualCost);
const sessionSavedPct   = sessionOpusCost > 0 ? (sessionSaved / sessionOpusCost * 100) : 0;

// Session duration
let sessionStart = null, sessionEnd = null;
if (sessionDecisions.length) {
  const times = sessionDecisions.map(d => new Date(d.ts).getTime()).filter(t => !isNaN(t)).sort((a,b)=>a-b);
  sessionStart = times[0];
  sessionEnd   = times[times.length-1];
}
function fmtTime(ts) {
  if (!ts) return 'n/a';
  const d = new Date(ts);
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}
function fmtDuration(ms) {
  if (!ms || ms < 0) return 'n/a';
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? h + 'h ' + m + 'min' : m + 'min';
}
const sessionDuration = (sessionStart && sessionEnd) ? fmtDuration(sessionEnd - sessionStart) : 'n/a';

// Tier bar labels for session
function tierLine(tier, label, count, total, cost) {
  if (total === 0) return '';
  const pct = Math.round(count / total * 100);
  const b = bar(pct, 10);
  const pc = pct.toString().padStart(3,' ') + '%';
  return '  ' + (tier + ' ' + label).padEnd(12,' ') + ' ' + b + ' ' + pc + '  ' + fmt\$\$(cost);
}

// ── Monthly stats ─────────────────────────────────────────────────────────
const now_d = new Date();
const monthStart = new Date(now_d.getFullYear(), now_d.getMonth(), 1).getTime();
const monthDecisions = allDecisions.filter(d => d.ts && new Date(d.ts).getTime() >= monthStart);
const monthTotal = monthDecisions.length;

const monthTierCost = {};
['T0','T1','T2','T3'].forEach(t => { monthTierCost[t] = 0; });
monthDecisions.forEach(d => {
  const t = d.tier || 'T0';
  monthTierCost[t] = (monthTierCost[t] || 0) + (TIER_COST_APPROX[t] || 0);
});
const monthActualCost  = Object.values(monthTierCost).reduce((a,b)=>a+b,0);
const monthOpusCost    = monthTotal * OPUS_COST_APPROX;
const monthSaved       = Math.max(0, monthOpusCost - monthActualCost);
const monthSavedPct    = monthOpusCost > 0 ? (monthSaved / monthOpusCost * 100) : 0;

// Tokens from snapshot (best available)
const totalInputTokens  = snapshot.total_tokens_in  || snapshot.total_tokens || 0;
const totalOutputTokens = snapshot.total_tokens_out || 0;

// ── All-time stats ────────────────────────────────────────────────────────
const allTotal     = allDecisions.length;
const allTierCost  = {};
['T0','T1','T2','T3'].forEach(t => { allTierCost[t] = 0; });
allDecisions.forEach(d => {
  const t = d.tier || 'T0';
  allTierCost[t] = (allTierCost[t] || 0) + (TIER_COST_APPROX[t] || 0);
});
const allActualCost = Object.values(allTierCost).reduce((a,b)=>a+b,0);
const allOpusCost   = allTotal * OPUS_COST_APPROX;
const allSaved      = Math.max(0, allOpusCost - allActualCost);
const allSavedPct   = allOpusCost > 0 ? (allSaved / allOpusCost * 100) : 0;
const avgSavedPer   = allTotal > 0 ? allSaved / allTotal : 0;

// Earliest decision date
let earliestTs = null;
if (allDecisions.length) {
  const times = allDecisions.map(d => new Date(d.ts).getTime()).filter(t => !isNaN(t)).sort((a,b)=>a-b);
  earliestTs = times[0];
}
function fmtDate(ts) {
  if (!ts) return 'n/a';
  const d = new Date(ts);
  return d.getFullYear() + '-' + (d.getMonth()+1).toString().padStart(2,'0') + '-' + d.getDate().toString().padStart(2,'0');
}
function daysSince(ts) {
  if (!ts) return 0;
  return Math.floor((now - ts) / 86400000);
}

// ── Quality signals from outcomes.jsonl ───────────────────────────────────
const outcomesPath = path.join(ROUTER_DIR, 'outcomes.jsonl');
const outcomesText = safeReadText(outcomesPath);
const outcomes = outcomesText.trim().split('\n').filter(Boolean)
  .map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);

// auto-feedback.js format: {decision_id, outcome_score (0-1), outcome_source, ts}
const posOutcomes = outcomes.filter(o => o.outcome_score >= 0.5).length;
const negOutcomes = outcomes.filter(o => o.outcome_score !== undefined && o.outcome_score < 0.5).length;
const explicitFeedback = outcomes.filter(o => o.outcome_source === 'explicit').length;
const shadowAB = outcomes.filter(o => o.outcome_source === 'shadow').length;

const totalOutcomes = posOutcomes + negOutcomes;
const posPct = totalOutcomes > 0 ? (posOutcomes / totalOutcomes * 100).toFixed(1) : 'n/a';
const negPct = totalOutcomes > 0 ? (negOutcomes / totalOutcomes * 100).toFixed(1) : 'n/a';

// 7-day vs 30-day accuracy
const days7  = now - 7  * 86400000;
const days30 = now - 30 * 86400000;
const recent7d  = outcomes.filter(o => o.ts && new Date(o.ts).getTime() >= days7);
const recent30d = outcomes.filter(o => o.ts && new Date(o.ts).getTime() >= days30);
const acc7  = recent7d.length  > 0 ? (recent7d.filter(o=>o.outcome_score>=0.5).length/recent7d.length*100).toFixed(0)+  '%' : 'n/a';
const acc30 = recent30d.length > 0 ? (recent30d.filter(o=>o.outcome_score>=0.5).length/recent30d.length*100).toFixed(0)+ '%' : 'n/a';

// ── Hardware ──────────────────────────────────────────────────────────────
const machineName  = os.hostname() || 'n/a';
const osRelease    = os.release()  || 'n/a';
// hw-capability.json uses 'name' not 'gpu_name'
const gpuName      = hw.name || hw.gpu_name || hw.gpu || 'n/a';
const vramMb       = hw.vram_mb || 0;
const vramGb       = vramMb > 0 ? (vramMb / 1024).toFixed(0) + 'GB' : (hw.vram_gb || hw.vram || 'n/a');
const hwTier       = (hw.hw_tier || hw.tier || hw.hardware_tier || 'n/a').toUpperCase();

// Ollama models from hw-capability (available_ollama_models array)
const ollamaRaw = hw.available_ollama_models || [];
const ollamaModels = ollamaRaw.map(m => m.name || m);
const ollamaStatus = ollamaModels.length > 0 ? '✅ online' : '⚠ desconhecido';
const ollamaModelStr = ollamaModels.length > 0 ? '(' + ollamaModels.join(', ') + ')' : '';

// ── Provider status ───────────────────────────────────────────────────────
const claudeOAuth  = oauthData.accessToken ? '✅ activo' : '❌ sem token';
const anthropicKey = process.env.ANTHROPIC_API_KEY ? '✅ activo' : '❌ sem key';
const geminiKey    = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) ? '✅ activo' : '❌ sem key';
const openaiKey    = process.env.OPENAI_API_KEY ? '✅ activo' : '❌ sem key';

// ── Budget / Plan ─────────────────────────────────────────────────────────
const isMaxPlan = planRaw === 'max';
const monthlyCap = profile.budget?.monthly_usd_cap || profile.monthly_cap || profile.budget_cap || 0;
const spentPct   = monthlyCap > 0 ? Math.min(100, monthActualCost / monthlyCap * 100) : 0;

// ── Router version ────────────────────────────────────────────────────────
const routerVersion = verJson.version || 'n/a';
const routerAlgo    = verJson.algorithm || verJson.algo || routerVersion;
const activeMode    = modeFile.mode || 'auto';

// ── Month label ───────────────────────────────────────────────────────────
const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const monthLabel = monthNames[now_d.getMonth()] + ' ' + now_d.getFullYear();

// ── Session tier bars ─────────────────────────────────────────────────────
const sessionTierLines = ['T0','T1','T2','T3']
  .map(t => {
    const count = sessionTierCounts[t] || 0;
    if (count === 0) return null;
    const labels = { T0:'Ollama', T1:'Haiku', T2:'Sonnet', T3:'Opus' };
    return tierLine(t, labels[t], count, sessionTotal, sessionTierCost[t]);
  })
  .filter(Boolean)
  .join('\n');

// ── Dashboard output ──────────────────────────────────────────────────────
const dash = [
  '',
  '🎯 MOOTER — Intelligence Dashboard',
  '━'.repeat(42),
  '',
  '📊 SESSÃO (últimas 2h)',
  '  Prompts: ' + sessionTotal + '  |  Duração: ' + (sessionStart ? fmtTime(sessionStart) + ' → ' + fmtTime(sessionEnd || now) + '  (' + sessionDuration + ')' : 'n/a'),
  sessionTierLines || '  (sem decisões nesta sessão)',
  '  Custo da sessão: ' + fmt\$\$(sessionActualCost) + '  |  Poupou: ' + fmt\$\$(sessionSaved) + ' (' + sessionSavedPct.toFixed(1) + '%)',
  '',
  '💰 ESTE MÊS (' + monthLabel + ')',
  '  Total de prompts: ' + fmtNum(monthTotal),
  '  Tokens: ' + fmtNum(totalInputTokens) + ' input / ' + fmtNum(totalOutputTokens) + ' output',
  '  Custo com Mooter: ' + fmt\$\$(monthActualCost),
  '  Custo sem Mooter: ' + fmt\$\$(monthOpusCost),
  '  Poupança do mês:  ' + fmt\$\$(monthSaved) + ' (' + monthSavedPct.toFixed(1) + '%)',
  '',
  '💎 ALL-TIME',
  '  Desde: ' + fmtDate(earliestTs) + ' (' + daysSince(earliestTs) + ' dias)',
  '  Total de prompts: ' + fmtNum(allTotal),
  '  Poupança total: ' + fmt\$\$(allSaved),
  '  Poupança média/prompt: ' + fmt\$\$(avgSavedPer),
  '',
  '📈 QUALITY SIGNALS',
  '  Outcomes positivos: ' + posOutcomes + (totalOutcomes > 0 ? ' (' + posPct + '%)' : ' (n/a)'),
  '  Outcomes negativos: ' + negOutcomes + (totalOutcomes > 0 ? ' (' + negPct + '%)' : ' (n/a)'),
  '  Feedback explícito: ' + (explicitFeedback || 'n/a'),
  '  Shadow A/B tests: ' + (shadowAB || 'n/a'),
  '  Tendência de accuracy: ↑ ' + acc7 + ' (7d) vs ' + acc30 + ' (30d)',
  '',
  '👤 UTILIZADOR',
  '  Email: ' + userEmail,
  '  Plano: ' + planLabel + (rateLimitTier !== 'n/a' ? ' (' + rateLimitTier + ')' : ''),
  isMaxPlan ? '  Tipo: Flat rate — sem custo por token. Savings = prompts deflectados de Opus.' : '',
  '',
  '🖥️  AMBIENTE',
  '  Máquina: ' + machineName,
  '  OS: ' + (process.platform === 'win32' ? 'Windows' : process.platform) + ' ' + osRelease,
  '  GPU: ' + gpuName + (vramGb !== 'n/a' ? ' (' + vramGb + ' VRAM)' : ''),
  '  Hardware tier: ' + hwTier,
  '  Ollama: ' + ollamaStatus + ' ' + ollamaModelStr,
  '',
  '🔑 PROVIDERS',
  '  Claude OAuth:   ' + claudeOAuth + (planLabel !== 'unknown' ? ' [' + planLabel + ']' : ''),
  '  Anthropic API:  ' + anthropicKey,
  '  Gemini:         ' + geminiKey,
  '  OpenAI:         ' + openaiKey,
  '',
  '💳 BUDGET',
  isMaxPlan ? '  Plano Max — sem limite de custo (rate-limited por uso)' : '',
  !isMaxPlan && monthlyCap > 0 ? '  Tecto mensal: ' + fmt\$\$(monthlyCap) : '',
  !isMaxPlan && monthlyCap > 0 ? '  Gasto este mês: ' + fmt\$\$(monthActualCost) + ' (' + spentPct.toFixed(1) + '%)' : '',
  !isMaxPlan && monthlyCap > 0 ? '  ' + bar(spentPct, 20) + ' ' + spentPct.toFixed(0) + '%' : '',
  !isMaxPlan && monthlyCap <= 0 ? '  Gasto estimado este mês: ' + fmt\$\$(monthActualCost) + ' (sem tecto configurado)' : '',
  '',
  '🔧 ROUTER',
  '  Versão: v' + routerVersion,
  '  Modo: ' + activeMode.charAt(0).toUpperCase() + activeMode.slice(1),
  '',
  '💡 RESUMO DE VALOR',
  '  \"Mooter poupou-te ' + fmt\$\$(allSaved) + ' em ' + fmtNum(allTotal) + ' prompts.',
  '   Isso é ' + allSavedPct.toFixed(1) + '% menos do que usar Opus para tudo.',
  '   Retenção de qualidade: ' + (totalOutcomes > 0 ? posPct + '% outcomes positivos.' : 'dados insuficientes para calcular.') + '\"',
  '',
].filter(l => l !== null).join('\n');

console.log(dash);
" 2>/dev/null || echo "⚠ Erro ao gerar dashboard. Verifica se o router está inicializado em ~/.claude/tools/router/"
```

---

## Notas de robustez

- Se `decisions.log` não existir → sessão e all-time mostram zeros, nunca crash.
- Se `outcomes.jsonl` não existir → quality signals mostram "n/a".
- Se `hw-capability.json` não existir → hardware mostra "n/a".
- Se `user-profile.json` não existir → budget não mostra tecto.
- Se `version.json` não existir → versão mostra "n/a".
- Custos são **estimativas baseadas em tier** (não token-exactos) — para números precisos, consulta `/metrics` no savings-tracker (porta 7821).
- Se o savings-tracker estiver online em `:7821`, os dados de `/metrics` sobrepõem os valores do snapshot (futura melhoria — actualmente usa `metrics-snapshot.json` como fallback estático).

## Triggers reconhecidos

`/frugal-summary` · `/mooter-summary` · `resume a sessão` · `o que fizemos hoje` · `frugal session report` · `show routing history` · `o que o mooter decidiu hoje` · `dashboard` · `quanto poupei` · `show savings` · `session report`
