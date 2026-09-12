#!/usr/bin/env node
// pretooluse-route.js — P3, braco B. Um hook PreToolUse (matcher Agent|Task) que
// REESCREVE o spawn de um subagente conforme a ultima decisao do router
// (~/.claude/tools/router/last-subagent.json, escrita pelo inject_context.js no
// UserPromptSubmit). Padrao do tzachbon/claude-model-router-hook (MIT), que faz
// o mesmo para haiku/opus; aqui o alvo e o TIER do Mooter:
//
//   T0 -> subagent_type local-summarizer (Ollama via ollama_call.sh)   model haiku (o invólucro)
//   T1 -> subagent_type cheap-triage                                    model haiku
//   T2 -> model sonnet         T3 -> model opus       (subagent_type intacto)
//
// Nunca sobe um tier: se a decisao e T0/T1 e o modelo pedido e superior, desce;
// se a decisao e T2/T3 e o pedido e inferior, DEIXA (P3 mede obediencia para
// baixo; o guardrail de risco vive no UserPromptSubmit). Um `model` explicito
// escrito pelo dono no prompt (@opus etc.) e respeitado: o inject_context marca
// user_override e o hook nao toca.
//
// Contrato de hooks: PreToolUse pode devolver hookSpecificOutput.updatedInput
// (code.claude.com/docs/en/hooks-guide, lido 2026-09-09). Falha aberta: qualquer
// erro -> sem output -> a chamada segue como estava.
//
// Regista cada decisao em $P3_HOOK_LOG (JSONL) para a prova contar o que fez.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');

function main() {
  let raw = '';
  try { raw = fs.readFileSync(0, 'utf8'); } catch { return; }
  let ev; try { ev = JSON.parse(raw); } catch { return; }
  if (!ev || (ev.tool_name !== 'Agent' && ev.tool_name !== 'Task')) return;
  const input = ev.tool_input || {};
  const routerDir = process.env.P3_ROUTER_DIR || path.join(os.homedir(), '.claude', 'tools', 'router');
  let last = null; try { last = JSON.parse(fs.readFileSync(path.join(routerDir, 'last-subagent.json'), 'utf8')); } catch { /* sem decisao */ }
  const log = (o) => { const f = process.env.P3_HOOK_LOG; if (!f) return; try { fs.appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), session: ev.session_id, ...o }) + '\n'); } catch { /* */ } };
  if (!last || !last.tier) { log({ action: 'no-decision', input: { subagent_type: input.subagent_type, model: input.model } }); return; }
  const ageMs = Date.now() - Number(last.ts || 0);
  const RANK = { haiku: 1, sonnet: 2, opus: 3, fable: 4 };
  const asked = String(input.model || '').toLowerCase();
  const askedRank = RANK[asked] || null;
  let updated = { ...input }; let action = 'keep';
  if (last.tier === 'T0') { updated.subagent_type = 'local-summarizer'; updated.model = 'haiku'; action = 'rewrite->T0/local-summarizer'; }
  else if (last.tier === 'T1') { if (!askedRank || askedRank > 1) { updated.model = 'haiku'; action = 'rewrite->T1/haiku'; } if (!input.subagent_type || /model-architect|model-reasoner|general-purpose/.test(input.subagent_type)) { updated.subagent_type = 'cheap-triage'; action += '+cheap-triage'; } }
  else if (last.tier === 'T2') { if (askedRank && askedRank > 2) { updated.model = 'sonnet'; action = 'rewrite->T2/sonnet'; } }
  // T3: nada a descer
  log({ action, tier: last.tier, decision_age_ms: ageMs, before: { subagent_type: input.subagent_type, model: input.model }, after: { subagent_type: updated.subagent_type, model: updated.model } });
  if (action === 'keep') return;
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow', updatedInput: updated } }));
}
try { main(); } catch { /* falha aberta */ }
