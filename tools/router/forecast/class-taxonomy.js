#!/usr/bin/env node
// class-taxonomy.js — DC-01: forecast POR CLASSE, nunca por "wave" genérica.
//
// A handoff takes ~10 min; a QLoRA train takes ~8 h. Averaging them describes
// nothing. So every duration sample is filed under a CLASS × MODE, and each
// class gets its OWN empirical distribution. A wave whose class we cannot name
// gets "sem base comparável" — NO P50/P90 — never a lie dressed as a mean.
//
// This is NOT classify.js (that one is frozen and routes prompts to tiers).
// This maps a work SESSION (its launching masterprompt / intent text) to the
// delivery taxonomy. Pure, deterministic, keyword-ordered (specific → generic),
// never throws.

'use strict';

// The declared taxonomy (masterprompt §1). Anything outside this set is unknown.
const CLASSES = ['handoff', 'feature_impl', 'adapter_train', 'md_cleanup', 'audit'];
const MODES = ['CC', 'Loop'];

// Ordered rules: the FIRST match wins, so put the specific classes before the
// broad `feature_impl` catch-all. Each regex is intentionally narrow — a miss
// returns class:null ("sem base comparável"), which is the honest answer.
const CLASS_RULES = [
  { cls: 'adapter_train', re: /\b(adapter|qlora|q-lora|dora|osft|lora|fine[-\s]?tun|forge|treino|training|train\b|nightly\s+train)\b/i },
  { cls: 'audit',         re: /\b(auditoria|audit|red[-\s]?team|e2e|end[-\s]?to[-\s]?end|valida(r|ção)?\s+cada|verifica(r|ção)?\s+(cada|todos)|inconsist[êe]ncia|scan\b)\b/i },
  { cls: 'handoff',       re: /\b(handoff|hand[-\s]?off|sync\.md|passar\s+o\s+contexto|context\s+handoff)\b/i },
  { cls: 'md_cleanup',    re: /\b(housekeeping|arquivar|consolidar|cleanup|clean[-\s]?up|limpar\s+a?\s*base|arquivo\s+legacy|md\s+cleanup|reorganiz|renomear\s+docs)\b/i },
  { cls: 'feature_impl',  re: /\b(constr[óo]i|constru[ií]r|implementa|feature|bot[ãa]o|nova\s+aba|engine|cockpit|wire|p[áa]gina|componente|slider|webview|plugin|refator|build\b|adiciona)\b/i },
];

// Mode signals: Loop / Schedule (autonomous, $0 local, "moos correm sozinhos")
// vs CC (a Claude Code brain session — the default when the text is a coding /
// merge / architecture masterprompt).
const LOOP_RE = /\b(moo\s+loop|loop\s+session|loop\s+\$0|schedule\b|schedule\s+session|os\s+moos?\s+correm|corre(m)?\s+sozinh|aut[óo]nom|dynamic[-\s]?workflow|nightly)\b/i;
const CC_RE = /\b(cc[-\s]?once|sess[ãa]o\s+cc|claude\s+code|merge|arquitectura|arquitetura|irrevers[íi]vel)\b/i;

// Classify a session from its launching intent text.
// Returns { class, mode, matched }. class=null when nothing confident matches.
function classifySession(intentText) {
  const t = String(intentText == null ? '' : intentText);
  let cls = null;
  for (const rule of CLASS_RULES) {
    if (rule.re.test(t)) { cls = rule.cls; break; }
  }
  const mode = detectMode(t);
  return { class: cls, mode, matched: cls != null };
}

// Mode is a best-effort signal; defaults to 'CC' (the arquitecto session) when
// no autonomous-loop marker is present. Never null — a duration always ran in
// SOME mode; the honesty gate is on the CLASS, not the mode.
function detectMode(text) {
  const t = String(text == null ? '' : text);
  if (LOOP_RE.test(t)) return 'Loop';
  if (CC_RE.test(t)) return 'CC';
  return 'CC';
}

// Classify a ROADMAP wave (it carries a declared `mode` string + name/goal).
// Returns { class, mode }. class=null ⇒ the wave declared no comparable class
// ⇒ the forecast MUST refuse a cone for it (masterprompt §1).
function classifyWave(wave) {
  const w = wave || {};
  const text = [w.name, w.goal, w.objective].filter(Boolean).join(' ');
  const { class: cls } = classifySession(text);
  // Prefer the roadmap's explicitly declared mode when present.
  const declared = String(w.mode || '');
  let mode = 'CC';
  if (/loop|schedule|dynamic/i.test(declared)) mode = 'Loop';
  else if (/cc/i.test(declared)) mode = 'CC';
  else mode = detectMode(text);
  return { class: cls, mode };
}

// Canonical key for a class×mode bucket. null class → null key (no bucket).
function bucketKey(cls, mode) {
  if (!cls) return null;
  const m = MODES.indexOf(mode) >= 0 ? mode : 'CC';
  return cls + '::' + m;
}

module.exports = { classifySession, classifyWave, detectMode, bucketKey, CLASSES, MODES };
