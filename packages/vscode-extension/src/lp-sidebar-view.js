'use strict';

// Native Live Preview sidebar surface. The host owns selection identity, leases, files and all
// mutations; this webview receives a bounded display projection and emits intent-only commands.
// Keeping that boundary here is deliberate: a stale sidebar can never choose a write target.

const crypto = require('node:crypto');
const taskView = require('./lp-task-view.js');
const presetsView = require('./lp-presets.js');
const securityView = require('./lp-security-view.js');
const livePreviewView = require('./live-preview-view.js');

function safeJson(value) {
  return JSON.stringify(value).replace(/[<>&]/g, function (char) {
    return { '<': '\\u003c', '>': '\\u003e', '&': '\\u0026' }[char];
  });
}

function getLivePreviewSidebarHtml(token) {
  const nonce = crypto.randomBytes(18).toString('base64url');
  const hostToken = safeJson(String(token == null ? '' : token));

  // Pure renderers already used by the editor webview. Serialising them keeps copy, grouping and
  // honesty rules identical while this module remains flat and independently testable.
  const renderers = [
    securityView.bucketOf,
    securityView.buildItems,
    securityView.renderSecurityActivity,
    securityView.renderSecurityFindings,
    presetsView.renderPresetsBarHTML,
    taskView.renderMarkdownSafe,
    taskView.renderJourneyThread,
    livePreviewView.renderBrain,
    livePreviewView.renderDayBreakdown,
    livePreviewView.renderModelBreakdown,
    livePreviewView.renderFleetLanes,
    livePreviewView.renderExecutiveOverview,
    livePreviewView.renderExecutiveTimeline,
    livePreviewView.renderSessionBreakdown,
  ].map(function (fn) { return fn.toString(); }).join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Mooter Live Preview</title>
  <style>
    :root {
      color-scheme: light dark;
      --moo: #eb5d8f;
      --moo-action: #c7386a;
      --moo-soft: color-mix(in srgb, var(--moo) 15%, transparent);
      --ok: #54b86c;
      --wait: #d6ad2b;
      --danger: #e0525e;
      --line: var(--vscode-panel-border, rgba(128,128,128,.28));
      --muted: var(--vscode-descriptionForeground, #999);
      --card: var(--vscode-editorWidget-background, rgba(128,128,128,.08));
      --input: var(--vscode-input-background, rgba(0,0,0,.18));
    }
    * { box-sizing: border-box; }
    html, body { width: 100%; max-width: 100%; min-width: 0; height: 100%; margin: 0; overflow: hidden; }
    body {
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      font: 12px/1.45 var(--vscode-font-family, system-ui, sans-serif);
    }
    button, input, textarea { font: inherit; color: inherit; }
    button {
      min-width: 0;
      border: 1px solid var(--line);
      border-radius: 6px;
      background: var(--vscode-button-secondaryBackground, rgba(128,128,128,.12));
      padding: 5px 8px;
      cursor: pointer;
    }
    button:hover:not(:disabled) { border-color: var(--vscode-focusBorder, var(--moo)); }
    button:disabled { cursor: not-allowed; opacity: .5; }
    button:focus-visible, input:focus-visible, textarea:focus-visible, [role="tab"]:focus-visible {
      outline: 2px solid var(--vscode-focusBorder, var(--moo));
      outline-offset: 1px;
    }
    .shell { display: flex; flex-direction: column; width: 100%; min-width: 0; height: 100vh; }
    .top {
      position: sticky; top: 0; z-index: 4; flex: 0 0 auto;
      padding: 8px 8px 0;
      background: var(--vscode-sideBar-background, var(--vscode-editor-background));
      border-bottom: 1px solid var(--line);
    }
    .surface-switch {
      position: relative; display: grid; grid-template-columns: minmax(0,1fr) 22px minmax(0,1.2fr);
      align-items: center; gap: 2px; padding: 3px; border: 1px solid var(--line); border-radius: 10px;
      background: color-mix(in srgb, var(--input) 78%, transparent); overflow: hidden;
    }
    .surface-choice { position: relative; z-index: 1; border: 0; border-radius: 7px; padding: 6px 5px; color: var(--muted); background: transparent; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .surface-choice:hover:not(:disabled) { color: var(--vscode-foreground); background: var(--card); }
    .surface-choice.active { color: var(--vscode-foreground); background: var(--card); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--moo) 38%, transparent); }
    .surface-choice.active::after {
      content: ''; position: absolute; left: 22%; right: 22%; bottom: 1px; height: 2px; border-radius: 3px;
      background: var(--moo); box-shadow: 0 0 8px color-mix(in srgb, var(--moo) 70%, transparent); animation: surfaceGlow 1.8s ease-in-out infinite;
    }
    .surface-swap { color: var(--moo); text-align: center; font-size: 14px; animation: surfaceNudge 1.8s ease-in-out infinite; }
    .brand, .context, .row, .seg, .actions, .dest-row, .meo-lenses {
      display: flex; align-items: center; min-width: 0; gap: 6px;
    }
    .brand { justify-content: space-between; margin: 6px 1px 5px; }
    .brand strong { font-size: 12px; letter-spacing: .01em; }
    .health { display: inline-flex; align-items: center; gap: 5px; min-width: 0; color: var(--muted); }
    .health-dot { width: 7px; height: 7px; flex: 0 0 auto; border-radius: 50%; background: var(--muted); }
    .health.ready .health-dot { background: var(--ok); }
    .health.busy .health-dot { background: var(--moo); animation: pulse 1.1s ease-in-out infinite; }
    .context { align-items: flex-start; padding-bottom: 7px; }
    .selection { min-width: 0; flex: 1; }
    .selection b, .selection span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .selection span { color: var(--muted); font-size: 11px; }
    .stage { flex: 0 0 auto; max-width: 40%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 10px; }
    .tabs { display: grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 2px; }
    [role="tab"] { position: relative; border: 0; border-radius: 5px 5px 0 0; padding: 7px 2px; background: transparent; color: var(--muted); white-space: nowrap; }
    [role="tab"][aria-selected="true"] { color: var(--vscode-foreground); background: var(--card); }
    [role="tab"][aria-selected="true"]::after { content: ''; position: absolute; left: 12%; right: 12%; bottom: 0; height: 2px; border-radius: 2px; background: var(--moo); }
    .badge { display: inline-flex; justify-content: center; min-width: 16px; padding: 0 4px; margin-left: 2px; border-radius: 9px; background: #b63342; color: white; font-size: 9px; line-height: 16px; }
    .badge[hidden] { display: none; }
    main { flex: 1 1 auto; min-width: 0; min-height: 0; padding: 0 8px 8px; overflow-y: auto; overscroll-behavior: contain; }
    [role="tabpanel"][hidden] { display: none !important; }
    #panel-edit { display: flex; flex-direction: column; min-height: 100%; }
    .selection-context { display: flex; align-items: flex-start; gap: 8px; margin: 0 2px; padding: 12px 2px 10px; border-bottom: 1px solid var(--line); }
    .selection-pin { flex: 0 0 auto; width: 22px; height: 22px; display: grid; place-items: center; border-radius: 7px; color: var(--moo); background: var(--moo-soft); }
    .selection { min-width: 0; flex: 1; }
    .selection b, .selection span { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .selection span { color: var(--muted); font-size: 11px; }
    .card { min-width: 0; margin-bottom: 8px; padding: 8px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); overflow-wrap: anywhere; }
    .card-hd { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px; font-weight: 600; }
    .muted, .empty, .meta { color: var(--muted); }
    .empty { padding: 14px 8px; text-align: center; }
    .seg { flex-wrap: wrap; }
    .seg button { flex: 0 1 auto; padding: 4px 7px; }
    .seg button.active { color: white; border-color: var(--moo-action); background: var(--moo-action); }
    .composer-dock { position: sticky; bottom: -8px; z-index: 3; margin: auto -8px -8px; padding: 9px 8px 8px; border-top: 1px solid var(--line); background: var(--vscode-sideBar-background, var(--vscode-editor-background)); }
    .composer-box { min-width: 0; padding: 7px; border: 1px solid var(--line); border-radius: 14px; background: var(--input); box-shadow: 0 -7px 24px rgba(0,0,0,.12); }
    .composer-box:focus-within { border-color: var(--vscode-focusBorder, var(--moo)); box-shadow: 0 0 0 1px color-mix(in srgb, var(--vscode-focusBorder, var(--moo)) 45%, transparent), 0 -7px 24px rgba(0,0,0,.12); }
    .composer-head { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
    .composer-head .seg { flex-wrap: nowrap; }
    .composer-trust { color: var(--muted); font-size: 10px; white-space: nowrap; }
    .composer-label { display: block; margin: 7px 2px 0; font-weight: 600; }
    #instruction {
      display: block; width: 100%; max-width: 100%; min-width: 0; min-height: 72px; max-height: 180px;
      resize: vertical; border: 0; outline: 0; border-radius: 7px;
      padding: 7px 3px; color: var(--vscode-input-foreground, inherit); background: transparent;
    }
    .skill-suggestions { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 7px; }
    .skill-suggestions:empty { display: none; }
    .skill-chip { padding: 3px 7px; color: var(--vscode-textLink-foreground, #4daafc); border-radius: 12px; }
    .ref-summary { margin-top: 7px; padding: 6px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--input); }
    .ref-summary[hidden] { display: none; }
    .ref-summary-hd { margin-bottom: 4px; color: var(--muted); font-size: 10px; }
    .ref-labels { display: flex; flex-wrap: wrap; gap: 4px; }
    .ref-label { max-width: 100%; padding: 2px 6px; border-radius: 10px; background: var(--card); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .quick-drawer { display: inline-block; max-width: 100%; margin-top: 7px; border: 1px solid var(--line); border-radius: 9px; background: var(--card); overflow: hidden; }
    .quick-drawer[open] { display: block; }
    .quick-drawer > summary { padding: 6px 8px; cursor: pointer; color: var(--muted); font-weight: 600; user-select: none; }
    .quick-drawer[open] > summary { border-bottom: 1px solid var(--line); }
    .quick-fieldset { min-width: 0; margin: 0; padding: 8px; border: 0; }
    .quick-section + .quick-section { margin-top: 9px; padding-top: 9px; border-top: 1px solid var(--line); }
    .quick-title { margin-bottom: 5px; color: var(--muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .quick-editor { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 5px; align-items: end; margin-top: 5px; }
    .quick-editor label { min-width: 0; }
    .quick-editor input { margin-top: 3px; }
    .quick-editor button { white-space: nowrap; }
    .quick-actions { display: flex; flex-wrap: wrap; gap: 5px; }
    .lp-pz-l { margin: 6px 0 3px; color: var(--muted); font-size: 10px; }
    .lp-pz-row { display: flex; flex-wrap: wrap; min-width: 0; gap: 4px; }
    .lp-sw { width: 22px; height: 22px; padding: 3px; border-radius: 50%; }
    .lp-sw-dot { display: block; width: 100%; height: 100%; border-radius: 50%; }
    .lp-pz-chip { padding: 3px 6px; font-size: 10px; }
    .composer-tools { display: flex; align-items: center; gap: 5px; min-width: 0; margin-top: 5px; }
    .model-picker { position: relative; min-width: 0; }
    .model-picker > summary { list-style: none; cursor: pointer; padding: 5px 7px; border: 1px solid var(--line); border-radius: 8px; color: var(--muted); white-space: nowrap; }
    .model-picker > summary::-webkit-details-marker { display: none; }
    .model-picker[open] > summary { color: var(--vscode-foreground); border-color: var(--moo); }
    .model-menu { position: absolute; left: 0; bottom: calc(100% + 5px); z-index: 8; display: grid; width: min(210px, 76vw); gap: 3px; padding: 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--vscode-editorWidget-background, var(--vscode-sideBar-background)); box-shadow: 0 8px 24px rgba(0,0,0,.35); }
    .model-menu button { text-align: left; }
    .model-menu button.active { color: white; border-color: var(--moo-action); background: var(--moo-action); }
    .composer-note { flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; }
    .submit-icon { flex: 0 0 auto; width: 30px; height: 30px; display: grid; place-items: center; margin-left: auto; padding: 0; border-radius: 9px; font-size: 17px; }
    .primary { color: white; border-color: var(--moo-action); background: var(--moo-action); font-weight: 600; }
    .danger { border-color: color-mix(in srgb, var(--danger) 65%, var(--line)); }
    .progress { display: none; align-items: center; gap: 7px; margin-top: 7px; color: var(--muted); }
    .progress.on { display: flex; }
    .spinner { width: 12px; height: 12px; flex: 0 0 auto; border: 2px solid var(--line); border-top-color: var(--moo); border-radius: 50%; animation: spin .85s linear infinite; }
    .thread { min-width: 0; padding: 10px 2px 4px; }
    .lpjt, .lp-diff, .lp-sec-thread { min-width: 0; }
    .lpjt-hd, .lp-diff-hd, .lp-sec-thread-hd { display: flex; justify-content: space-between; gap: 6px; margin-bottom: 6px; font-weight: 600; }
    .lpjt-list { display: grid; gap: 0; }
    .lpjt-turn { position: relative; padding: 9px 2px 9px 14px; border: 0; border-top: 1px solid color-mix(in srgb, var(--line) 70%, transparent); border-radius: 0; background: transparent; overflow-wrap: anywhere; }
    .lpjt-turn::before { content: ''; position: absolute; left: 2px; top: 14px; width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
    .lpjt-turn-user::before { background: var(--vscode-focusBorder, #4895ef); }
    .lpjt-turn-assistant::before { background: var(--moo); box-shadow: 0 0 7px color-mix(in srgb, var(--moo) 45%, transparent); }
    .lpjt-meta { display: flex; flex-wrap: wrap; gap: 4px; color: var(--muted); font-size: 10px; }
    .lpjt-text, .lp-task-txt { margin-top: 3px; overflow-wrap: anywhere; }
    .lpjt-state { border-radius: 9px; padding: 1px 6px; font-size: 10px; }
    .lpjt-working { color: var(--moo); background: var(--moo-soft); }
    .lpjt-awaiting { color: var(--wait); background: color-mix(in srgb, var(--wait) 14%, transparent); }
    .lpjt-approved { color: var(--ok); background: color-mix(in srgb, var(--ok) 14%, transparent); }
    .lp-md-ul { margin: 4px 0; padding-left: 18px; }
    .lp-md-h { margin-top: 5px; font-weight: 700; }
    .lp-md-sp { height: 5px; }
    code { padding: 1px 3px; border-radius: 3px; background: var(--input); overflow-wrap: anywhere; }
    .diff-lines { max-height: 220px; overflow: auto; margin-top: 6px; border-radius: 5px; background: var(--input); }
    .diff-line { padding: 1px 6px; white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--vscode-editor-font-family, monospace); font-size: 10px; }
    .diff-line.add { color: var(--vscode-gitDecoration-addedResourceForeground, #65b477); }
    .diff-line.remove { color: var(--vscode-gitDecoration-deletedResourceForeground, #e05d68); }
    .actions { flex-wrap: wrap; margin-top: 7px; }
    .ok-action { border-color: var(--ok); }
    .wait-note { padding: 6px 7px; margin-top: 6px; border-left: 3px solid var(--wait); background: color-mix(in srgb, var(--wait) 10%, transparent); }
    .result-ok { color: var(--ok); }
    .result-error { color: var(--danger); }
    .lp-sec-hdr, .lp-sec-meta, .lp-sec-causes, .lp-sec-report, .lp-sec-thread { margin: 6px 0; overflow-wrap: anywhere; }
    .lp-sec-counts { display: flex; flex-wrap: wrap; gap: 4px; margin: 7px 0; }
    .lp-sec-count { padding: 2px 6px; border: 1px solid var(--line); border-radius: 10px; }
    .lp-sec-count.critical { border-color: var(--danger); }
    .lp-sec-count.warning { border-color: var(--wait); }
    .lp-sec-group { margin: 5px 0; border: 1px solid var(--line); border-radius: 6px; padding: 5px 6px; }
    .lp-sec-item { display: grid; gap: 3px; padding: 5px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
    .lp-sec-label { font-weight: 600; }
    .lp-sec-detail { color: var(--muted); }
    .lp-sec-actions { display: flex; flex-wrap: wrap; gap: 5px; }
    .lp-sec-err, .lp-pub-err { color: var(--danger); }
    .lp-sec-thread-row { padding: 4px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
    .destination { display: grid; gap: 6px; }
    .dest-row { align-items: flex-start; padding: 6px; border: 1px solid var(--line); border-radius: 6px; }
    .dest-icon { flex: 0 0 20px; }
    .dest-body { min-width: 0; flex: 1; }
    .dest-body b, .dest-value { display: block; }
    .dest-value { color: var(--muted); overflow-wrap: anywhere; }
    .link-button { width: 100%; padding: 0; border: 0; background: transparent; color: var(--vscode-textLink-foreground, #4daafc); text-align: left; overflow-wrap: anywhere; }
    input[type="text"] { width: 100%; max-width: 100%; min-width: 0; margin-top: 6px; padding: 6px 7px; border: 1px solid var(--line); border-radius: 6px; background: var(--input); }
    .publish-gate { margin-top: 7px; padding-top: 7px; border-top: 1px solid var(--line); }
    .meo-lenses { flex-wrap: wrap; margin-bottom: 8px; }
    .meo-lenses button.active { border-color: var(--moo); background: var(--moo-soft); }
    .meo-kpis { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 5px; }
    .meo-kpi { min-width: 0; padding: 7px; border: 1px solid var(--line); border-radius: 6px; }
    .meo-kpi b, .meo-kpi span { display: block; overflow-wrap: anywhere; }
    .meo-kpi b { font-size: 15px; }
    .meo-kpi span { color: var(--muted); font-size: 10px; }
    .meo-sec { margin-top: 8px; }
    .meo-sec-hd { margin-bottom: 4px; color: var(--muted); font-size: 10px; font-weight: 700; text-transform: uppercase; }
    .meo-agent, .meo-flow, .meo-delivery, .meo-session-row, .meo-step-top { display: flex; flex-wrap: wrap; gap: 4px 8px; min-width: 0; }
    .meo-agent, .meo-flow, .meo-session, .meo-step { padding: 5px 0; border-top: 1px solid var(--line); overflow-wrap: anywhere; }
    .meo-warns { margin-top: 6px; padding: 5px; color: var(--wait); border: 1px solid var(--wait); border-radius: 5px; }
    .lpx-tbl { overflow-x: auto; }
    .lpx-tr { display: grid; grid-template-columns: repeat(6,minmax(65px,1fr)); gap: 4px; min-width: 410px; padding: 3px 0; border-top: 1px solid var(--line); }
    .lpx-cell, .lpx-foot, .lpx-lane-meta, .meo-step-meta { color: var(--muted); overflow-wrap: anywhere; }
    .lpbr, .lpx { min-width: 0; }
    .lpbr-mix { display: flex; height: 5px; margin: 5px 0; overflow: hidden; border-radius: 3px; background: var(--line); }
    .lpbr-mix span { display: block; }
    .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes pulse { 50% { opacity: .35; transform: scale(.78); } }
    @keyframes surfaceGlow { 50% { opacity: .48; transform: scaleX(.72); } }
    @keyframes surfaceNudge { 50% { transform: translateX(2px); opacity: .6; } }
    @media (max-width: 280px) {
      [role="tab"] { font-size: 10px; }
      .tab-word { display: none; }
      .meo-kpis { grid-template-columns: 1fr; }
      .quick-editor { grid-template-columns: 1fr; }
      .composer-note { display: none; }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: .001ms !important; animation-iteration-count: 1 !important; scroll-behavior: auto !important; transition-duration: .001ms !important; }
    }
  </style>
</head>
<body>
  <div class="shell">
    <header class="top">
      <div class="surface-switch" role="navigation" aria-label="Alternar superfície do Mooter">
        <button type="button" class="surface-choice" data-surface="cockpit" title="Voltar ao Cockpit">🧭 Cockpit</button>
        <span class="surface-swap" aria-hidden="true">⇄</span>
        <button type="button" class="surface-choice active" data-surface="live" aria-current="page" title="Live Preview ativo">⚡ Live Preview</button>
      </div>
      <div class="brand">
        <strong>🐮 Mooter</strong>
        <span id="health" class="health"><span class="health-dot" aria-hidden="true"></span><span id="health-label">a ligar…</span></span>
        <span id="stage" class="stage"></span>
      </div>
      <nav class="tabs" role="tablist" aria-label="Ferramentas do Live Preview">
        <button type="button" id="tab-edit" role="tab" data-tab="edit" aria-label="Editar" aria-controls="panel-edit" aria-selected="true" tabindex="0">✎ <span class="tab-word">Editar</span></button>
        <button type="button" id="tab-security" role="tab" data-tab="security" aria-label="Security" aria-controls="panel-security" aria-selected="false" tabindex="-1">🛡 <span class="tab-word">Security</span><span id="security-badge" class="badge" aria-label="0 findings" hidden>0</span></button>
        <button type="button" id="tab-publish" role="tab" data-tab="publish" aria-label="Publish" aria-controls="panel-publish" aria-selected="false" tabindex="-1">🚀 <span class="tab-word">Publish</span></button>
        <button type="button" id="tab-meo" role="tab" data-tab="meo" aria-label="MEO" aria-controls="panel-meo" aria-selected="false" tabindex="-1">🧠 <span class="tab-word">MEO</span></button>
      </nav>
    </header>
    <main>
      <section id="panel-edit" role="tabpanel" aria-labelledby="tab-edit" data-panel="edit">
        <div class="selection-context" aria-label="Contexto do elemento selecionado">
          <span class="selection-pin" aria-hidden="true">⌖</span>
          <div id="selection" class="selection"><b>Nenhum elemento selecionado</b><span>Seleciona algo no preview para começar.</span></div>
        </div>
        <div id="thread" class="thread"></div>
        <div id="edit-result"></div>
        <div class="composer-dock">
          <div class="composer-box" aria-label="Prompt do elemento selecionado">
            <div class="composer-head">
              <div class="seg" aria-label="Intenção">
                <button type="button" data-intent="edit" class="active" aria-pressed="true">✎ Editar</button>
                <button type="button" data-intent="ask" aria-pressed="false">💬 Perguntar</button>
              </div>
              <span class="composer-trust" title="O alvo é revalidado no host antes de qualquer operação">🛡 alvo no host</span>
            </div>
            <label class="composer-label sr-only" for="instruction">O que o Moo deve fazer neste elemento?</label>
            <textarea id="instruction" rows="4" placeholder="Diz ao Moo o que editar ou pergunta sobre este elemento…"></textarea>
            <div id="skill-suggestions" class="skill-suggestions" aria-label="Sugestões para este elemento"></div>
            <div id="selection-refs" class="ref-summary" aria-live="polite" hidden></div>
            <div class="composer-tools">
              <details class="model-picker">
                <summary id="model-summary" aria-label="Escolher modelo">🧭 Auto</summary>
                <div class="model-menu" role="group" aria-label="Modelo">
                  <button type="button" data-mode="auto" class="active" aria-pressed="true">🧭 Auto · Moo decide</button>
                  <button type="button" data-mode="local" aria-pressed="false">🐮 local $0</button>
                  <button type="button" data-mode="t1" aria-pressed="false">⚡ Haiku</button>
                  <button type="button" data-mode="t2" aria-pressed="false">🎼 Sonnet</button>
                  <button type="button" data-mode="t3" aria-pressed="false">🧠 Opus</button>
                  <button type="button" data-mode="fable" aria-pressed="false" title="T5 · opt-in explícito; nunca escolhido pelo Auto">🌟 @fable</button>
                </div>
              </details>
              <span id="submit-hint" class="muted composer-note">identidade revalidada no host</span>
              <button type="button" id="submit" class="primary submit-icon" aria-label="Editar elemento" title="Editar elemento (Ctrl+Enter)"><span id="submit-action-label" class="sr-only">Editar</span><span aria-hidden="true">↑</span></button>
            </div>
            <details id="quick-adjustments" class="quick-drawer">
              <summary>✦ Texto · Cor · Espaço</summary>
              <fieldset id="quick-actions-fieldset" class="quick-fieldset">
                <legend class="sr-only">Ajustes rápidos do elemento selecionado</legend>
                <div class="quick-section">
                  <div class="quick-title">Estilo visual · prévia antes de aplicar</div>
                  <div id="quick-presets"></div>
                </div>
                <div class="quick-section">
                  <div class="quick-title">Texto e classes</div>
                  <div class="quick-editor">
                    <label for="quick-text">Texto<input type="text" id="quick-text" autocomplete="off" placeholder="Novo texto"></label>
                    <button type="button" data-preview-kind="text">ver proposta</button>
                  </div>
                  <div class="quick-editor">
                    <label for="quick-class">Classes<input type="text" id="quick-class" autocomplete="off" spellcheck="false" placeholder="ex.: text-lg font-bold"></label>
                    <button type="button" data-preview-kind="class">ver proposta</button>
                  </div>
                </div>
                <div class="quick-section quick-actions">
                  <button type="button" id="open-source">↗ Abrir no editor</button>
                  <button type="button" id="delete-preview" class="danger">⌫ Apagar…</button>
                </div>
              </fieldset>
            </details>
            <div id="progress" class="progress" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span id="progress-text">a preparar…</span><button type="button" id="cancel-task">cancelar</button></div>
          </div>
        </div>
      </section>

      <section id="panel-security" role="tabpanel" aria-labelledby="tab-security" data-panel="security" hidden>
        <div class="card">
          <div class="card-hd"><span>🛡 Review Security</span><button type="button" id="security-scan" class="primary">Refresh scan</button></div>
          <div id="security-status" class="muted" role="status" aria-live="polite">Ainda sem review nesta versão.</div>
          <div id="security-task-progress" class="progress" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span id="security-task-progress-text">a preparar…</span><button type="button" id="cancel-security-task">cancelar</button></div>
        </div>
        <div id="security-task-result"></div>
        <div id="security-result" class="card"></div>
      </section>

      <section id="panel-publish" role="tabpanel" aria-labelledby="tab-publish" data-panel="publish" hidden>
        <div class="card">
          <div class="card-hd"><span>🚀 Destinos</span><button type="button" id="publish-refresh">Atualizar</button></div>
          <div id="publish-state"></div>
        </div>
      </section>

      <section id="panel-meo" role="tabpanel" aria-labelledby="tab-meo" data-panel="meo" hidden>
        <div class="meo-lenses" role="toolbar" aria-label="Lentes do MEO">
          <button type="button" data-meo-lens="control" class="active">Control</button>
          <button type="button" data-meo-lens="stream">Stream</button>
          <button type="button" data-meo-lens="sessions">Sessões</button>
          <button type="button" data-meo-lens="day">Dia</button>
          <button type="button" data-meo-lens="model">LLM</button>
          <button type="button" data-meo-lens="fleet">Fleet</button>
        </div>
        <div id="meo-brain" class="card"></div>
        <div id="meo-view" class="card"></div>
      </section>
    </main>
  </div>
  <script nonce="${nonce}">
  'use strict';
  const SIDEBAR_TOKEN = ${hostToken};
  const vscode = acquireVsCodeApi();
  ${renderers}

  const initialState = {
    active: false,
    selection: null,
    journey: null,
    taskStatus: null,
    taskResult: null,
    editDiff: null,
    deleteDiff: null,
    refs: null,
    security: null,
    securityResult: null,
    securityTaskStatus: null,
    securityTaskResult: null,
    publish: null,
    meo: null,
    readiness: null,
    stage: null,
  };
  const validTabs = ['edit', 'security', 'publish', 'meo'];
  const validModes = ['auto', 'local', 't1', 't2', 't3', 'fable'];
  const persisted = readPersistedUi();
  let state = initialState;
  let activeTab = validTabs.includes(persisted.activeTab) ? persisted.activeTab : 'edit';
  let intent = 'edit';
  let mode = validModes.includes(persisted.mode) ? persisted.mode : 'auto';
  let meoLens = 'control';
  let taskStatus = null;
  let taskResult = null;
  let securityTaskStatus = null;
  let securityTaskResult = null;
  let editDiff = null;
  let deleteDiff = null;
  let editResult = null;
  let securityResult = null;
  let publishResult = null;
  let quickSelectionKey = '';
  let currentJourneyKey = '';
  const journeyDrafts = persisted.drafts;

  function readPersistedUi() {
    let saved = null;
    try { saved = vscode && typeof vscode.getState === 'function' ? vscode.getState() : null; } catch (_error) { saved = null; }
    const raw = saved && typeof saved === 'object' ? saved : {};
    const drafts = Object.create(null);
    const source = raw.drafts && typeof raw.drafts === 'object' ? raw.drafts : {};
    Object.keys(source).slice(-20).forEach(function (key) {
      if (!safeJourneyKey(key) || typeof source[key] !== 'string') return;
      drafts[key] = source[key].slice(0, 12000);
    });
    return { activeTab: raw.activeTab, mode: raw.mode, drafts: drafts };
  }

  function safeJourneyKey(value) {
    const key = typeof value === 'string' ? value.slice(0, 160) : '';
    return key && key !== '__proto__' && key !== 'constructor' && key !== 'prototype' ? key : '';
  }

  function journeyKeyOf(value) {
    const projection = value && typeof value === 'object' ? value : {};
    const journey = projection.journey && typeof projection.journey === 'object' ? projection.journey : null;
    return safeJourneyKey(journey && journey.id);
  }

  function rememberDraft(key, value) {
    const safeKey = safeJourneyKey(key);
    if (!safeKey) return;
    const draft = typeof value === 'string' ? value.slice(0, 12000) : '';
    delete journeyDrafts[safeKey];
    if (draft) journeyDrafts[safeKey] = draft;
    const keys = Object.keys(journeyDrafts);
    while (keys.length > 20) delete journeyDrafts[keys.shift()];
  }

  function persistUi() {
    try {
      if (!vscode || typeof vscode.setState !== 'function') return;
      const drafts = {};
      Object.keys(journeyDrafts).slice(-20).forEach(function (key) { drafts[key] = journeyDrafts[key]; });
      vscode.setState({ version: 1, activeTab: activeTab, mode: mode, drafts: drafts });
    } catch (_error) { /* persistence never blocks the native view */ }
  }

  function syncComposerJourney(nextState) {
    const nextKey = journeyKeyOf(nextState);
    if (nextKey === currentJourneyKey) return false;
    const composer = document.getElementById('instruction');
    if (composer) rememberDraft(currentJourneyKey, composer.value);
    currentJourneyKey = nextKey;
    if (composer) composer.value = nextKey && typeof journeyDrafts[nextKey] === 'string' ? journeyDrafts[nextKey] : '';
    taskStatus = null;
    taskResult = null;
    editDiff = null;
    deleteDiff = null;
    editResult = null;
    quickSelectionKey = '';
    persistUi();
    return true;
  }

  function persistComposerDraft() {
    const composer = document.getElementById('instruction');
    if (!composer) return;
    rememberDraft(currentJourneyKey, composer.value);
    persistUi();
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char];
    });
  }

  function post(type, payload) {
    vscode.postMessage(Object.assign({}, payload || {}, { type: type, __t: SIDEBAR_TOKEN }));
  }

  function object(value) {
    return value && typeof value === 'object' ? value : null;
  }

  function text(value, fallback) {
    return typeof value === 'string' && value ? value : (fallback || '');
  }

  function selectIntent(next) {
    if (next !== 'edit' && next !== 'ask') return;
    intent = next;
    const localButton = document.querySelectorAll('[data-mode]').find
      ? document.querySelectorAll('[data-mode]').find(function (item) { return item.dataset.mode === 'local'; })
      : Array.prototype.find.call(document.querySelectorAll('[data-mode]'), function (item) { return item.dataset.mode === 'local'; });
    if (intent === 'ask' && mode === 'local') selectMode('auto');
    if (localButton) {
      localButton.disabled = intent === 'ask';
      localButton.title = intent === 'ask' ? 'Perguntar usa um agente com contexto do projeto; local $0 só edita o nó.' : '';
    }
    document.querySelectorAll('[data-intent]').forEach(function (item) {
      const on = item.dataset.intent === intent;
      item.classList.toggle('active', on);
      item.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const submit = document.getElementById('submit');
    const actionLabel = intent === 'ask' ? 'Perguntar' : 'Editar';
    document.getElementById('submit-action-label').textContent = actionLabel;
    submit.setAttribute('aria-label', actionLabel + ' sobre o elemento');
    submit.title = actionLabel + ' (Ctrl+Enter)';
    document.getElementById('submit-hint').textContent = intent === 'ask'
      ? 'Perguntar usa Auto/agente para ler o contexto; local $0 fica só em Editar.'
      : 'A identidade fica no host.';
  }

  function selectMode(next) {
    if (!validModes.includes(next)) return;
    if (intent === 'ask' && next === 'local') next = 'auto';
    mode = next;
    document.querySelectorAll('[data-mode]').forEach(function (item) {
      const on = item.dataset.mode === mode;
      item.classList.toggle('active', on);
      item.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    const labels = { auto: '🧭 Auto', local: '🐮 local $0', t1: '⚡ Haiku', t2: '🎼 Sonnet', t3: '🧠 Opus', fable: '🌟 @fable' };
    document.getElementById('model-summary').textContent = labels[mode] || labels.auto;
    const picker = document.querySelector('.model-picker');
    if (picker && picker.open) picker.open = false;
    persistUi();
  }

  // Suggestions use only the semantic tag projection. Copy, text content, source locations and
  // any host identity deliberately play no part in choosing a chip.
  function contextualSkills(selection) {
    const tag = String(selection && selection.tag || '').toLowerCase();
    const suggestions = [];
    function add(label, seed, suggestedMode) { suggestions.push({ label: label, seed: seed, mode: suggestedMode || 'auto' }); }
    if (/^(img|image|picture|svg)$/.test(tag)) {
      add('💡 /icon', '/icon — otimiza esta imagem ou ícone sem perder a identidade visual', 'auto');
      add('♿ /a11y', '/a11y — valida texto alternativo e acessibilidade deste elemento', 'auto');
    } else if (/^h[1-6]$/.test(tag)) {
      add('✍ /copy', '/copy — melhora este título mantendo a voz do projeto', 'auto');
      add('♿ /a11y', '/a11y — valida hierarquia e clareza deste título', 'auto');
    } else if (/^(p|span|li|label|strong|em)$/.test(tag)) {
      add('✍ /copy', '/copy — melhora este texto em coerência com o projeto', 'auto');
      add('♿ /a11y', '/a11y — valida legibilidade e acessibilidade deste texto', 'auto');
    } else if (/^(button|a|input|select|textarea)$/.test(tag)) {
      add('♿ /a11y', '/a11y — valida nome, foco e interação deste controlo', 'auto');
      add('✍ /copy', '/copy — melhora o texto desta ação mantendo a intenção', 'auto');
    } else if (/^(main|section|article|aside|header|footer|nav|div)$/.test(tag)) {
      add('▦ /section', '/section — melhora a hierarquia e composição desta secção', 'auto');
      add('✨ /restyle', '/restyle — refina visualmente esta secção dentro do design system', 'auto');
    } else if (tag) {
      add('✨ /restyle', '/restyle — melhora este elemento dentro do design system', 'auto');
      add('♿ /a11y', '/a11y — valida a acessibilidade deste elemento', 'auto');
    }
    return suggestions.slice(0, 2);
  }

  function renderContextSkills() {
    const mount = document.getElementById('skill-suggestions');
    const suggestions = contextualSkills(object(state.selection));
    mount.innerHTML = suggestions.map(function (skill) {
      return '<button type="button" class="skill-chip" data-skill-seed="' + esc(skill.seed) + '" data-skill-mode="' + esc(skill.mode) + '">' + esc(skill.label) + '</button>';
    }).join('');
    const disabled = !object(state.selection) || state.active !== true;
    mount.querySelectorAll('button').forEach(function (button) { button.disabled = disabled; });
  }

  function renderReferenceSummary() {
    const mount = document.getElementById('selection-refs');
    const projection = object(state.refs) || {};
    const count = Math.max(0, Math.min(8, Number(projection.count) || 0));
    const labels = Array.isArray(projection.labels) ? projection.labels.filter(function (label) { return typeof label === 'string' && label; }).slice(0, count || 8) : [];
    mount.hidden = count < 1;
    if (!count) { mount.innerHTML = ''; return; }
    mount.innerHTML = '<div class="ref-summary-hd">' + count + ' referência' + (count === 1 ? '' : 's') + ' anexada' + (count === 1 ? '' : 's') + ' · contexto revalidado pelo host</div>'
      + '<div class="ref-labels">' + labels.map(function (label) { return '<span class="ref-label" title="' + esc(label) + '">' + esc(label) + '</span>'; }).join('') + '</div>';
  }

  function renderQuickAdjustments() {
    document.getElementById('quick-presets').innerHTML = renderPresetsBarHTML(esc);
  }

  function setTab(next, moveFocus) {
    if (!validTabs.includes(next)) return;
    activeTab = next;
    let selectedTab = null;
    document.querySelectorAll('[role="tab"][data-tab]').forEach(function (button) {
      const selected = button.getAttribute('data-tab') === next;
      button.setAttribute('aria-selected', selected ? 'true' : 'false');
      button.tabIndex = selected ? 0 : -1;
      if (selected) selectedTab = button;
    });
    document.querySelectorAll('[role="tabpanel"][data-panel]').forEach(function (panel) {
      panel.hidden = panel.getAttribute('data-panel') !== next;
    });
    if (moveFocus && selectedTab) selectedTab.focus();
    persistUi();
    if (next === 'publish') post('lp-publish-status');
  }

  function securityCounts(value) {
    const security = object(value) || {};
    const counts = object(security.counts) || {};
    const critical = Number(counts.critical) || 0;
    const warning = Number(counts.warning) || 0;
    const info = Number(counts.info) || 0;
    return { critical: critical, warning: warning, info: info, total: Number(counts.total) || critical + warning + info };
  }

  function renderHeader() {
    const readiness = object(state.readiness) || {};
    const selection = object(state.selection);
    const health = document.getElementById('health');
    const ready = state.active === true && readiness.ready !== false;
    const busyStatus = taskStatus || securityTaskStatus;
    const busy = !!(busyStatus && ['route', 'thinking', 'tool'].includes(busyStatus.phase));
    health.className = 'health ' + (busy ? 'busy' : (ready ? 'ready' : ''));
    document.getElementById('health-label').textContent = busy ? 'a trabalhar' : (ready ? text(readiness.label, 'pronto') : text(readiness.reason, 'preview indisponível'));

    const selectionEl = document.getElementById('selection');
    if (!selection) {
      selectionEl.innerHTML = '<b>Nenhum elemento selecionado</b><span>Seleciona algo no preview para começar.</span>';
    } else {
      const label = text(selection.label, text(selection.tag, 'Elemento selecionado'));
      const detail = text(selection.summary, text(selection.text, 'Thread pronta para este elemento'));
      selectionEl.innerHTML = '<b>📍 ' + esc(label) + '</b><span>' + esc(detail.slice(0, 160)) + '</span>';
    }
    const stage = object(state.stage);
    document.getElementById('stage').textContent = stage ? text(stage.label, text(stage.status, 'preview')) : text(state.stage, '');
    document.getElementById('instruction').disabled = !selection || state.active !== true;
    document.getElementById('submit').disabled = !selection || state.active !== true;
    document.getElementById('quick-actions-fieldset').disabled = !selection || state.active !== true;
    const nextQuickKey = selection ? text(selection.label, text(selection.tag)) : '';
    if (nextQuickKey !== quickSelectionKey) {
      quickSelectionKey = nextQuickKey;
      document.getElementById('quick-text').value = selection ? text(selection.text) : '';
      document.getElementById('quick-class').value = selection ? text(selection.className) : '';
    }
    renderContextSkills();
  }

  function renderThread() {
    document.getElementById('thread').innerHTML = renderJourneyThread(state.journey);
  }

  function progressLabel(status) {
    const s = object(status) || {};
    if (s.phase === 'route') return '🧭 ' + text(s.label, 'a escolher o modelo…');
    if (s.phase === 'thinking') return '🐮 a pensar com ' + (s.mode === 'auto' ? 'Auto' : text(s.model, text(s.mode, 'modelo'))) + '…';
    if (s.phase === 'tool') return (s.tool === 'Edit' || s.tool === 'MultiEdit' ? '✎ a alterar o código…' : '👁 a validar o projeto…');
    if (s.phase === 'deny') return '🛡 ação recusada: ' + text(s.why, text(s.tool, 'guardrail'));
    return text(s.label, 'a trabalhar…');
  }

  function renderProgressInto(status, progressId, labelId) {
    const active = !!(status && ['route', 'thinking', 'tool'].includes(status.phase));
    const progress = document.getElementById(progressId);
    progress.className = 'progress' + (active ? ' on' : '');
    if (active) document.getElementById(labelId).textContent = progressLabel(status);
  }

  function renderProgress() {
    renderProgressInto(taskStatus, 'progress', 'progress-text');
    renderProgressInto(securityTaskStatus, 'security-task-progress', 'security-task-progress-text');
  }

  function diffLines(value) {
    if (Array.isArray(value)) return value.slice(0, 100).map(String);
    if (typeof value === 'string') return value.split('\\n').slice(0, 100);
    return [];
  }

  function taskResultHtml(rawResult, context) {
    const result = object(rawResult);
    if (!result) return '';
    const securityContext = context === 'security';
    const ok = result.ok !== false;
    const settled = result.settled === 'kept' ? 'mantido' : (result.settled === 'reverted' ? 'revertido' : (ok ? 'concluído' : 'bloqueado'));
    let html = '<div class="card lp-diff" role="region" aria-label="' + (securityContext ? 'Correção de segurança' : 'Resultado do pedido') + '">';
    html += '<div class="lp-diff-hd"><span>' + (securityContext ? '🛡 Correção' : (result.kind === 'answer' ? '💬 Resposta' : '✎ Alteração')) + '</span><span class="' + (ok ? 'result-ok' : 'result-error') + '">' + settled + '</span></div>';
    if (result.text) html += '<div class="lp-task-txt">' + renderMarkdownSafe(result.text) + '</div>';
    if (!ok) html += '<div class="result-error">' + esc(text(result.reason, 'Não foi possível concluir.')) + '</div>';
    const edits = Array.isArray(result.edits) ? result.edits : [];
    for (let i = 0; i < edits.length; i += 1) {
      const lines = diffLines(edits[i] && edits[i].diff);
      html += '<div class="meta" style="margin-top:6px">proposta ' + (i + 1) + '</div><div class="diff-lines">';
      for (let j = 0; j < lines.length; j += 1) {
        const line = lines[j];
        const kind = line.charAt(0) === '+' ? ' add' : (line.charAt(0) === '-' ? ' remove' : '');
        html += '<div class="diff-line' + kind + '">' + esc(line) + '</div>';
      }
      html += lines.length ? '</div>' : '<div class="muted">diff indisponível — o host preserva a prova da alteração.</div></div>';
    }
    if (ok && edits.length) {
      html += '<div class="wait-note">' + (securityContext ? 'A correção está no preview. Confirma OK ou reverte; depois corre novamente o Review Security.' : 'A alteração está no preview e aguarda o teu OK antes de poder seguir para Publish.') + '</div>';
      html += '<div class="actions"><button type="button" class="ok-action" data-task-keep="' + esc(text(result.taskId)) + '">OK — manter</button><button type="button" class="danger" data-task-revert="' + esc(text(result.taskId)) + '">Reverter</button></div>';
    } else if (!securityContext && ok && result.askId) {
      html += '<div class="actions"><button type="button" class="primary" data-ask-apply="' + esc(result.askId) + '">Aplicar com o agente</button></div>';
    }
    html += '</div>';
    return html;
  }

  function renderEditResult() {
    const mount = document.getElementById('edit-result');
    let html = taskResultHtml(taskResult, 'edit');

    const proposal = object(editDiff);
    if (proposal) {
      let lines = diffLines(proposal.diff || proposal.lines);
      if (!lines.length) {
        lines = diffLines(proposal.removed).map(function (line) { return '- ' + line; })
          .concat(diffLines(proposal.added).map(function (line) { return '+ ' + line; }));
      }
      html += '<div class="card lp-diff" role="region" aria-label="Prévia da alteração"><div class="lp-diff-hd"><span>Proposta pronta</span><span class="muted">revê antes de aplicar</span></div>';
      if (proposal.message) html += '<div>' + esc(proposal.message) + '</div>';
      if (proposal.ok === false) html += '<div class="result-error">' + esc(text(proposal.reason, 'Não foi possível preparar a proposta.')) + '</div>';
      if (lines.length) {
        html += '<div class="diff-lines">';
        for (let k = 0; k < lines.length; k += 1) {
          const proposalLine = lines[k];
          const proposalKind = proposalLine.charAt(0) === '+' ? ' add' : (proposalLine.charAt(0) === '-' ? ' remove' : '');
          html += '<div class="diff-line' + proposalKind + '">' + esc(proposalLine) + '</div>';
        }
        html += '</div>';
      }
      if (proposal.ok !== false) html += '<div class="actions"><button type="button" class="primary" data-sidebar-edit-apply>Aplicar proposta</button><button type="button" data-edit-dismiss>Descartar</button></div>';
      html += '</div>';
    }

    const deletion = object(deleteDiff);
    if (deletion) {
      const removed = diffLines(deletion.diff || deletion.lines || deletion.removed);
      html += '<div class="card lp-diff" role="region" aria-label="Prévia da remoção"><div class="lp-diff-hd"><span>⌫ Apagar este elemento?</span><span class="result-error">confirmação obrigatória</span></div>';
      if (deletion.message) html += '<div>' + esc(deletion.message) + '</div>';
      if (deletion.ok === false) html += '<div class="result-error">' + esc(text(deletion.reason, 'Não foi possível preparar a remoção.')) + '</div>';
      if (removed.length) {
        html += '<div class="diff-lines">';
        for (let d = 0; d < removed.length; d += 1) html += '<div class="diff-line remove">' + esc(removed[d]) + '</div>';
        html += '</div>';
      }
      if (deletion.ok !== false) html += '<div class="actions"><button type="button" class="danger" data-sidebar-delete-apply>Confirmar remoção</button><button type="button" data-delete-dismiss>Cancelar</button></div>';
      html += '</div>';
    }

    const written = object(editResult);
    if (written) {
      html += '<div class="card ' + (written.ok ? 'result-ok' : 'result-error') + '">' + (written.ok ? '✓ Alteração refletida no preview.' : '✕ ' + esc(text(written.reason, 'Alteração recusada.'))) + '</div>';
    }
    mount.innerHTML = html;
  }

  function renderSecurity() {
    const summary = object(state.security) || {};
    const result = object(securityResult);
    const counts = securityCounts(result || summary);
    const badge = document.getElementById('security-badge');
    badge.hidden = counts.total < 1;
    badge.textContent = String(counts.total);
    badge.setAttribute('aria-label', counts.total + ' findings de segurança');
    const scanning = summary.state === 'scanning' || summary.state === 'running' || summary.running === true;
    const scanButton = document.getElementById('security-scan');
    scanButton.disabled = scanning;
    scanButton.textContent = scanning ? 'A analisar…' : 'Refresh scan';
    document.getElementById('security-status').textContent = scanning
      ? 'A procurar secrets, XSS, CSP e vulnerabilidades npm…'
      : (summary.state === 'complete' ? 'Review concluído para esta versão.' : (summary.state === 'error' ? 'O review falhou; abre o relatório e tenta de novo.' : 'Ainda sem review válido nesta versão.'));
    document.getElementById('security-task-result').innerHTML = taskResultHtml(securityTaskResult, 'security');
    document.getElementById('security-result').innerHTML = renderSecurityFindings(result, esc);
  }

  function validUrl(value) {
    if (typeof value !== 'string') return null;
    try {
      const parsed = new URL(value);
      return (parsed.protocol === 'https:' || parsed.protocol === 'http:') ? parsed.href : null;
    } catch (_error) { return null; }
  }

  function urlControl(value, fallback) {
    const url = validUrl(value);
    return url
      ? '<button type="button" class="link-button" data-open-url="' + esc(url) + '">' + esc(url) + '</button>'
      : '<span class="dest-value">' + esc(fallback || 'n/d') + '</span>';
  }

  function syncDeployConfirmation() {
    const input = document.getElementById('deploy-confirm');
    const button = document.getElementById('publish-deploy');
    if (!input || !button) return;
    const publish = object(state.publish) || {};
    const production = object(publish.production) || {};
    const expected = text(publish.projectName, text(production.projectName));
    button.disabled = button.dataset.deployReady !== 'true' || !expected || input.value.trim() !== expected;
  }

  function deployGateCopy(reason, projectName) {
    if (reason === 'git-publish-required') return 'Faz Commit + push antes do deploy.';
    if (reason === 'git-publish-stale') return 'O código mudou depois do push; publica um novo commit.';
    if (reason === 'git-publish-security-mismatch') return 'O commit enviado não corresponde ao Review Security atual.';
    if (reason) return 'Deploy bloqueado pela validação do host.';
    return projectName ? 'Escreve ' + projectName + ' exatamente para habilitar.' : 'Projeto de produção não ligado; deploy indisponível.';
  }

  function renderPublish() {
    const publish = object(state.publish) || {};
    const local = object(publish.local) || {};
    const git = object(publish.git) || {};
    const destination = object(publish.destination) || {};
    const production = object(publish.production) || {};
    const security = object(state.security) || {};
    const counts = securityCounts(securityResult || security);
    const securityReady = security.state === 'complete' && counts.critical === 0 && security.coverageComplete !== false;
    const publishReady = securityReady && publish.hasOpenCritical !== true;
    const deployReady = publishReady && !publish.deployReason;
    const localLabel = text(local.path, text(local.folder, text(local.label, 'workspace atual')));
    const gitUrl = text(git.webUrl, text(git.url));
    const productionUrl = text(production.url, text(publish.websiteUrl, text(destination.url)));
    const touchedFiles = Array.isArray(publish.touchedFiles) ? publish.touchedFiles : (Array.isArray(publish.files) ? publish.files : []);
    const filesCount = touchedFiles.length || Number(local.publishableCount) || 0;
    let html = '<div class="destination">';
    html += '<div class="dest-row"><span class="dest-icon">📁</span><div class="dest-body"><b>Local</b><span class="dest-value">' + esc(localLabel) + '</span><span class="meta">' + filesCount + ' ' + (filesCount === 1 ? 'alteração aprovada' : 'alterações aprovadas') + '</span></div></div>';
    html += '<div class="dest-row"><span class="dest-icon">⑂</span><div class="dest-body"><b>Git</b>' + urlControl(gitUrl, text(git.reason, 'remote não configurado')) + '<span class="meta">' + esc(text(publish.branch, text(git.targetBranch, 'branch n/d'))) + '</span></div></div>';
    html += '<div class="dest-row"><span class="dest-icon">🌐</span><div class="dest-body"><b>Produção</b>' + urlControl(productionUrl, 'URL de produção ainda não resolvida') + '<span class="meta">fonte: ' + esc(text(destination.source, 'n/d')) + '</span></div></div>';
    html += '</div>';
    if (!publishReady) html += '<div class="wait-note">Publish bloqueado até um Security Review completo, atual e sem Critical aberto, e até todas as alterações desta thread receberem OK.</div>';
    html += '<div class="publish-gate"><label for="commit-message"><b>Mensagem do commit protegido</b></label><input type="text" id="commit-message" value="' + esc(text(publish.defaultMessage, 'Live Preview: alteração aprovada')) + '" autocomplete="off"><div class="actions"><button type="button" id="publish-commit" class="primary"' + ((!publishReady || filesCount < 1 || !gitUrl) ? ' disabled' : '') + '>Commit + push</button></div></div>';
    const projectName = text(publish.projectName, text(production.projectName));
    const publishedCommit = text(publish.gitPublishedCommit);
    html += '<div class="publish-gate"><b>Deploy</b><div class="meta">' + (publishedCommit ? 'Commit ' + esc(publishedCommit) + ' já enviado. ' : '') + 'Confirma o projeto para publicar esse commit imutável, nunca o working tree.</div>';
    html += '<input type="text" id="deploy-confirm" autocomplete="off" placeholder="' + esc(projectName || 'nome do projeto') + '" aria-label="Nome do projeto para confirmar o deploy" aria-describedby="deploy-confirm-hint">';
    html += '<div id="deploy-confirm-hint" class="meta">' + esc(deployGateCopy(publish.deployReason, projectName)) + '</div>';
    html += '<div class="actions"><button type="button" id="publish-deploy" class="danger" data-deploy-ready="' + ((deployReady && projectName && gitUrl) ? 'true' : 'false') + '" disabled>Deploy para produção</button></div></div>';
    const outcome = object(publishResult);
    if (outcome) html += '<div class="publish-gate ' + (outcome.ok ? 'result-ok' : 'result-error') + '">' + (outcome.ok ? '✓ ' : '✕ ') + esc(outcome.ok ? text(outcome.message, outcome.action === 'deploy' ? 'Deploy concluído.' : 'Commit enviado.') : text(outcome.reason, 'Publish recusado.')) + (outcome.url ? '<div>' + urlControl(outcome.url, '') + '</div>' : '') + '</div>';
    document.getElementById('publish-state').innerHTML = html;
    syncDeployConfirmation();
  }

  function renderMeo() {
    const meo = object(state.meo) || {};
    document.getElementById('meo-brain').innerHTML = renderBrain(meo.brain || null);
    let html = '';
    if (meoLens === 'control') html = renderExecutiveOverview(meo.executive || meo.control || null);
    else if (meoLens === 'stream') html = renderExecutiveTimeline(meo.executive || meo.control || null);
    else if (meoLens === 'sessions') html = renderSessionBreakdown(meo.executive || meo.control || null);
    else if (meoLens === 'day') html = renderDayBreakdown(meo.byDay || null);
    else if (meoLens === 'model') html = renderModelBreakdown(meo.byModel || null);
    else if (meoLens === 'fleet') html = renderFleetLanes(meo.fleet || null);
    document.getElementById('meo-view').innerHTML = html;
  }

  function renderAll() {
    renderHeader();
    renderThread();
    renderReferenceSummary();
    renderProgress();
    renderEditResult();
    renderSecurity();
    renderPublish();
    renderMeo();
  }

  function projectedState(message) {
    const source = object(message.state) || object(message.payload) || message;
    const next = {};
    Object.keys(initialState).forEach(function (key) {
      next[key] = Object.prototype.hasOwnProperty.call(source, key) ? source[key] : state[key];
    });
    return next;
  }

  function normalTaskMatchesJourney(value, projected) {
    const payload = object(value);
    const journey = object((projected || state).journey);
    return !!(payload && journey && typeof payload.journeyId === 'string' && payload.journeyId && payload.journeyId === journey.id);
  }

  function restoreProjectedTasks(projection) {
    const hasSecurityStatus = Object.prototype.hasOwnProperty.call(projection, 'securityTaskStatus');
    const hasSecurityResult = Object.prototype.hasOwnProperty.call(projection, 'securityTaskResult');
    if (hasSecurityStatus) securityTaskStatus = object(projection.securityTaskStatus);
    if (hasSecurityResult) securityTaskResult = object(projection.securityTaskResult);
    if (Object.prototype.hasOwnProperty.call(projection, 'taskStatus')) {
      const restoredStatus = object(projection.taskStatus);
      if (!restoredStatus) {
        taskStatus = null;
        if (!hasSecurityStatus) securityTaskStatus = null;
      } else if (restoredStatus.context === 'security') {
        securityTaskStatus = restoredStatus;
        taskStatus = null;
      } else {
        taskStatus = normalTaskMatchesJourney(restoredStatus, state) ? restoredStatus : null;
        if (taskStatus && !hasSecurityStatus) securityTaskStatus = null;
      }
    }
    if (Object.prototype.hasOwnProperty.call(projection, 'taskResult')) {
      const restoredResult = object(projection.taskResult);
      if (restoredResult && restoredResult.context === 'security') securityTaskResult = restoredResult;
      else taskResult = normalTaskMatchesJourney(restoredResult, state) ? restoredResult : null;
    }
  }

  function settleTaskResult(message, settled) {
    const taskId = text(message && message.taskId);
    if (!taskId) return false;
    if (taskResult && taskResult.taskId === taskId) {
      taskStatus = null;
      taskResult = Object.assign({}, taskResult, { edits: [], settled: settled });
      return true;
    }
    if (securityTaskResult && securityTaskResult.taskId === taskId) {
      securityTaskStatus = null;
      securityTaskResult = Object.assign({}, securityTaskResult, { edits: [], settled: settled });
      return true;
    }
    return false;
  }

  window.addEventListener('message', function (event) {
    const message = event.data;
    if (!message || typeof message !== 'object' || message.__t !== SIDEBAR_TOKEN) return;
    if (message.type === 'lp-sidebar-state') {
      const incomingState = object(message.state);
      const projection = incomingState || message;
      const nextState = projectedState(message);
      if (projection.active === false) {
        nextState.selection = null;
        nextState.journey = null;
        nextState.taskStatus = null;
        nextState.taskResult = null;
        nextState.securityTaskStatus = null;
        nextState.securityTaskResult = null;
        nextState.securityResult = null;
      }
      const journeyChanged = syncComposerJourney(nextState);
      if (journeyChanged) {
        if (!Object.prototype.hasOwnProperty.call(projection, 'taskStatus')) nextState.taskStatus = null;
        if (!Object.prototype.hasOwnProperty.call(projection, 'taskResult')) nextState.taskResult = null;
        if (!Object.prototype.hasOwnProperty.call(projection, 'editDiff')) nextState.editDiff = null;
        if (!Object.prototype.hasOwnProperty.call(projection, 'deleteDiff')) nextState.deleteDiff = null;
      }
      state = nextState;
      restoreProjectedTasks(projection.active === false ? nextState : projection);
      if (Object.prototype.hasOwnProperty.call(projection, 'editDiff')) editDiff = object(projection.editDiff);
      if (Object.prototype.hasOwnProperty.call(projection, 'deleteDiff')) deleteDiff = object(projection.deleteDiff);
      if (projection.active === false) { taskResult = null; editDiff = null; deleteDiff = null; editResult = null; securityResult = null; publishResult = null; }
      if (Object.prototype.hasOwnProperty.call(projection, 'securityResult')) securityResult = object(projection.securityResult);
      renderAll();
      return;
    }
    if (message.type === 'lp-sidebar-reveal') {
      setTab(message.tab || 'edit');
      if (message.focusComposer) requestAnimationFrame(function () {
        const input = document.getElementById('instruction');
        if (input && !input.disabled) input.focus();
      });
      return;
    }
    if (message.type === 'lp-journey-update') {
      const nextState = Object.assign({}, state, { journey: message.journey || null });
      if (syncComposerJourney(nextState)) {
        nextState.taskStatus = null;
        nextState.taskResult = null;
        nextState.editDiff = null;
        nextState.deleteDiff = null;
      }
      state = nextState;
      renderAll();
      return;
    }
    if (message.type === 'lp-task-status') {
      if (message.context === 'security') { securityTaskStatus = message; taskStatus = null; }
      else {
        if (!normalTaskMatchesJourney(message, state)) return;
        taskStatus = message;
        securityTaskStatus = null;
      }
      renderProgress(); renderHeader(); return;
    }
    if (message.type === 'lp-task-result') {
      if (message.context === 'security') {
        securityTaskStatus = null;
        securityTaskResult = message;
        taskStatus = null;
      } else {
        if (!normalTaskMatchesJourney(message, state)) return;
        taskStatus = null;
        securityTaskStatus = null;
        taskResult = message;
      }
      renderProgress(); renderEditResult(); renderSecurity(); renderHeader(); return;
    }
    if (message.type === 'lp-task-keep-result') {
      if (message.ok && settleTaskResult(message, 'kept')) {
        editResult = taskResult && taskResult.taskId === message.taskId ? message : editResult;
        renderProgress(); renderEditResult(); renderSecurity(); renderHeader();
      }
      return;
    }
    if (message.type === 'lp-task-revert-result') {
      if (message.done && settleTaskResult(message, 'reverted')) {
        editResult = taskResult && taskResult.taskId === message.taskId ? message : editResult;
        renderProgress(); renderEditResult(); renderSecurity(); renderHeader();
      }
      return;
    }
    if (message.type === 'lp-edit-diff') { taskStatus = null; editDiff = message; editResult = null; renderProgress(); renderEditResult(); renderHeader(); return; }
    if (message.type === 'lp-delete-diff') { taskStatus = null; deleteDiff = message; editResult = null; renderProgress(); renderEditResult(); renderHeader(); return; }
    if (message.type === 'lp-edit-result') { editResult = message; if (message.ok) { editDiff = null; deleteDiff = null; } renderEditResult(); return; }
    if (message.type === 'lp-security-status') { state = Object.assign({}, state, { security: message.security || null }); renderSecurity(); renderPublish(); return; }
    if (message.type === 'lp-security-result') { securityResult = message; state = Object.assign({}, state, { securityResult: message, security: Object.assign({}, object(state.security) || {}, { state: message.error ? 'error' : ((message.coverage && message.coverage.complete === false) ? 'incomplete' : 'complete'), counts: message.counts || null, coverageComplete: !(message.coverage && message.coverage.complete === false) }) }); renderSecurity(); renderPublish(); return; }
    if (message.type === 'lp-publish-status-result') { state = Object.assign({}, state, { publish: message }); renderPublish(); return; }
    if (message.type === 'lp-publish-result') { publishResult = message; renderPublish(); if (message.ok) post('lp-publish-status'); return; }
  });

  document.addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.dataset.surface === 'cockpit') { post('lp-sidebar-open-cockpit'); return; }
    if (button.dataset.surface === 'live') return;
    if (button.dataset.tab) { setTab(button.dataset.tab); return; }
    if (button.dataset.intent) { selectIntent(button.dataset.intent); return; }
    if (button.dataset.mode) { selectMode(button.dataset.mode); return; }
    if (button.dataset.skillSeed != null) {
      const composer = document.getElementById('instruction');
      composer.value = button.dataset.skillSeed;
      selectIntent('edit');
      selectMode(button.dataset.skillMode || 'auto');
      persistComposerDraft();
      composer.focus();
      return;
    }
    if (button.dataset.cls && button.dataset.group) {
      const cls = button.dataset.cls;
      const group = button.dataset.group;
      if (/^[a-z0-9-]+$/.test(cls) && ['text-color', 'bg-color', 'text-size', 'pad'].includes(group)) post('lp-sidebar-preset', { cls: cls, group: group });
      return;
    }
    if (button.dataset.previewKind) {
      const kind = button.dataset.previewKind;
      if (kind !== 'text' && kind !== 'class') return;
      const input = document.getElementById(kind === 'text' ? 'quick-text' : 'quick-class');
      post('lp-sidebar-preview-edit', { kind: kind, value: input.value });
      return;
    }
    if (button.id === 'open-source') { post('lp-open-source'); return; }
    if (button.id === 'delete-preview') { post('lp-sidebar-delete-preview'); return; }
    if (button.dataset.meoLens) {
      meoLens = button.dataset.meoLens;
      document.querySelectorAll('[data-meo-lens]').forEach(function (item) { item.classList.toggle('active', item.dataset.meoLens === meoLens); });
      renderMeo();
      return;
    }
    if (button.dataset.taskKeep != null) { post('lp-task-keep', { taskId: button.dataset.taskKeep || null }); return; }
    if (button.dataset.taskRevert != null) { post('lp-task-revert', { taskId: button.dataset.taskRevert || null, all: true }); return; }
    if (button.dataset.askApply != null) { post('lp-ask-apply', { askId: button.dataset.askApply }); return; }
    if (button.dataset.sidebarEditApply != null) { post('lp-sidebar-edit-apply'); return; }
    if (button.dataset.sidebarDeleteApply != null) { post('lp-sidebar-delete-apply'); return; }
    if (button.hasAttribute('data-edit-dismiss')) { editDiff = null; post('lp-sidebar-proposal-dismiss'); renderEditResult(); return; }
    if (button.hasAttribute('data-delete-dismiss')) { deleteDiff = null; post('lp-sidebar-proposal-dismiss'); renderEditResult(); return; }
    if (button.dataset.securityOpen) { post('lp-security-open', { findingId: button.dataset.securityOpen }); return; }
    if (button.dataset.securityFix) { post('lp-security-fix', { findingId: button.dataset.securityFix }); return; }
    if (button.dataset.openUrl) { post('lp-open-external', { url: button.dataset.openUrl }); }
  });

  document.querySelector('[role="tablist"]').addEventListener('keydown', function (event) {
    const tab = event.target.closest('[role="tab"][data-tab]');
    if (!tab) return;
    const tabs = Array.from(document.querySelectorAll('[role="tab"][data-tab]'));
    const index = tabs.indexOf(tab);
    if (index < 0) return;
    let nextIndex = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    if (nextIndex == null) return;
    event.preventDefault();
    setTab(tabs[nextIndex].dataset.tab, true);
  });

  document.getElementById('submit').addEventListener('click', function () {
    const input = document.getElementById('instruction');
    const instruction = input.value.trim();
    if (!instruction) { input.focus(); return; }
    post('lp-sidebar-submit', { intent: intent, instruction: instruction, mode: mode });
  });
  document.getElementById('instruction').addEventListener('keydown', function (event) {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); document.getElementById('submit').click(); }
  });
  document.getElementById('instruction').addEventListener('input', persistComposerDraft);
  document.getElementById('cancel-task').addEventListener('click', function () { post('lp-task-cancel'); });
  document.getElementById('cancel-security-task').addEventListener('click', function () { post('lp-task-cancel'); });
  document.getElementById('security-scan').addEventListener('click', function () { post('lp-security-scan'); });
  document.getElementById('publish-refresh').addEventListener('click', function () { post('lp-publish-status'); });
  document.getElementById('publish-state').addEventListener('click', function (event) {
    const button = event.target.closest('button');
    if (!button || button.disabled) return;
    if (button.id === 'publish-commit') {
      post('lp-publish-commit', { message: document.getElementById('commit-message').value.trim() });
    } else if (button.id === 'publish-deploy') {
      const publish = object(state.publish) || {};
      const identity = object(publish.vercelIdentity) || {};
      post('lp-publish-deploy', { projectName: document.getElementById('deploy-confirm').value.trim(), vercelIdentityKey: text(identity.key) });
    }
  });
  document.getElementById('publish-state').addEventListener('input', function (event) {
    if (event.target && event.target.id === 'deploy-confirm') syncDeployConfirmation();
  });

  renderQuickAdjustments();
  setTab(activeTab);
  selectMode(mode);
  renderAll();
  post('lp-sidebar-open');
  </script>
</body>
</html>`;
}

module.exports = { getLivePreviewSidebarHtml };
