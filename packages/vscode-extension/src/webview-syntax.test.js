// webview-syntax.test.js — renders getHtml() AND getLivePreviewHtml() FOR REAL
// (vm-evaluated template, exactly what the browser receives) and parses the inline
// script. v2 after the \\' incident: manual unescaping masked template-literal escape
// consumption. v3 (MP2): also guards the Live Preview App Stage webview (iframe + CSP).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadExtension() {
  // Load the WHOLE extension module with a permissive vscode stub + the REAL render
  // modules (so getHtml()/getLivePreviewHtml() resolve COWORK/MR/RR/LPV/LPS and render the
  // real webview) — then each inline script is parse-checked exactly as delivered.
  const code = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  const mk = () => new Proxy(function () { return mk(); }, { get(t, k) { if (k === Symbol.toPrimitive || k === 'toString') return () => ''; if (k === 'Uri') return { file: () => '', parse: () => '', joinPath: () => '' }; return mk(); }, apply() { return mk(); } });
  const vscodeStub = mk();
  const realReq = require;
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js'];
  const req = (name) => { if (name === 'vscode') return vscodeStub; if (REAL.indexOf(name) !== -1) return realReq(name); if (name.charAt(0) === '.') return mk(); return realReq(name); };
  const sandbox = { require: req, module: { exports: {} }, exports: {}, console: { log() {}, error() {}, warn() {}, info() {} }, process, __dirname, __filename: path.join(__dirname, 'extension.js'), Buffer, setTimeout: () => 0, clearTimeout() {}, setInterval: () => 0, clearInterval() {}, URL, TextEncoder, TextDecoder, Math, Date, JSON, Promise };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(code, sandbox, { filename: 'extension.js' }); } catch (e) { /* tolerate top-level activate() errors; the getters are hoisted */ }
  return sandbox;
}

function parseInlineScript(html) {
  const m = html.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  assert.ok(m, 'script block found');
  assert.doesNotThrow(() => new vm.Script('function acquireVsCodeApi(){return{postMessage(){}}};' + m[1]), 'webview JS must parse AS DELIVERED');
}

test('webview script parses (real template evaluation)', () => {
  const sandbox = loadExtension();
  if (typeof sandbox.getHtml !== 'function') throw new Error('getHtml not defined after module eval');
  parseInlineScript(sandbox.getHtml());
});

test('Live Preview (MP2 App Stage) webview script parses as delivered', () => {
  const sandbox = loadExtension();
  assert.strictEqual(typeof sandbox.getLivePreviewHtml, 'function', 'getLivePreviewHtml defined after module eval');
  parseInlineScript(sandbox.getLivePreviewHtml());
});

test('Live Preview CSP allows framing localhost + hosts the App Stage iframe (loop hole #2a)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // Mitigation (a): the webview CSP must let the iframe embed the local dev server.
  assert.ok(/frame-src\s+http:\/\/localhost:\*/.test(html), 'CSP frame-src must allow http://localhost:*');
  // CSP host set must stay === normalizeStageUrl's accepted set (http+https × localhost+127.0.0.1)
  // so a validated URL never lands as a "green server up" over a CSP-blocked blank frame.
  for (const src of ['http://localhost:*', 'http://127.0.0.1:*', 'https://localhost:*', 'https://127.0.0.1:*']) {
    assert.ok(html.includes(src), 'CSP frame-src must include ' + src);
  }
  // The persistent App Stage iframe + its manual-URL override control must be present.
  assert.ok(html.includes('id="lp-frame"'), 'App Stage iframe present');
  assert.ok(html.includes('id="lp-url"'), 'manual URL override input present (port-detector cascade rung d)');
  // default-src stays locked down (no wildcard everything).
  assert.ok(html.includes("default-src 'none'"), "default-src stays 'none'");
});

test('Live Preview webview message listener is origin-locked by a host token (loop hole #3)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('secret-xyz');
  // The token must be embedded and the listener must gate on it BEFORE acting on any message,
  // so the embedded (cross-origin) dev-server iframe cannot forge a message the panel trusts.
  assert.ok(html.includes('HOST_TOKEN="secret-xyz"'), 'host token embedded into the webview');
  assert.ok(/m\.__t\s*!==\s*HOST_TOKEN/.test(html), 'listener rejects messages lacking the host token');
});

test('Live Preview MP4 diagnostics strip is hosted + parses as delivered (concat-only)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The strip container lives BETWEEN the toolbar and the iframe and is hidden until it has an error.
  assert.ok(html.includes('id="lp-diag"'), 'diagnostics strip container present');
  // The honest strip renderer is serialised in via fn.toString() exactly like renderStageStatus.
  assert.ok(/const renderErrorStrip=function/.test(html), 'renderErrorStrip serialised into the webview');
  // The whole inline script (incl. the serialised renderErrorStrip) still parses as delivered.
  parseInlineScript(html);
});

test('Live Preview MP5.2a breadcrumb — chips rendered, re-select is origin-targeted, honest shared-component warning', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The selection panel carries the root→leaf breadcrumb and each chip re-selects via the tap.
  assert.ok(html.includes('lp-crumbs'), 'breadcrumb container rendered by renderSelection');
  assert.ok(html.includes("type:'lp-reselect'"), 're-select message wired to the tap');
  // Cross-origin discipline: the re-select goes to the frame origin-targeted, never '*'.
  assert.ok(/postMessage\(\{ type:'lp-reselect'[^)]*\}, curOrigin\)/.test(html), 'lp-reselect is origin-targeted');
  // The lp-select ingest keeps the tap's path (bounded) so the panel can render the chips.
  assert.ok(/path:Array\.isArray\(m\.path\)\?m\.path\.slice\(0,12\):\[\]/.test(html), 'lp-select path ingested + bounded');
  // Honest shared-component warning (§1D component scope): the copy must say the edit hits all usages.
  assert.ok(html.includes('afeta todos os usos'), 'honest component-scope warning present');
  parseInlineScript(html);
});

test('Live Preview MP5.2a delete — 🗑 button, diff-before-write flow, honest $0 copy', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The panel offers the deterministic delete and the flow is preview (mini-diff) → apply (write).
  assert.ok(html.includes('id="lp-sel-del"'), 'delete button present in the selection panel');
  assert.ok(html.includes("type:'lp-delete', preview:true"), 'preview request wired (diff first)');
  assert.ok(html.includes("type:'lp-delete', preview:false"), 'apply request wired (write only on OK)');
  assert.ok(html.includes("m.type === 'lp-delete-diff'"), 'host-trusted diff result handled');
  // review P1-B: apply binds the target to THIS diff (m), not a mutable global — and echoes the
  // preview's source hash so the host refuses on any skew (no diff/apply drift).
  assert.ok(/type:'lp-delete', preview:false, file:m\.file, line:m\.line, col:m\.col, tag:m\.tag/.test(html),
    'delete apply target bound to the diff (m), not a global');
  assert.ok(html.includes('h:m.h'), 'staleness hash echoed on apply');
  assert.ok(!html.includes('lpDeleteTarget'), 'the mutable delete-target global is gone');
  // A >40-line diff must say it was truncated (honest preview, never a silent cut).
  assert.ok(html.includes('linhas removidas (o apagar leva TODAS)'), 'truncation is announced');
  // A stale apply must come back as a REGENERATED preview with an honest banner (nothing written).
  assert.ok(html.includes('o ficheiro mudou desde a pré-visualização'), 'stale re-preview banner present');
  // A multi-instance stamp (.map / reused component) warns that the edit hits the template.
  assert.ok(html.includes('elemento repetido no ecrã'), 'multi-instance warning present');
  // Honest copy: delete is deterministic — $0, no tokens. Never a fabricated cost, never an LLM.
  assert.ok(html.includes('apagar é determinístico'), 'honest deterministic copy');
  assert.ok(html.includes('$0, sem tokens'), 'honest $0 copy');
  parseInlineScript(html);
});

test('Live Preview LP-4 §0 edit — preview-first flow, hash echoed on apply, absolute path in the diff header', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The text/class edit is now preview (mini-diff) → apply (write) — symmetric with the delete.
  assert.ok(html.includes("type:'lp-edit', preview:true"), 'edit preview request wired (diff first)');
  assert.ok(html.includes("type:'lp-edit', preview:false"), 'edit apply request wired (write only on OK)');
  assert.ok(html.includes("m.type === 'lp-edit-diff'"), 'host-trusted edit diff result handled');
  // review P1-B: apply binds target + edit to THIS diff (m), not a mutable global; echoes the hash.
  assert.ok(/type:'lp-edit', preview:false, file:m\.file, line:m\.line, col:m\.col, tag:m\.tag, edit:m\.edit, h:m\.h/.test(html),
    'edit apply target + edit bound to the diff (m), not a global');
  assert.ok(!html.includes('lpEditTarget'), 'the mutable edit-target global is gone');
  // A7 mitigation: the diff header shows the ABSOLUTE path of the file that will be written.
  assert.ok(html.includes('✍ '), 'absolute-path marker present in the diff header');
  // §5 — the host-vetted re-pin is forwarded into the frame origin-targeted, never '*'.
  assert.ok(/postMessage\(\{ type:'lp-repin'[^)]*\}, curOrigin\)/.test(html), 'lp-repin is origin-targeted');
  assert.ok(html.includes("m.type === 'lp-repin'"), 'host-trusted re-pin handled');
  parseInlineScript(html);
});

test('Live Preview LP-4 §6 panel — one box, honest chip, fenced prompt flow, undo, honest states', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // LP-4.5 — the ONE BOX on the pin: any prompt, default AUTO = the anchored-task agent; the
  // local $0 chip keeps the LP-4 fenced rewrite reachable; the heuristic only SUGGESTS.
  assert.ok(html.includes('id="lp-box-in"'), 'one-box input present');
  assert.ok(html.includes('valida estes números'), 'placeholder shows a PROJECT ask (the LP-4.5 case), not only node tweaks');
  assert.ok(html.includes("type:'lp-task'"), 'anchored task request wired to the host');
  assert.ok(html.includes("m.type === 'lp-task-result'"), 'agent verdict handled');
  assert.ok(html.includes("m.type === 'lp-task-status'"), 'live agent progress handled (a ler / a editar)');
  assert.ok(html.includes('agente · subscrição'), 'honest AUTO chip: agent runs on the subscription');
  assert.ok(html.includes('local $0 · só este nó'), 'the fenced $0 path is an explicit chip, never a guess');
  assert.ok(html.includes('suggestLocalChip'), 'heuristic present — and it only suggests');
  assert.ok(html.includes("type:'lp-prompt'"), 'fenced prompt request still wired (via the local chip)');
  assert.ok(html.includes("type:'lp-prompt-apply'"), 'approved replacement wired (write only on OK)');
  assert.ok(html.includes("m.type === 'lp-prompt-diff'"), 'fenced rewrite preview handled');
  // review P1-B: the apply reads the TARGET from the diff (m), not a mutable global that a second
  // concurrent preview could have moved — bind file/line/col/tag from m in the apply message.
  assert.ok(/type:'lp-prompt-apply', file:m\.file, line:m\.line, col:m\.col, tag:m\.tag/.test(html),
    'prompt apply binds the write target to THIS diff (m), not lpPromptTarget');
  // review P1-A: the cloud disabled-reason is honest about WHICH gate failed (trust vs missing SDK).
  assert.ok(html.includes('workspace não confiável'), 'untrusted-workspace disabled reason present');
  // Router-native advisory chip: local $0 default · cloud opt-in on subscription · @fable manual.
  assert.ok(html.includes('nada sai da máquina'), 'local privacy copy present');
  assert.ok(html.includes('@fable é SEMPRE manual'), 'fable manual-only doctrine in the chip');
  assert.ok(html.includes('ponte SDK ausente'), 'bridge-missing disables cloud with the honest reason');
  // §4 → LP-4.5 §4: the single "desfazer último" gave way to the unified session feed — every
  // write (deterministic/fenced/agent) is one row with time + via + file(s) + per-item revert.
  assert.ok(!html.includes('id="lp-sel-undo"'), 'single undo button replaced by the feed');
  assert.ok(html.includes('id="lp-feed"'), 'unified feed container present');
  assert.ok(html.includes("type:'lp-feed-revert'"), 'per-item feed revert wired');
  assert.ok(html.includes('renderEditsFeed'), 'feed renderer serialised into the webview');
  assert.ok(html.includes('↩ desfeito'), 'undone state copy');
  // LP-4.7 — quality engine narration is optional; check for the base string part.
  assert.ok(html.includes('a pensar…') && html.includes('moo local · $0'), 'honest thinking state (local $0)');
  assert.ok(html.includes('moo local offline'), 'honest offline state');
  assert.ok(html.includes('recusado pela cerca'), 'fence refusals surface as visible reasons');
  // LP-4.5 §5 — dynamic-component honesty: the warning BEFORE a fenced rewrite on a component,
  // the same warning on the diff, the agent escape hatch, and the never-plain-✓ apply copy.
  assert.ok(html.includes('é um componente — o conteúdo vem de DENTRO dele'), 'component warning at selection time');
  assert.ok(html.includes('o conteúdo vem de dentro do componente — reescrever este nó não o muda'), 'dynamic warning on the diff');
  assert.ok(html.includes('id="lp-pr-agent"') && html.includes('id="lp-sel-agent"'), 'resolver-com-o-agente buttons wired');
  assert.ok(html.includes('se o preview não mudou, resolve com o agente'), 'dynamic apply never reads as a plain ✓ escrito');
  parseInlineScript(html);
});

test('Live Preview LP-4.5 §6 device toggle — 390/768/full buttons drive ONLY the iframe width', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('id="lp-dev-390"') && html.includes('id="lp-dev-768"') && html.includes('id="lp-dev-full"'), 'three device buttons in the toolbar');
  assert.ok(html.includes('setDevice(390)') && html.includes('setDevice(768)') && html.includes('setDevice(null)'), 'width presets wired');
  assert.ok(/f\.style\.width=px\+'px'/.test(html), 'the toggle only sets the iframe width (no UA spoofing claimed)');
  assert.ok(html.includes('só muda a largura do iframe'), 'honest copy: width only');
  parseInlineScript(html);
});

test('Live Preview LP-4.8 §1 in-canvas toolbar — floats over the frame anchored to the pin, click-through fence, follows on reflow', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The toolbar is a TRUSTED-webview overlay INSIDE the frame wrap (never injected into the
  // cross-origin site — adversarial L1). The overlay spans the frame but is click-through so the
  // iframe still receives hover/select; only the toolbar itself is interactive.
  assert.ok(html.includes('id="lp-ctb-ov"'), 'toolbar overlay host present');
  assert.ok(html.includes('id="lp-ctb"'), 'floating toolbar present');
  assert.ok(html.includes('id="lp-ctb-body"'), 'toolbar body mount present');
  assert.ok(html.includes('role="toolbar"'), 'toolbar has an ARIA toolbar role');
  assert.ok(/\.lp-ctb-ov\{[^}]*pointer-events:none/.test(html), 'the overlay is click-through (pointer-events:none)');
  assert.ok(/\.lp-ctb\{[^}]*pointer-events:auto/.test(html), 'only the toolbar itself catches pointer events');
  // The interactive controls now live in the toolbar body, not the side rail; the ids/wiring
  // literals the older tests assert must still be emitted (they are, in inputsHTML).
  assert.ok(html.includes('id="lp-ctb-body">') === false || html.includes('ctbBody.innerHTML=inputsHTML'), 'inputs render into the toolbar body');
  assert.ok(html.includes('function positionCanvasToolbar'), 'positioning maps the pin rect into frame-wrap coords');
  assert.ok(html.includes('function hideCanvasToolbar'), 'a null selection hides the toolbar');
  // The toolbar FOLLOWS the pin: the tap re-emits lp-pin-rect on scroll/resize and the webview
  // repositions from it — on the SAME origin-locked untrusted-iframe branch as lp-select.
  assert.ok(html.includes("m.type === 'lp-pin-rect'"), 'lp-pin-rect handled (toolbar follows the pin on reflow)');
  assert.ok(/positionCanvasToolbar\(m\.rect\)/.test(html), 'reflow rect repositions the toolbar');
  // A webview-side resize (panel drag) also re-anchors from the last known rect.
  assert.ok(/window\.addEventListener\('resize',\s*function\(\)\{ positionCanvasToolbar\(\); \}\)/.test(html), 'webview resize re-anchors the toolbar');
  // The controls that MOVED still ship their ids + wiring (regression guard for the split).
  assert.ok(html.includes('id="lp-chip"') && html.includes('id="lp-box-in"') && html.includes('id="lp-sel-del"'), 'chip/one-box/delete still present after the split');
  parseInlineScript(html);
});

test('Live Preview LP-4.8 §2 presets — deterministic colour/size/spacing ride the class-edit fence ($0, no LLM)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The preset bar mounts in the toolbar and the pure engine is serialised in (self-contained).
  assert.ok(html.includes('id="lp-presets"'), 'preset bar mount present');
  assert.ok(html.includes('function mergeClass') || /const mergeClass=/.test(html), 'mergeClass serialised into the webview');
  assert.ok(/const renderPresetsBarHTML=/.test(html), 'preset catalog serialised into the webview');
  // A preset click merges into the CURRENT className and feeds the EXISTING class-edit preview —
  // never a model call. The proof: the handler routes through sendEdit('class', next), not lp-task.
  assert.ok(/mergeClass\(cur, cls, grp\)/.test(html), 'preset merges the class deterministically');
  assert.ok(/sendEdit\('class', next\)/.test(html), 'preset applies via the class-edit fence (preview-first)');
  // Honest $0: the preset group is labelled as deterministic, no tokens.
  assert.ok(html.includes('sem tokens'), 'presets are labelled $0/no-tokens');
  parseInlineScript(html);
});

test('Live Preview LP-4.8 §3 /skills — element-scoped skills seed the one-box + pin the tier (no new write surface)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The dropdown button + menu + the serialised registry/renderer are present.
  assert.ok(html.includes('id="lp-sk-btn"'), '/skills button present');
  assert.ok(html.includes('id="lp-sk-menu"'), 'skills menu container present');
  assert.ok(/const LP_SKILLS=\[/.test(html), 'skills registry embedded as JSON');
  assert.ok(html.includes('function renderSkillsMenuHTML'), 'menu renderer serialised in');
  assert.ok(html.includes('role="menu"'), 'menu has an ARIA menu role');
  // The 5 v1 skills are in the embedded registry with honest per-skill tiers.
  assert.ok(html.includes('"id":"icon"') && html.includes('"id":"section"'), 'v1 skills embedded');
  assert.ok(html.includes('"tierFloor":"auto"'), '/section floors to the agent');
  // A skill SEEDS the one-box and pins the chip — it does NOT open a new write path. The proof:
  // the item handler sets lp-box-in + lpMode, then execution reuses the existing sendBox path.
  assert.ok(/bi\.value=tpl/.test(html), 'skill seeds the one-box with its template');
  assert.ok(/lpMode=skillTierMode\(tier\)/.test(html), 'skill pins the chip to its tier floor (routing surfaced)');
  assert.ok(html.includes('skill activa: /'), 'active-skill indicator shows the routing');
  // No bespoke skill message type — /skills must not bypass the fence with its own write channel.
  assert.ok(!/type:'lp-skill-apply'|type:'lp-skill-write'/.test(html), 'no skill-specific write message (rides the existing fence)');
  parseInlineScript(html);
});

test('Live Preview MP4 tap messages are origin-locked (event.origin + source), not token-forgeable', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The untrusted iframe (the dev-only error tap) is accepted ONLY when the message truly comes
  // from OUR iframe window AND its origin is EXACTLY the framed localhost origin — never '*',
  // never a stale port. This is the MP4 origin lock (host cannot read a cross-origin iframe's DOM).
  assert.ok(/ev\.source\s*===\s*_frame\.contentWindow/.test(html), 'tap branch requires ev.source === the iframe window');
  assert.ok(/ev\.origin\s*!==\s*curOrigin/.test(html), 'tap branch rejects any origin != the framed origin');
  // The tap branch must feed only the local strip / restore — never the host-trusted lp-snapshot path.
  assert.ok(html.includes("m.type === 'lp-error'"), 'tap runtime/build errors ingested');
  assert.ok(html.includes("m.type === 'lp-restore'") || html.includes("type:'lp-restore'"), 'state-preserving restore wired');
});
