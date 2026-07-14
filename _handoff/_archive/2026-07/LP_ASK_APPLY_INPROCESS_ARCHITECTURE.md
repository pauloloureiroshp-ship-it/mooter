# LP Ask→Apply is in-process only — do NOT re-attempt to drive it from a CLI

> **Discovered 2026-07-12** (wave/lp-coerencia). Signpost so no future session burns tokens
> re-testing whether the Live Preview Ask→Apply→Security-Review pipeline can be triggered
> from outside the VS Code Extension Host. **It cannot.** Read this before trying.

## The claim that keeps coming up
"Invoke the *same* host-side Ask/Apply handler the GUI calls, from a CLI / Cowork / script,
with the real lease + taskId, to prove the pipeline end-to-end against the dev server."

## Why it is not executable from any process other than the Extension Host

The handlers are prototype methods on `LivePreviewPanel` in
[packages/vscode-extension/src/extension.js](../../../packages/vscode-extension/src/extension.js):

| Piece | Location | Nature |
|---|---|---|
| `_askApply(m)` | extension.js:2899 | reads `askId` from `this._askReg` (an **in-memory `Map`**), then calls `_taskRun` |
| `_taskRun(m)` | extension.js:2735 | runs a **real anchored agent/LLM edit** inside the extension; gated by `_workspaceTrusted`, `_treeGateBlocked`, `_selectionMissing`, `LET` engine |
| message router | extension.js:1777–1781 (`lp-ask-apply` → `_askApply`) | dispatch only |
| the ONLY inbound channel | extension.js:3108 `this.panel.webview.onDidReceiveMessage` | VS Code's **in-process** webview↔host bridge |

Decisive facts:

1. **There is no `lp-ask-apply-host.js` implementation file** — only `lp-ask-apply-host.test.js`.
   The "host" is the `LivePreviewPanel` class, which exists only inside the running Extension Host process.
2. **No out-of-process entry point exists.** `grep` for `createServer` / `.listen` / `http.Server`
   / IPC / socket in `extension.js` returns nothing. The sole inbound path is
   `webview.onDidReceiveMessage`. `cowork-waiting.js` is a one-way status-badge reader
   (`~/.claude/tools/router/.cowork-pending.json`), **not** a command inlet. `registerCommand`
   entries are palette commands that also run inside the host.
3. **The lease / selection / `_askReg` are in-memory** on the panel instance — not on disk, not
   over HTTP. "Read the current real lease the host registered" is impossible from another process;
   any `selectionLease` / `askId` produced elsewhere would be fabricated.
4. **The Apply path is an LLM edit**, orchestrated in-extension using the user's session — not a
   deterministic op reproducible out-of-process without (a) a cloud call and (b) bypassing the very
   lease/trust/`_askReg` contract (the "filesystem shortcut" the contract is designed to forbid).
5. **A CLI Claude Code session has *less* access than the webview GUI**, not more — it is a third
   process. The webview is the privileged caller; the CLI is further out.

## The test suite does not perform a real edit either
`lp-ask-apply-host.test.js` reconstructs a fake `LivePreviewPanel` in a `vm` sandbox with a
stubbed `vscode`, hand-seeds `_askReg`, and **stubs `_taskRun`** (test line ~93). It asserts the
host *composes the edit from the stored question+answer and ignores a tampered payload* — a strong
contract proof, but it never writes a file. `package.json` `test` = `node --test src/*.test.js`.

## No integration harness exists (checked 2026-07-12)
No `@vscode/test-electron`, no `runTests(`, no `.vscode-test.mjs`, no `test/suite/`, no
devDependency that could boot a real Extension Host. Building one was explicitly out of scope.

## The ONLY ways to actually prove it E2E
1. **Human clicks** "Perguntar" → "▶ Aplicar com o agente" in the real Live Preview panel (the
   webview that already holds the pinned selection + live lease + `_askReg`). This is the only
   legitimate emitter of `lp-ask-apply`.
2. An `@vscode/test-electron` integration test that boots a real panel — but that still incurs a
   real LLM edit and is not "prove it against the running dev server."

## Guardrails confirmed during this investigation
- `classify.js` sha256 `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` — intact (== CI-frozen).
- `landing/app/page.tsx` untouched — no edit was made; the pipeline could not be honestly driven.
