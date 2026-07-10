// lp-publish-view.test.js — 🚀 Publish popover · LP-6 §A. Pins: honest status derivation, cost
// line, disabled commit/deploy when a Critical is open, disabled deploy when Vercel isn't linked,
// the two-factor gate markup carries the expected project name, HTML-escaping of every dynamic
// string, and fail-soft behaviour on malformed/absent input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { renderPublishPopover, pathOf } = require('./lp-publish-view.js');

test('pathOf: reads {path} objects or bare strings, never throws on garbage', () => {
  assert.strictEqual(pathOf({ x: 'M', y: ' ', path: 'a/b.ts' }), 'a/b.ts');
  assert.strictEqual(pathOf('bare/path.ts'), 'bare/path.ts');
  assert.strictEqual(pathOf(null), '');
  assert.strictEqual(pathOf(undefined), '');
  assert.strictEqual(pathOf(42), '42');
});

test('renderPublishPopover: Draft status + honest cost line + no fabricated site URL', () => {
  const html = renderPublishPopover({ branch: 'wave/lp-6', touchedFiles: [], defaultMessage: '', vercelLinked: true, projectName: 'landing', hasOpenCritical: false, websiteUrl: null });
  assert.ok(html.includes('Rascunho'), 'no known deploy URL → Rascunho, never Publicado');
  assert.ok(html.includes('ainda sem deploy conhecido'), 'honestly states no deploy known this session');
  // D10 (F9 honesty) — the cost line names WHO charges; it never claims deploy is $0 (Vercel bills, cloud
  // edits use the Anthropic subscription). "sem cobrança do Mooter" is the only $0-adjacent claim, and it is true.
  assert.ok(html.includes('sem cobrança do Mooter'), 'states the honest truth: Mooter itself does not charge');
  assert.ok(html.includes('deploy = a tua conta Vercel'), 'deploy cost is attributed to the user Vercel account, not falsely $0');
  assert.ok(!/deploy \$0/.test(html), 'the old lying "deploy $0" absolute is gone');
  assert.ok(!html.includes('https://'), 'no invented URL anywhere');
});

test('renderPublishPopover: "Publicado" requires a REAL deploy THIS session; a bare URL is "Site ligado" (D10 honesty)', () => {
  // A linked project always has a prod URL — a bare websiteUrl must NOT claim the current tree is live.
  const linkedOnly = renderPublishPopover({ branch: 'main', touchedFiles: [], websiteUrl: 'https://mysite.vercel.app', vercelLinked: true, projectName: 'landing' });
  assert.ok(linkedOnly.includes('Site ligado') && !linkedOnly.includes('Publicado'), 'a known URL without a session deploy → Site ligado, never Publicado');
  assert.ok(/último deploy conhecido/.test(linkedOnly), 'the URL is honestly framed as the last known deploy');
  // Only a successful deploy result THIS session earns "Publicado".
  const deployed = renderPublishPopover({ branch: 'main', touchedFiles: [], websiteUrl: 'https://mysite.vercel.app', vercelLinked: true, projectName: 'landing', lastResult: { action: 'deploy', ok: true, url: 'https://mysite.vercel.app' } });
  assert.ok(deployed.includes('Publicado'), 'a real successful deploy this session → Publicado');
  assert.ok(deployed.includes('https://mysite.vercel.app'), 'the URL text is present (webview turns it into a link)');
});

test('renderPublishPopover: touched files listed, commit textarea seeded with the default message', () => {
  const html = renderPublishPopover({
    branch: 'wave/lp-6',
    touchedFiles: [{ x: 'M', y: ' ', path: 'landing/app/page.tsx' }, { x: '?', y: '?', path: 'new-file.ts' }],
    defaultMessage: 'wip(wave/lp-6): 2 files — page.tsx +1',
    vercelLinked: false,
  });
  assert.ok(html.includes('landing/app/page.tsx'), 'first touched file listed');
  assert.ok(html.includes('new-file.ts'), 'second touched file listed');
  assert.ok(html.includes('2 ficheiros por commitar'), 'honest count, pluralised');
  assert.ok(html.includes('wip(wave/lp-6): 2 files'), 'default commit message seeds the textarea');
  assert.ok(!html.includes('lp-pub-commit-btn" class="lp-sel-btn" disabled'), 'commit enabled when files exist and no Critical is open');
});

test('renderPublishPopover: no touched files → honest empty state, commit button disabled', () => {
  const html = renderPublishPopover({ branch: 'main', touchedFiles: [] });
  assert.ok(html.includes('nada por commitar'), 'honest empty state, not a fabricated list');
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(html), 'commit disabled with nothing to commit');
});

test('renderPublishPopover: an open Critical disables BOTH commit and deploy, with the exact reason shown', () => {
  const html = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }], vercelLinked: true, projectName: 'landing', hasOpenCritical: true, securityReason: 'critical-open',
  });
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(html), 'commit disabled while a Critical is open');
  assert.ok(html.includes('resolve o Critical no 🛡 Review Security primeiro'), 'the exact reason is stated, twice (commit + deploy sections)');
  assert.ok(!html.includes('lp-pub-deploy-open'), 'deploy button itself is not rendered while a Critical is open');
});

test('D6: publish blocked for NO scan states the honest reason (not a lying "resolve the Critical")', () => {
  const html = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }], vercelLinked: true, projectName: 'landing', hasOpenCritical: true, securityReason: 'security-scan-required',
  });
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(html), 'commit disabled until a valid scan exists');
  assert.ok(html.includes('corre o 🛡 Review Security primeiro'), 'says a scan is REQUIRED — not "resolve the Critical" when there is no scan yet');
  assert.ok(!html.includes('resolve o Critical'), 'no false claim of an open Critical when the real reason is a missing scan');
});

test('D6: publish blocked for a STALE scan states the code changed since the scan', () => {
  const html = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }], vercelLinked: true, projectName: 'landing', hasOpenCritical: true, securityReason: 'security-scan-stale',
  });
  assert.ok(html.includes('mudou desde o último 🛡 scan'), 'honest: the scan is stale, re-run it');
});

test('renderPublishPopover: not linked to Vercel → no deploy control at all, states why', () => {
  const html = renderPublishPopover({ branch: 'main', touchedFiles: [], vercelLinked: false });
  assert.ok(!html.includes('lp-pub-deploy-open'), 'no deploy button when not linked');
  assert.ok(html.includes('não está ligado a um projeto Vercel'), 'honest reason surfaced');
});

test('renderPublishPopover: deploy gate markup carries the expected project name for the two-factor input', () => {
  const html = renderPublishPopover({ branch: 'main', touchedFiles: [], vercelLinked: true, projectName: 'mooter-landing', hasOpenCritical: false });
  assert.ok(html.includes('lp-pub-deploy-open'), 'deploy button rendered when linked + no Critical');
  assert.ok(html.includes('lp-pub-gate-input'), 'the two-factor text input is present');
  assert.ok(html.includes('mooter-landing'), 'expected project name shown as the hint (host re-verifies independently)');
  assert.ok(html.includes('IRREVERSÍVEL'), 'the deploy button itself states irreversibility');
});

test('renderPublishPopover: last commit/deploy result renders honestly (success and failure)', () => {
  const okCommit = renderPublishPopover({ branch: 'main', touchedFiles: [], lastResult: { action: 'commit', ok: true, cmd: 'git add -- <1 file> && git commit -m "x"' } });
  assert.ok(okCommit.includes('✓ commit + push'));
  const failCommit = renderPublishPopover({ branch: 'main', touchedFiles: [], lastResult: { action: 'commit', ok: false, reason: 'commit-failed', out: 'nothing to commit' } });
  assert.ok(failCommit.includes('commit-failed') && failCommit.includes('nothing to commit'));
  const okDeploy = renderPublishPopover({ branch: 'main', touchedFiles: [], lastResult: { action: 'deploy', ok: true, url: 'https://x.vercel.app' } });
  assert.ok(okDeploy.includes('✓ deploy') && okDeploy.includes('https://x.vercel.app'));
  const failDeploy = renderPublishPopover({ branch: 'main', touchedFiles: [], lastResult: { action: 'deploy', ok: false, reason: 'name-mismatch' } });
  assert.ok(failDeploy.includes('deploy:') && failDeploy.includes('name-mismatch'), 'a refused deploy states the refusal reason, never a fabricated success');
});

test('renderPublishPopover: HTML-escapes every dynamic string (paths, branch, message, project name, url, out)', () => {
  const html = renderPublishPopover({
    branch: '<script>a</script>',
    touchedFiles: [{ path: '<img src=x onerror=alert(1)>.ts' }],
    defaultMessage: '<b>msg</b>',
    vercelLinked: true,
    projectName: '<script>p</script>',
    websiteUrl: '<script>u</script>',
    lastResult: { action: 'commit', ok: false, reason: '<script>r</script>', out: '<script>o</script>' },
  });
  assert.ok(!html.includes('<script>a</script>'), 'branch escaped');
  assert.ok(!html.includes('<img src=x onerror'), 'file path escaped');
  assert.ok(!html.includes('<b>msg</b>'), 'default message escaped');
  assert.ok(!html.includes('<script>p</script>'), 'project name escaped');
  assert.ok(!html.includes('<script>u</script>'), 'website url escaped');
  assert.ok(!html.includes('<script>r</script>') && !html.includes('<script>o</script>'), 'result reason/out escaped');
  assert.ok(html.includes('&lt;script&gt;'), 'escaped forms actually present');
});

test('renderPublishPopover: fail-soft on malformed/absent input — never throws, never fabricates', () => {
  assert.doesNotThrow(() => renderPublishPopover(undefined));
  assert.doesNotThrow(() => renderPublishPopover(null));
  assert.doesNotThrow(() => renderPublishPopover('garbage'));
  assert.doesNotThrow(() => renderPublishPopover({ touchedFiles: 'not-an-array', lastResult: 'nope' }));
  const html = renderPublishPopover(undefined);
  assert.ok(html.includes('sem dados'), 'undefined state → honest "sem dados", not a crash');
});

test('renderPublishPopover: an error state reports the failure honestly (no partial UI)', () => {
  const html = renderPublishPopover({ error: 'status-failed' });
  assert.ok(html.includes('falhou') && html.includes('status-failed'));
  assert.ok(!html.includes('lp-pub-commit-btn'), 'no controls rendered on a failed status fetch');
});

test('renderPublishPopover: accepts a custom esc (webview contract, same as renderSecurityFindings)', () => {
  let calls = 0;
  const esc = (x) => { calls++; return String(x == null ? '' : x); };
  renderPublishPopover({ branch: 'main', touchedFiles: [{ path: 'a.ts' }], vercelLinked: true, projectName: 'p' }, esc);
  assert.ok(calls > 0, 'the provided esc is actually used');
});
