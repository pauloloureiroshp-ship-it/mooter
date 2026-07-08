'use strict';
// lp-audit-summary.js — Review Security · LP-5. Static `npm audit --json` summarizer.
//
// PURE parser: no fs, no net, no child_process — the host runs `npm audit --json` and hands the
// raw stdout TEXT in; this module only JSON.parse()s + reshapes it into an honest summary.
//
// ── HONESTY ──────────────────────────────────────────────────────────────────────────────────
//   `honestSummary` never inflates or hides risk. It says "all dev-only" ONLY when every
//   vulnerability entry carries an explicit `dev:true`; anything unproven is conservatively
//   folded into prodCount (an npm-audit entry with no `dev` flag at all is NOT assumed safe).
//   Zero vulnerabilities → a plain, calm "sem vulnerabilidades reportadas." — no fabricated
//   "all good, ship it" enthusiasm.
//
// ── FAIL-SOFT ────────────────────────────────────────────────────────────────────────────────
//   Non-JSON / unparseable input → {ok:false, reason:'unparseable'}. Never throws.

var SEV_ORDER = ['critical', 'high', 'moderate', 'low', 'info'];
var SEV_RANK = { critical: 0, high: 1, moderate: 2, low: 3, info: 4 };

function emptyCounts() {
  return { critical: 0, high: 0, moderate: 0, low: 0, info: 0 };
}

// isDevOnly(vulnEntry) — PURE. true/false when the entry carries an explicit `dev` boolean
// (older npm-audit schemas do), null when the data does not say either way.
function isDevOnly(v) {
  if (v && typeof v === 'object') {
    if (v.dev === true) return true;
    if (v.dev === false) return false;
  }
  return null;
}

// firstTitleFromVia(via) — PURE. `via` mixes strings (names of other advisory-carrying
// packages) and advisory objects ({title, url, severity, range, ...}); return the first
// real title found, or '' when via is empty/all-strings.
function firstTitleFromVia(via) {
  if (!Array.isArray(via)) return '';
  for (var i = 0; i < via.length; i++) {
    var it = via[i];
    if (it && typeof it === 'object' && typeof it.title === 'string' && it.title) return it.title;
  }
  return '';
}

// summarizeNpmAudit(jsonText) — PURE, FAIL-SOFT.
function summarizeNpmAudit(jsonText) {
  var data;
  try {
    data = JSON.parse(String(jsonText));
  } catch (e) {
    return { ok: false, reason: 'unparseable' };
  }
  if (!data || typeof data !== 'object') return { ok: false, reason: 'unparseable' };

  var vulns = data.vulnerabilities && typeof data.vulnerabilities === 'object' ? data.vulnerabilities : {};
  var names = Object.keys(vulns);

  var counts = emptyCounts();
  var metaCounts =
    data.metadata && data.metadata.vulnerabilities && typeof data.metadata.vulnerabilities === 'object'
      ? data.metadata.vulnerabilities
      : null;
  if (metaCounts) {
    for (var s = 0; s < SEV_ORDER.length; s++) {
      var key = SEV_ORDER[s];
      var n = metaCounts[key];
      counts[key] = typeof n === 'number' && isFinite(n) && n >= 0 ? n : 0;
    }
  } else {
    for (var i = 0; i < names.length; i++) {
      var vv0 = vulns[names[i]];
      var sev0 = vv0 && typeof vv0.severity === 'string' ? vv0.severity : null;
      if (sev0 && counts.hasOwnProperty(sev0)) counts[sev0]++;
    }
  }

  var prodCount = 0;
  var devOnlyCount = 0;
  var rows = [];
  for (var j = 0; j < names.length; j++) {
    var name = names[j];
    var vv = vulns[name];
    if (!vv || typeof vv !== 'object') continue;
    var devOnly = isDevOnly(vv);
    if (devOnly === true) devOnlyCount++;
    else prodCount++; // unknown/false → conservatively counted toward prod, never assumed safe
    var sev = typeof vv.severity === 'string' && SEV_RANK.hasOwnProperty(vv.severity) ? vv.severity : 'info';
    rows.push({
      name: name,
      severity: sev,
      title: firstTitleFromVia(vv.via),
      range: typeof vv.range === 'string' ? vv.range : '',
      fixAvailable: 'fixAvailable' in vv ? vv.fixAvailable : false,
    });
  }
  rows.sort(function (a, b) {
    return SEV_RANK[a.severity] - SEV_RANK[b.severity];
  });
  var top = rows.slice(0, 10);

  var total = counts.critical + counts.high + counts.moderate + counts.low + counts.info;
  var honestSummary;
  if (total === 0) {
    honestSummary = 'sem vulnerabilidades reportadas.';
  } else {
    var parts = [];
    for (var t = 0; t < SEV_ORDER.length; t++) {
      var k = SEV_ORDER[t];
      if (counts[k] > 0) parts.push(counts[k] + ' ' + k);
    }
    var head = parts.join(', ');
    var riskCount = counts.critical + counts.high;
    var allKnownDevOnly = devOnlyCount === total; // every entry we could classify is dev-only
    if (riskCount > 0 && prodCount > 0) {
      honestSummary = head + ' — ' + riskCount + ' crítica/alta com possível exposição em produção.';
    } else if (allKnownDevOnly) {
      honestSummary = head + ', all dev-only — nada crítico em produção.';
    } else if (riskCount > 0) {
      honestSummary = head + ' — origem prod/dev não totalmente distinguível pelos dados.';
    } else {
      honestSummary = head + ' — nada crítico ou alto reportado.';
    }
  }

  return {
    ok: true,
    counts: counts,
    prodCount: prodCount,
    devOnlyCount: devOnlyCount,
    top: top,
    honestSummary: honestSummary,
  };
}

module.exports = { summarizeNpmAudit: summarizeNpmAudit };
