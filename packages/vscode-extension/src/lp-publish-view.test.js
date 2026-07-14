// lp-publish-view.test.js — 🚀 Publish popover · LP-6 §A. Pins: honest status derivation, cost
// line, disabled commit/deploy when a Critical is open, disabled deploy when Vercel isn't linked,
// the two-factor gate markup carries the expected project name, HTML-escaping of every dynamic
// string, and fail-soft behaviour on malformed/absent input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { renderPublishPopover, pathOf } = require('./lp-publish-view.js');
const { sanitizeGitRemoteUrl } = require('./host-extra.js');

test('pathOf: reads {path} objects or bare strings, never throws on garbage', () => {
  assert.strictEqual(pathOf({ x: 'M', y: ' ', path: 'a/b.ts' }), 'a/b.ts');
  assert.strictEqual(pathOf({ x: 'R', y: ' ', path: 'src/new.ts', origPath: 'src/old.ts' }), 'src/old.ts → src/new.ts');
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
  assert.ok(html.includes('2 ficheiros aprovados pelo Live Preview'), 'honest approved count, pluralised');
  assert.ok(html.includes('wip(wave/lp-6): 2 files'), 'default commit message seeds the textarea');
  assert.ok(!html.includes('lp-pub-commit-btn" class="lp-sel-btn" disabled'), 'commit enabled when files exist and no Critical is open');
});

test('Publish Git step explains the transactional bytes lease and its hook/signing tradeoff', () => {
  const html = renderPublishPopover({
    branch: 'main',
    touchedFiles: [{ x: 'R', y: ' ', path: 'src/new.ts', origPath: 'src/old.ts' }],
    git: { available: true, name: 'origin', url: 'git@github.com:mooter-ai/mooter.git', targetBranch: 'main' },
  });
  assert.ok(html.includes('src/old.ts → src/new.ts'), 'the UI shows both halves of the rename as one reviewed change');
  assert.ok(html.includes('somente com os bytes revistos acima'), 'the protected commit names its exact reviewed-byte guarantee');
  assert.ok(html.includes('não executa hooks Git nem assinatura automática'), 'the plumbing tradeoff is explicit before action');
  assert.ok(html.includes('usa o fluxo Git habitual'), 'repositories that require those policies get an honest alternative');
});

test('Publish refusal reasons translate transactional Git failures into actionable copy', () => {
  const cases = [
    ['approved-content-changed', 'os bytes mudaram depois da revisão'],
    ['approved-content-unverifiable', 'não foi possível provar os bytes revistos'],
    ['approved-content-transform-unsupported', 'filtro Git tentaria transformar o código'],
    ['approved-snapshot-invalid', 'seleção aprovada ficou inválida'],
    ['git-head-moved', 'branch mudou enquanto o commit era preparado'],
    ['git-selected-base-moved', 'outro commit mudou o mesmo ficheiro'],
    ['git-index-selected-path-moved', 'staging deste ficheiro mudou'],
    ['git-index-lock-busy', 'índice Git está ocupado'],
    ['git-index-reconcile-failed', 'reconciliar o índice Git de forma atómica'],
    ['git-destination-changed', 'remote ou a branch de destino mudou'],
    ['git-operation-in-progress', 'merge, rebase, cherry-pick, revert ou sequencer em curso'],
    ['git-multiple-push-destinations', 'múltiplos destinos de push'],
    ['git-destination-unverifiable', 'URL efetiva de push não pôde ser provada'],
    ['vercel-identity-invalid', 'vínculo Vercel não contém uma identidade completa'],
    ['vercel-identity-changed', 'identidade Vercel mudou depois da confirmação'],
  ];
  for (const entry of cases) {
    const html = renderPublishPopover({
      branch: 'main', touchedFiles: [],
      lastResult: { action: 'commit', ok: false, reason: entry[0] },
    });
    assert.ok(html.includes(entry[1]), entry[0] + ' gets actionable human copy');
    assert.ok(!html.includes('✕ ' + entry[0]), entry[0] + ' is not exposed as an unexplained slug');
  }
});

test('Publish pipeline: shows Local → Git → Produção with the exact destinations before action', () => {
  const html = renderPublishPopover({
    branch: 'fix/live-magic',
    touchedFiles: [{ path: 'landing/app/page.tsx' }],
    defaultMessage: 'fix: live magic',
    local: { folder: 'mooter-live-preview', path: 'C:/Users/Paulo/mooter-live-preview', dirtyCount: 1, repo: true },
    git: { available: true, name: 'origin', url: 'git@github.com:mooter-ai/mooter.git', webUrl: 'https://github.com/mooter-ai/mooter' },
    destination: { url: 'https://mooter.ai', source: 'config do projeto' },
    vercelLinked: true,
    projectName: 'mooter',
  });
  const local = html.indexOf('<b>Local</b>');
  const git = html.indexOf('<b>Git</b>');
  const prod = html.indexOf('<b>Produção</b>');
  assert.ok(local !== -1 && git > local && prod > git, 'the three scopes are visible in order');
  assert.ok(html.includes('C:/Users/Paulo/mooter-live-preview'), 'local folder is explicit');
  assert.ok(html.includes('class="lp-pub-local-path"'), 'the full local path is visible without expanding a disclosure');
  assert.ok(html.includes('1 alteração'), 'the singular local change count is grammatical');
  assert.ok(!html.includes('alteraçãoões'), 'the broken plural is never rendered');
  assert.ok(html.includes('https://github.com/mooter-ai/mooter'), 'Git repository URL is explicit and clickable');
  assert.ok(html.includes('git@github.com:mooter-ai/mooter.git'), 'technical remote is available on demand');
  assert.ok(html.includes('https://mooter.ai'), 'production URL is explicit before deploy');
  assert.ok(html.includes('Guardar no Git (commit + push)'), 'Git action is named by effect');
});

test('Publish pipeline: renders the correct plural for local changes', () => {
  const html = renderPublishPopover({
    branch: 'main',
    touchedFiles: [{ path: 'one.ts' }, { path: 'two.ts' }],
    local: { folder: 'mooter', path: 'C:/src/mooter', dirtyCount: 2, repo: true },
  });
  assert.ok(html.includes('2 alterações'));
  assert.ok(!html.includes('alteraçãoões'));
});

test('Publish pipeline: separates approved Live Preview files from parallel local work', () => {
  const html = renderPublishPopover({
    branch: 'main',
    touchedFiles: [{ path: 'landing/app/lp-e2e/page.tsx' }],
    local: { folder: 'mooter', path: 'C:/src/mooter', dirtyCount: 3, publishableCount: 1, excludedCount: 2, repo: true },
  });
  assert.ok(html.includes('1 aprovada pelo Live Preview'));
  assert.ok(html.includes('2 alterações paralelas ficam apenas locais'));
  assert.ok(html.includes('1 ficheiro aprovado pelo Live Preview'));
});

test('Publish pipeline: explains same-file pre-existing WIP and escapes the blocked path', () => {
  const unsafePath = 'landing/<img src=x onerror=alert(1)>.tsx';
  const html = renderPublishPopover({
    branch: 'main',
    touchedFiles: [],
    hasOpenCritical: true,
    securityReason: 'preexisting-dirt-in-approved-file',
    local: { folder: 'mooter', path: 'C:/src/mooter', dirtyCount: 1, publishableCount: 0, excludedCount: 1, blockedPaths: [unsafePath], repo: true },
  });
  assert.ok(html.includes('não publicável ainda'));
  assert.ok(html.includes('já tinha alterações antes do primeiro Live Preview'));
  assert.ok(html.includes('reverte esta proposta'));
  assert.ok(html.includes('guarda/stash/commita o trabalho anterior'));
  assert.ok(html.includes('landing/&lt;img src=x onerror=alert(1)&gt;.tsx'));
  assert.ok(!html.includes(unsafePath), 'a path from Git never becomes executable HTML');
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(html));
  assert.ok(!html.includes('lp-pub-deploy-open'));
});

test('Publish pipeline: exposes the exact upstream branch plus ahead/behind state before push', () => {
  const html = renderPublishPopover({
    branch: 'fix/live-magic',
    ahead: 3,
    behind: 1,
    touchedFiles: [{ path: 'landing/app/page.tsx' }],
    git: {
      available: true,
      name: 'upstream-team',
      url: 'git@github.com:mooter-ai/mooter.git',
      webUrl: 'https://github.com/mooter-ai/mooter',
      targetBranch: 'release/live-preview',
    },
  });
  assert.ok(html.includes('destino do push: upstream-team/release/live-preview'), 'the remote and remote branch are explicit');
  assert.ok(html.includes('3 commits já prontos para push'), 'unpushed commits are visible before the action');
  assert.ok(html.includes('1 atrás do upstream'), 'divergence is visible instead of silently overwritten');
});

test('Publish pipeline: Production names the immutable pushed commit and blocks mutable-tree deploys', () => {
  const blocked = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'page.tsx' }], vercelLinked: true, projectName: 'mooter',
    deployReason: 'git-publish-required',
  });
  assert.ok(blocked.includes('Produção nunca recebe o working tree mutável'));
  assert.ok(!blocked.includes('id="lp-pub-deploy-open"'));
  const ready = renderPublishPopover({
    branch: 'main', touchedFiles: [], vercelLinked: true, projectName: 'mooter',
    gitPublishedCommit: '0123456789ab',
  });
  assert.ok(ready.includes('fonte imutável do deploy'));
  assert.ok(ready.includes('0123456789ab'));
  assert.ok(ready.includes('id="lp-pub-deploy-open"'));
});

test('git remote sanitization strips credentials/query tokens and derives a safe repo URL', () => {
  const https = sanitizeGitRemoteUrl('https://oauth2:super-secret-token@github.com/mooter-ai/mooter.git?token=also-secret');
  assert.strictEqual(https.url, 'https://github.com/mooter-ai/mooter.git');
  assert.strictEqual(https.webUrl, 'https://github.com/mooter-ai/mooter');
  assert.ok(!JSON.stringify(https).includes('secret'), 'no credential reaches the webview state');
  const ssh = sanitizeGitRemoteUrl('paulo@github.com:mooter-ai/mooter.git');
  assert.deepStrictEqual(ssh, { url: 'git@github.com:mooter-ai/mooter.git', webUrl: 'https://github.com/mooter-ai/mooter' });
  assert.deepStrictEqual(sanitizeGitRemoteUrl('C:/local/repo'), { url: null, webUrl: null }, 'a local path is not fabricated into a network remote');
});

test('Publish pipeline: an explicitly missing Git remote disables commit + push without hiding Local/Produção', () => {
  const html = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }],
    local: { folder: 'repo', path: '/repo', dirtyCount: 1 },
    git: { available: false, name: null, url: null, webUrl: null },
    destination: { url: 'https://mooter.ai', source: 'manifest do projeto' },
  });
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(html), 'does not knowingly create a local-only commit behind a commit+push label');
  assert.ok(html.includes('sem remote Git configurado'), 'the exact missing prerequisite is visible');
  assert.ok(html.includes('<b>Local</b>') && html.includes('<b>Produção</b>'), 'other scopes remain visible');
});

test('Publish pipeline: multiple or unverifiable Git push destinations fail closed with actionable copy', () => {
  const multiple = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }],
    git: { available: false, reason: 'git-multiple-push-destinations', destinationCount: 2, name: 'origin' },
  });
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(multiple));
  assert.ok(multiple.includes('remote tem 2 destinos de push'));
  assert.ok(multiple.includes('exatamente um destino explícito'));
  const unverifiable = renderPublishPopover({
    branch: 'main', touchedFiles: [{ path: 'a.ts' }],
    git: { available: false, reason: 'git-destination-unverifiable', destinationCount: 1, name: 'origin' },
  });
  assert.ok(/lp-pub-commit-btn[^>]*disabled/.test(unverifiable));
  assert.ok(unverifiable.includes('não foi possível provar a URL efetiva de push'));
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

test('renderPublishPopover: an invalid Vercel link is distinct from an absent link and never offers deploy', () => {
  const html = renderPublishPopover({ branch: 'main', touchedFiles: [], vercelLinked: false, vercelReason: 'vercel-identity-invalid' });
  assert.ok(!html.includes('lp-pub-deploy-open'));
  assert.ok(html.includes('vínculo Vercel está incompleto, ilegível ou inseguro'));
  assert.ok(html.includes('projectName, projectId e orgId'));
  assert.ok(!html.includes('project.json ausente'), 'does not misdiagnose an invalid link as missing');
});

test('renderPublishPopover: production shows redacted Vercel identity evidence but never provider IDs or the lease key', () => {
  const html = renderPublishPopover({
    branch: 'main', touchedFiles: [], vercelLinked: true, projectName: 'mooter',
    vercelIdentity: {
      projectName: 'mooter', projectIdHint: 'prj_su…full', orgIdHint: 'team_s…full',
      projectJsonSha256Hint: 'abcdef123456', key: 'opaque-status-lease-must-not-render',
    },
  });
  assert.ok(html.includes('alvo Vercel'));
  assert.ok(html.includes('prj_su…full'));
  assert.ok(html.includes('team_s…full'));
  assert.ok(html.includes('abcdef123456'));
  assert.ok(!html.includes('opaque-status-lease-must-not-render'));
  assert.ok(!html.includes('prj_super_secret_full'));
  assert.ok(!html.includes('team_super_secret_full'));
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
