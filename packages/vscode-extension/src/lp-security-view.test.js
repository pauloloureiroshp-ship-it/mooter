// lp-security-view.test.js — Review Security · LP-5 §A. Pins the honest header, severity
// grouping (Critical → Warning → Info), HTML-escaping of every dynamic string, and fail-soft
// behaviour on malformed/absent input.
'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { renderSecurityFindings, renderSecurityActivity, bucketOf } = require('./lp-security-view.js');

test('bucketOf: folds every scanner severity vocabulary into critical/warning/info, never promotes', () => {
  assert.strictEqual(bucketOf('critical'), 'critical');
  assert.strictEqual(bucketOf('high'), 'critical');
  assert.strictEqual(bucketOf('warning'), 'warning');
  assert.strictEqual(bucketOf('moderate'), 'warning');
  assert.strictEqual(bucketOf('info'), 'info');
  assert.strictEqual(bucketOf('low'), 'info');
  assert.strictEqual(bucketOf(undefined), 'info');
  assert.strictEqual(bucketOf('made-up'), 'info');
});

test('renderSecurityFindings: honest header always present, even on empty/no findings', () => {
  const html = renderSecurityFindings({ secrets: [], xss: [], csp: { hasCsp: false, findings: [] }, audit: { ok: false }, scannedFiles: 12 });
  assert.ok(html.includes('Não substitui auditoria humana'), 'never claims to replace a human audit');
  assert.ok(html.includes('cobre secret-scan, npm audit, CSP e XSS estático'), 'header states scope');
  assert.ok(html.includes('npm audit consulta o registry npm'), 'honest caveat: npm audit makes a registry network call');
  assert.ok(html.includes('nenhum código teu sai'), 'honest: no workspace code leaves the box');
  assert.ok(html.includes('nada encontrado pelos 4 scanners estáticos'), 'honest empty state');
  assert.ok(html.includes('12 ficheiros analisados'), 'scanned-file count surfaced');
  assert.ok(html.includes('npm audit indisponível'), 'audit ok:false is never presented as clean');
});

test('renderSecurityFindings: groups Critical before Warning before Info, with counts', () => {
  const result = {
    secrets: [{ path: 'a.env', line: 3, type: 'aws-access-key', severity: 'critical', preview: 'AKIA…' }],
    xss: [{ path: 'b.tsx', line: 10, type: 'dangerously-set-inner-html', severity: 'warning', snippet: 'dangerouslySetInnerHTML={{__html:x}}' }],
    csp: { hasCsp: false, findings: [{ type: 'missing-csp', severity: 'info', detail: 'Nenhum header Content-Security-Policy encontrado.' }] },
    audit: { ok: true, honestSummary: '1 high — 1 crítica/alta com possível exposição em produção.', top: [{ name: 'lodash', severity: 'high', title: 'Prototype Pollution', range: '<4.17.21', fixAvailable: true }] },
    scannedFiles: 40,
  };
  const html = renderSecurityFindings(result);
  const critIdx = html.indexOf('Crítico');
  const warnIdx = html.indexOf('Aviso');
  const infoIdx = html.indexOf('Info');
  assert.ok(critIdx !== -1 && warnIdx !== -1 && infoIdx !== -1, 'all three groups present');
  assert.ok(critIdx < warnIdx && warnIdx < infoIdx, 'severity order Critical → Warning → Info');
  // secret (critical) + audit high (folded into critical) both land in the Crítico group.
  assert.ok(html.includes('Crítico (2)'), 'secret + audit-high both bucket into Critical');
  assert.ok(html.includes('Aviso (1)'), 'xss warning counted');
  assert.ok(html.includes('Info (1)'), 'csp info counted');
});

test('renderSecurityFindings: redacted preview/snippet pass through untouched (only escaped)', () => {
  const html = renderSecurityFindings({
    secrets: [{ path: 'x/.env', line: 1, type: 'generic-secret-assignment', severity: 'critical', preview: 'AKIA…' }],
    xss: [], csp: { hasCsp: true, findings: [] }, audit: { ok: false }, scannedFiles: 1,
  });
  assert.ok(html.includes('AKIA…'), 'redacted preview shown as-is (already truncated by the scanner)');
  assert.ok(!/AKIA[0-9A-Z]{16}/.test(html), 'never a full unredacted secret in the output');
});

test('renderSecurityFindings: HTML-escapes every dynamic string (paths, types, previews, csp detail)', () => {
  const html = renderSecurityFindings({
    secrets: [{ path: '<img src=x onerror=alert(1)>.env', line: 1, type: 'generic-secret-assignment', severity: 'warning', preview: '<script>' }],
    xss: [], csp: { hasCsp: false, findings: [] }, audit: { ok: false }, scannedFiles: 1,
  });
  assert.ok(!html.includes('<img src=x onerror'), 'hostile path is escaped');
  assert.ok(!html.includes('<script>'), 'hostile preview is escaped');
  assert.ok(html.includes('&lt;img') && html.includes('&lt;script&gt;'), 'escaped forms present');
});

test('renderSecurityFindings: fail-soft on malformed/absent input — never throws, never fabricates', () => {
  assert.doesNotThrow(() => renderSecurityFindings(undefined));
  assert.doesNotThrow(() => renderSecurityFindings(null));
  assert.doesNotThrow(() => renderSecurityFindings('garbage'));
  assert.doesNotThrow(() => renderSecurityFindings({ secrets: 'not-an-array', xss: null, csp: 42, audit: 'nope' }));
  const html = renderSecurityFindings(undefined);
  assert.ok(html.includes('sem dados'), 'undefined result → honest "sem dados", not a crash');
});

test('renderSecurityFindings: an error result reports the failure honestly (no partial/fabricated findings)', () => {
  const html = renderSecurityFindings({ error: 'scan-failed' });
  assert.ok(html.includes('falhou'), 'failure is stated plainly');
  assert.ok(html.includes('scan-failed'), 'the reason is surfaced');
  assert.ok(!html.includes('lp-sec-group'), 'no finding groups rendered on a failed scan');
});

test('renderSecurityFindings: accepts a custom esc (webview contract, same as renderPresetsBarHTML)', () => {
  let calls = 0;
  const esc = (x) => { calls++; return String(x == null ? '' : x); };
  renderSecurityFindings({ secrets: [{ path: 'a', line: 1, type: 't', severity: 'critical', preview: 'p' }], scannedFiles: 1 }, esc);
  assert.ok(calls > 0, 'the provided esc is actually used');
});

test('Review Security UX: count chips, report and host-vetted remediation actions stay together', () => {
  const html = renderSecurityFindings({
    secrets: [{ findingId: 'sf_secret', path: '.env', line: 1, type: 'token', severity: 'critical', preview: 'abc…', fixable: false }],
    xss: [{ findingId: 'sf_xss', path: 'app/page.tsx', line: 4, type: 'raw-html', severity: 'warning', snippet: 'dangerouslySetInnerHTML', fixable: true }],
    csp: { hasCsp: true, findings: [] }, audit: { ok: false }, scannedFiles: 8,
    counts: { critical: 1, warning: 1, info: 0, total: 2 }, reportId: 'sec-123', scannedAt: 1,
    coverage: { secrets: true, xss: true, csp: true, npmAudit: false },
    thread: [{ role: 'activity', text: 'A procurar findings.' }, { role: 'assistant', text: 'Review concluído.' }],
  });
  assert.ok(html.includes('1 crítico') && html.includes('1 aviso'), 'badge-ready counts are rendered');
  assert.ok(html.includes('Relatório final · sec-123'), 'the final report remains easy to reopen');
  assert.ok(html.includes('data-security-open="sf_secret"'), 'a secret can be opened for manual treatment');
  assert.ok(!html.includes('data-security-fix="sf_secret"'), 'a secret is never auto-fixed');
  assert.ok(html.includes('data-security-fix="sf_xss"'), 'only the host-vetted code finding offers agent remediation');
  assert.ok(html.includes('thread do review') && html.includes('Review concluído.'), 'scan/remediation activity is visible in one thread');
});

test('renderSecurityActivity escapes hostile thread content', () => {
  const html = renderSecurityActivity([{ role: 'assistant', text: '<img src=x onerror=alert(1)>' }]);
  assert.ok(!html.includes('<img src=x'));
  assert.ok(html.includes('&lt;img'));
});
