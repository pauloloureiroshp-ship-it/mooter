// webview-syntax.test.js — renders getHtml() AND getLivePreviewHtml() FOR REAL
// (vm-evaluated template, exactly what the browser receives) and parses the inline
// script. v2 after the \\' incident: manual unescaping masked template-literal escape
// consumption. v3 (MP2): also guards the Live Preview App Stage webview (iframe + CSP).
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
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
  const REAL = ['./cowork-waiting', './mode-registry', './row-renderer', './arch-tree', './mission-control-view', './project-command-view', './guardian-chip', './live-preview-view.js', './lp-stage.js', './lp-diagnostics.js', './lp-task-view.js', './lp-presets.js', './lp-skills.js', './lp-security-view.js', './lp-publish-view.js'];
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
  // F2 (P1-7) — the hot-reload-down banner ships HIDDEN and honest (role=status/aria-live), lit only by the tap.
  assert.ok(/id="lp-hmr"[^>]*role="status"[^>]*aria-live/.test(html), 'lp-hmr banner is an aria-live status region');
  assert.ok(/id="lp-hmr"[^>]*style="display:none"/.test(html), 'lp-hmr ships hidden — no stale lie when hot-reload is healthy');
  // D1 — the controls WRAP instead of overflowing (flex-wrap on #lp-controls), and the honest effective-width note exists.
  assert.ok(/#lp-controls\{[^}]*flex-wrap:wrap/.test(html), '#lp-controls wraps (no single-row overflow at narrow widths)');
  assert.ok(html.includes('id="lp-dev-note"'), 'the device-preset effective-width note is present');
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
  assert.ok(html.includes('os números batem com o projecto'), 'placeholder shows a PROJECT ask (LP-4.9 §1: an ask example), not only node tweaks');
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
  assert.ok(/mergeClass\(cur, btn\.getAttribute\('data-cls'\), btn\.getAttribute\('data-group'\)\)/.test(html), 'preset merges the class deterministically');
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

test('Live Preview LP-4.8 §3 /skills — a hostile workspace-override skill cannot break out of the inline <script>', () => {
  // loadSkills reads <wsRoot>/.mooter/skills/*.md and is NOT trust-gated, so a cloned repo controls
  // label/hint/template. The registry is embedded via JSON.stringify into the nonce'd inline script;
  // a template of `</script>…` would terminate the tag without the `<`→< escape. CSP blocks
  // execution, so the real risk is panel-JS breakage + inert HTML injection — this pins the fence.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-skill-xss-'));
  try {
    const dir = path.join(root, '.mooter', 'skills');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'evil.md'),
      '---\nid: evil\nlabel: "/evil"\ntier_floor: local\nkind: text\n' +
      'template: "</script><b>PWN</b> injected"\n---\nhuman docs we never execute\n', 'utf8');
    const sandbox = loadExtension();
    const html = sandbox.getLivePreviewHtml('tok', root);
    // The override was actually exercised (not silently dropped) — the id reaches the embed…
    assert.ok(html.includes('"id":"evil"'), 'workspace-override skill loaded into the embed');
    // …but its `<` is neutralised: the raw breakout sequence is absent, the escaped form present.
    assert.ok(!html.includes('</script><b>PWN'), 'hostile template must NOT reach the DOM unescaped');
    assert.ok(html.includes('\\u003c/script>\\u003cb>PWN'), 'the `<` is escaped to \\u003c in the embed');
    // And the whole delivered webview still parses — the script block was not truncated early.
    parseInlineScript(html);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Live Preview LP-4.8 §4 multi-select — Cmd/Ctrl-click attaches refs as agent context (never a write target)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The ref chips container + attach ingest are present; refs ride the agent (lp-task) path.
  assert.ok(html.includes('id="lp-refs"'), 'attached-references container present');
  assert.ok(html.includes("m.type === 'lp-attach'"), 'lp-attach ingested (Cmd/Ctrl-click reference)');
  assert.ok(/lpRefs\.push\(/.test(html), 'a reference is recorded');
  assert.ok(/refs:refs/.test(html), 'refs travel with the anchored lp-task');
  // Dedup + a hard cap so a prompt can never balloon with references.
  assert.ok(/lpRefs\.length<8/.test(html), 'reference count is capped');
  // Removal is honest end-to-end: the ✕/limpar tell the tap to drop its overlay box too.
  assert.ok(html.includes("type:'lp-detach'") && html.includes("type:'lp-detach-all'"), 'detach messages wired to the tap');
  assert.ok(/postMessage\(\{ type:'lp-detach'[^)]*\}, curOrigin\)/.test(html), 'lp-detach is origin-targeted');
  // Honest routing note: on the local $0 chip the refs do not apply (single-node fenced edit).
  assert.ok(html.includes('as referências entram quando subes para o agente'), 'honest note: refs feed the agent, not the $0 fence');
  // A reference is NEVER a write target — it only rides lp-task as context; there is no ref-write msg.
  assert.ok(!/type:'lp-ref-edit'|type:'lp-ref-apply'/.test(html), 'no reference write path');
  parseInlineScript(html);
});

test('Live Preview LP-4.8 §5 keyboard/a11y — Esc dismisses the toolbar (no VS Code steal), ARIA + focus-visible', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The toolbar is an ARIA toolbar; its controls are labelled for screen readers.
  assert.ok(/id="lp-ctb"[^>]*role="toolbar"/.test(html), 'toolbar has role=toolbar');
  assert.ok(html.includes('aria-label="texto do elemento selecionado"'), 'text input labelled');
  assert.ok(html.includes('aria-label="classe Tailwind do elemento selecionado"'), 'class input labelled');
  assert.ok(html.includes('aria-label="prompt ancorado neste elemento"'), 'one-box labelled');
  // Esc DISMISSES the toolbar only when focus is inside it (never steals VS Code's global Esc),
  // defers to the /skills menu when open, and returns focus to the 🎯 toggle (never stranded).
  assert.ok(/ctb\.addEventListener\('keydown'/.test(html), 'toolbar Esc handler wired on the toolbar (scoped, not global)');
  assert.ok(html.includes("if(e.key!=='Escape') return;"), 'the handler only acts on Escape');
  assert.ok(/hideCanvasToolbar\(\)/.test(html), 'Esc hides the toolbar');
  assert.ok(html.includes("getElementById('lp-select-btn'); if(sb) sb.focus()"), 'focus returns to the 🎯 toggle');
  // The /skills menu closes on its own Escape before the toolbar-hide can fire.
  assert.ok(/menu\.addEventListener\('keydown'[\s\S]{0,120}Escape[\s\S]{0,80}closeSkillsMenu/.test(html), 'skills menu closes on Escape');
  // Focus-visible outlines on the toolbar controls (keyboard users always see focus).
  assert.ok(/\.lp-ctb .lp-ed-in:focus-visible/.test(html), 'toolbar controls have focus-visible outlines');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §1 intent — explicit Edit/Ask toggle removes the "asked vs edited" ambiguity', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The toggle is a visible radiogroup with an honest label; the send button mirrors the intent.
  assert.ok(html.includes('id="lp-mode-edit"') && html.includes('id="lp-mode-ask"'), 'Edit/Ask toggle present');
  assert.ok(/role="radiogroup"/.test(html), 'toggle is a radiogroup for a11y');
  assert.ok(html.includes('Editar muda o site · Perguntar só responde'), 'honest label under the toggle');
  assert.ok(/sb\.textContent=\(lpIntent==='ask'\)\?'💬 Perguntar':'✏️ Editar'/.test(html), 'send button mirrors the chosen intent');
  // Ask ALWAYS routes to the agent (local $0 moo cannot answer) and carries intent:'ask'; honest
  // refusal when the bridge is off — never a dead "answer" button.
  assert.ok(html.includes("intent:'ask'"), 'ask carries intent to the host');
  assert.ok(html.includes("intent:'edit'"), 'edit carries intent to the host');
  assert.ok(/askMode=\(lpMode==='local'\)\?'auto':lpMode/.test(html), 'ask upgrades local→agent (only the agent can answer)');
  assert.ok(/if\(!br\.available\)\{ showEditResult\(false/.test(html), 'ask refuses honestly when the SDK bridge is off');
  // Design-critique #3 (a11y): the radiogroup is a single tab stop (roving tabindex) with arrow-key
  // selection — not two independent tab stops.
  assert.ok(/eb\.tabIndex=on\?0:-1/.test(html) && /ab\.tabIndex=on\?0:-1/.test(html), 'roving tabindex on the radiogroup');
  assert.ok(html.includes("e.key==='ArrowLeft'") && /setIntent\(lpIntent==='ask'\?'edit':'ask', true\)/.test(html), 'arrow keys move within the radiogroup');
  // Design-critique #5 (honesty): in ask mode with the local $0 chip picked, the hint says the run
  // uses the agent (subscrição) — no silent "$0" while it costs.
  assert.ok(html.includes('Perguntar corre no agente (subscrição), não local'), 'ask reconciles the misleading $0 chip');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §2 / F0.1 progressive disclosure — prompt-first minimal view, presets behind "▾ ajustes rápidos" (remembered)', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The advanced drawer exists, is collapsed by default, and the chevron controls it via ARIA.
  assert.ok(html.includes('id="lp-adv"'), 'advanced drawer present');
  assert.ok(/id="lp-adv" class="lp-adv" style="display:none"/.test(html), 'advanced is collapsed by default');
  assert.ok(html.includes('id="lp-more"') && /aria-controls="lp-adv"/.test(html), 'chevron controls the drawer');
  // F0.1 — the QUICK-ADJUST presets + raw text/class edits + skills moved INTO the drawer (one click away).
  const advStart = html.indexOf('id="lp-adv"');
  const advChunk = html.slice(advStart, advStart + 1200);
  assert.ok(advChunk.includes('id="lp-presets"') && advChunk.includes('id="lp-ed-text"') && advChunk.includes('id="lp-sk-btn"'), 'quick-adjust presets/raw-edits/skills live in the drawer');
  // F0.1 — the model/tier picker moved UP into the minimal (prompt-first) view, like the one-box.
  assert.ok(html.indexOf('id="lp-chip"') < advStart, 'the tier picker stays in the minimal view');
  // The minimal view keeps the intent toggle + one-box (they must NOT be inside the drawer).
  assert.ok(html.indexOf('id="lp-box-in"') < advStart, 'the one-box stays in the minimal view');
  assert.ok(html.indexOf('id="lp-mode-edit"') < advStart, 'the intent toggle stays in the minimal view');
  // The expanded/collapsed choice is remembered per session (localStorage), restored on render.
  assert.ok(html.includes("localStorage.setItem('lp-adv-open'") && html.includes("localStorage.getItem('lp-adv-open')"), 'the drawer state persists per session');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §5 presets as the star — top of the simple view, ≥24px, hover-preview', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // F0.1 — the preset bar moved into the ▾ ajustes rápidos drawer (prompt-first); it stays the star of that row.
  const advStart = html.indexOf('id="lp-adv"');
  assert.ok(html.indexOf('id="lp-presets"') > advStart, 'F0.1 — presets live one click away in the drawer, not on top');
  assert.ok(html.includes('lp-pz-star'), 'presets flagged as the star row');
  // WCAG 2.2 §2.5.8 target size: swatches are ≥24px.
  assert.ok(/\.lp-sw\{width:24px;height:24px/.test(html), 'swatches are ≥24px (WCAG 2.2 target size)');
  // Hover/focus PREVIEWS on the live element; click applies via the existing fence.
  assert.ok(/addEventListener\('mouseenter', function\(\)\{ sendPreviewClass/.test(html), 'hover previews the preset');
  assert.ok(/addEventListener\('focus', function\(\)\{ sendPreviewClass/.test(html), 'keyboard focus previews too (a11y parity)');
  assert.ok(html.includes("type:'lp-preview-class'") && html.includes("type:'lp-preview-clear'"), 'preview messages wired to the tap');
  assert.ok(/postMessage\(\{ type:'lp-preview-class'[^}]*\}, curOrigin\)/.test(html), 'preview is origin-targeted (never *)');
  // The preview is visual-only: the click clears it, then routes through sendEdit (the class fence).
  const ci0 = html.indexOf('const next=previewOf(this);');
  assert.ok(ci0 !== -1, 'the click handler computes the merged class via previewOf');
  const clickChunk = html.slice(ci0, ci0 + 200);
  assert.ok(clickChunk.includes('sendClearPreview()') && clickChunk.includes("sendEdit('class', next)"), 'click clears the preview then applies via the fence');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §7 chrome — close (X), minimize, drag, and never covering the pinned node', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // The header carries a drag grip + minimize + close (X); a minimized 🐮 chip re-expands.
  assert.ok(html.includes('id="lp-ctb-x"') && html.includes('id="lp-ctb-min"') && html.includes('id="lp-ctb-grip"'), 'header has close/minimize/grip');
  assert.ok(html.includes('id="lp-ctb-chip"'), 'minimized chip present');
  assert.ok(html.includes('aria-label="Fechar a toolbar"') && html.includes('aria-label="Minimizar a toolbar"'), 'chrome buttons are labelled');
  // X closes; minimize collapses to the chip; the chip re-expands.
  assert.ok(/xb\.addEventListener\('click', function\(\)\{ hideCanvasToolbar\(\)/.test(html), 'X closes the toolbar');
  assert.ok(html.includes('lpToolbarMin=true') && html.includes('lpToolbarMin=false'), 'minimize/expand toggle the state');
  // The positioner tries above→below→right→left and rejects any candidate that covers the pin.
  assert.ok(html.includes('function lpRectsOverlap'), 'overlap test present (toolbar must not cover the node)');
  assert.ok(/if\(lpRectsOverlap\(\{x:c\.x,y:c\.y,w:tw,h:th\}, pin\)\) continue;/.test(html), 'candidates covering the pin are skipped');
  // Drag via the grip updates a manual position; the auto-anchor remains as the no-drag alternative.
  assert.ok(html.includes("grip.addEventListener('pointerdown'") && html.includes('lpToolbarManualPos='), 'grip drag repositions the toolbar');
  assert.ok(html.includes('WCAG 2.5.7') || html.includes('no-drag alternative'), 'drag has a documented no-drag alternative (WCAG 2.5.7)');
  // Chrome sizes meet WCAG 2.2 target size (≥24px).
  assert.ok(/\.lp-ctb-btn\{[^}]*width:26px;height:26px/.test(html), 'chrome buttons are ≥24px');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §3 real-time feedback — toast says exactly what happened + flashes the node', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('id="lp-ctb-toast"') && /role="status" aria-live="polite"/.test(html), 'a11y-live toast present');
  assert.ok(html.includes('function showToast'), 'toast renderer present');
  // An edit that landed → "✓ aplicado no preview · $0" + a pin flash.
  assert.ok(html.includes('✓ aplicado no preview · $0'), 'edit-applied toast copy');
  assert.ok(html.includes("showToast('ok'") && html.includes('sendFlash()'), 'apply shows the ok toast and flashes');
  // Honesty (adversarial pass): $0 appears ONLY for deterministic/local writes. An escalated fenced
  // rewrite (m.tier t1/t2/t3) says the tier + subscrição — never a false $0 on paid work.
  assert.ok(/m\.reason==='model-applied' && m\.tier && m\.tier!=='local'/.test(html), 'toast gates $0 on tier');
  assert.ok(html.includes("'✓ escrito · '+tierModel(m.tier)+' · subscrição'"), 'escalated rewrite toast is honest about cost');
  // Host threads the tier so the toast can tell the truth.
  const ext = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.ok(/_postEditResult\(true, m\.dynamic \? 'model-applied-dynamic' : 'model-applied', m\.tier\)/.test(ext), 'host passes the tier to the edit result');
  assert.ok(/if \(tier && tier !== 'local'\) msg\.tier = String\(tier\)/.test(ext), 'result message carries the non-local tier');
  // A question answered → "💬 resposta no painel →" (points to the panel, no false "changed").
  assert.ok(html.includes('💬 resposta no painel →') && html.includes("showToast('ask'"), 'answer toast points to the panel');
  // A refusal → an honest warn toast.
  assert.ok(html.includes("showToast('warn'") && html.includes('function toastReason'), 'refusal shows an honest warn toast');
  // The flash is a message to the tap (origin-targeted), which pulses the pin box.
  assert.ok(html.includes("type:'lp-flash'"), 'flash wired to the tap');
  assert.ok(/postMessage\(\{ type:'lp-flash' \}, curOrigin\)/.test(html), 'flash is origin-targeted');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §8 live progress — spinning 🐮 with honest tier + cancel, never mute', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('id="lp-progress"') && html.includes('id="lp-progress-txt"'), 'progress region present');
  assert.ok(html.includes('class="lp-spin"') && /@keyframes lpSpin/.test(html), 'the 🐮 spinner animates');
  assert.ok(/@media \(prefers-reduced-motion:reduce\)\{\.lp-spin\{animation:none\}\}/.test(html), 'spinner respects reduced-motion');
  // Honest tier text on both paths (local $0 vs the agent subscription).
  assert.ok(html.includes('🐮 a pensar… (moo local · $0') && html.includes("'🐮 a pensar… ('+(m.mode==='auto'?'AUTO':tierModel(m.mode))"), 'honest tier while thinking');
  assert.ok(html.includes('function lpStartProgress') && html.includes('function lpFinishProgress'), 'progress starts and ends');
  // Start on thinking, end on result — never left mute.
  assert.ok(/lp-task-result'\)\{[\s\S]*?lpFinishProgress\(\)/.test(html), 'progress ends when the task result arrives');
  // Cancel (agent runs only) posts lp-task-cancel from the WEBVIEW.
  assert.ok(html.includes("type:'lp-task-cancel'"), 'cancel wired from the toolbar');
  assert.ok(/lpStartProgress\(txt, true\)/.test(html), 'agent runs show a cancel button');
  assert.ok(/lpStartProgress\(txt, false\)/.test(html), 'local $0 runs (fast) show no cancel');
  // Design-critique #4: a run stays visible when the toolbar is minimized — the 🐮 chip pulses.
  assert.ok(html.includes("chip.classList.add('lp-chip-working')") && html.includes("chip.classList.remove('lp-chip-working')"), 'the minimized chip shows working state');
  assert.ok(/@keyframes lpChipPulse/.test(html), 'the working chip pulses (with reduced-motion fallback)');
  parseInlineScript(html);
  // HOST side (Node, not in the webview HTML): the handler aborts the active task, and the runner
  // honours an AbortSignal additively. Assert against the raw source.
  const ext = fs.readFileSync(path.join(__dirname, 'extension.js'), 'utf8');
  assert.ok(ext.includes("m.type === 'lp-task-cancel'") && ext.includes('_activeTaskAbort.abort()'), 'host aborts the active task');
  assert.ok(ext.includes('signal: ac ? ac.signal : undefined'), 'the run receives the abort signal');
  const taskSrc = fs.readFileSync(path.join(__dirname, 'live-edit-task.js'), 'utf8');
  assert.ok(taskSrc.includes("finish({ ok: false, reason: 'task-cancelled' })") && taskSrc.includes("o.signal.addEventListener('abort'"), 'runner kills the child on abort (additive, unchanged without a signal)');
});

test('Live Preview LP-4.9 §4 coach marks — first-run onboarding, dismissible, never repeats + "?" help', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  assert.ok(html.includes('id="lp-coach"') && /role="dialog"/.test(html), 'coach-marks dialog present');
  assert.ok(html.includes('function showCoachMarks') && html.includes('function maybeCoachOnArm'), 'first-run trigger present');
  // Three honest steps: pick → edit/ask → $0 presets.
  assert.ok(html.includes('Clica num elemento') && html.includes('Editar ou Perguntar') && html.includes('Cor e tamanho são $0'), 'the 3 steps');
  // Shown only on the FIRST arm; the flag persists so it never repeats.
  assert.ok(/maybeCoachOnArm\(\)/.test(html), 'coach marks trigger when the 🎯 arms');
  assert.ok(html.includes("localStorage.getItem('lp-coach-done')") && html.includes("localStorage.setItem('lp-coach-done','1')"), 'dismissal persists (never repeats)');
  // Re-openable any time from the "?" (WCAG 2.2 §3.2.6 consistent help).
  assert.ok(html.includes('id="lp-ctb-help"') && /aria-label="Abrir a ajuda"/.test(html), 'the ? re-opens help');
  assert.ok(/helpBtn\.addEventListener\('click', function\(\)\{ showCoachMarks\(\)/.test(html), 'the ? is wired to the coach marks');
  // Design-critique #2 (a11y): a REAL modal — aria-modal, described-by, background made inert, Tab trapped.
  assert.ok(/aria-modal="true"/.test(html) && /aria-describedby="lp-coach-body"/.test(html), 'coach is a proper modal dialog');
  assert.ok(html.includes('function setCoachBackgroundInert') && /el\.inert=!!on/.test(html), 'background is made inert while the modal is open');
  assert.ok(html.includes("e.key==='Tab'") && /last\.focus\(\)/.test(html) && /first\.focus\(\)/.test(html), 'Tab is trapped within the dialog');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 §6 WCAG 2.2 AA — target size ≥24px, focus not obscured, ARIA', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // §2.5.8 target size — the in-canvas controls are ≥24px (buttons, chips, swatches, ✕).
  assert.ok(/\.lp-ctb \.lp-sel-btn\{min-height:24px\}/.test(html), 'toolbar buttons ≥24px');
  assert.ok(/\.lp-ctb \.lp-ref-x\{min-width:24px;min-height:24px/.test(html), 'reference ✕ is a ≥24px target');
  assert.ok(/\.lp-ctb \.lp-tier\{min-height:24px/.test(html), 'model chips ≥24px');
  assert.ok(/\.lp-sw\{width:24px;height:24px/.test(html), 'preset swatches ≥24px');
  // §2.4.11 focus not obscured — scroll-padding keeps a focused control clear of the sticky bars.
  assert.ok(/\.lp-ctb\{scroll-padding-top:40px;scroll-padding-bottom:44px\}/.test(html), 'focus not obscured under sticky header/progress');
  // ARIA on the toggles + swatches + menu + live regions.
  assert.ok(/role="radio" aria-checked/.test(html), 'intent toggle exposes radio state');
  assert.ok(html.includes('aria-label="cor do texto') || html.includes('aria-label="fundo'), 'swatches are labelled');
  assert.ok(html.includes('aria-live="polite"'), 'toast/progress are announced');
  // §3.2.6 consistent help — the "?" is always in the same place.
  assert.ok(html.includes('id="lp-ctb-help"'), 'consistent help affordance present');
  parseInlineScript(html);
});

test('Live Preview LP-4.9 loop-fix — never mute in-canvas + project-context transparency', () => {
  const sandbox = loadExtension();
  const html = sandbox.getLivePreviewHtml('tok');
  // A — sending starts the toolbar progress INSTANTLY (not just the side panel), for every path.
  assert.ok(html.includes("lpStartProgress('🐮 a enviar ao agente…', true)"), 'agent send shows instant in-canvas progress');
  assert.ok(html.includes("lpStartProgress('🐮 a reescrever este elemento… (moo local · $0)', false)"), 'local send shows instant in-canvas progress');
  assert.ok(html.includes("lpStartProgress('🐮 a enviar a pergunta…', true)"), 'ask send shows instant in-canvas progress');
  // B — the local (lp-prompt) path surfaces in-canvas: a toast on diff-ready and on failure.
  assert.ok(html.includes("showToast('ask','📝 proposta pronta — revê e aplica no painel →')"), 'diff-ready toast points to the panel');
  assert.ok(html.includes("showToast('warn','⚠️ o moo local não ficou confiante"), 'local-quality-exhausted surfaces in-canvas');
  // A honest refusal when asking with no bridge now ALSO toasts (was panel-only).
  assert.ok(/if\(!br\.available\)\{ showEditResult\(false[^}]*showToast\('warn'/.test(html), 'ask refusal toasts in-canvas');
  // C — the always-visible context line tells the user if the edit reads the PROJECT or only the node.
  assert.ok(html.includes('id="lp-ctx"') && html.includes('function renderCtxLine'), 'context/route line present');
  assert.ok(html.includes('o agente lê o projeto TODO e edita no sítio certo'), 'agent-available copy: full project context');
  assert.ok(html.includes('edita SÓ este elemento, sem contexto do projeto'), 'agent-off copy: local-only, no project context + how to enable');
  assert.ok(html.includes('@anthropic-ai/claude-agent-sdk'), 'tells the user how to turn the agent on');
  // The context line refreshes when the SDK-bridge status changes.
  assert.ok(/renderModeChips\(\); renderCtxLine\(\)/.test(html), 'context line refreshes on bridge change');
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
