# Wave 18 — Accessibility (WCAG AA) Audit

> **Run**: 2026-06-05, autonomous read-only self-audit. Orchestrator: Claude Code (Opus).
> Workers: 3 concurrent `local-summarizer` (Ollama) subagents — one per page.
> **Read-only**: no code changed.
>
> **⚠️ Premise correction**: the brief framed this as "Tailwind tokens vs WCAG" —
> but **this repo has no Tailwind**. Audited the **real** CSS-var colors from
> `globals.css`. The workers also used **inconsistent contrast formulas** (simple
> luma, not WCAG sRGB-linearized); the orchestrator **recomputed the borderline
> ratio** with the correct WCAG formula — see the muted-text finding.

## TL;DR

| Finding | Pages | Severity |
|---|---|---|
| Muted text `--color-muted` ≈ **4.1:1** — fails AA for *normal* text | all (site-wide token) | **med** |
| No `:focus` / focus-visible indicators in `globals.css` (WCAG 2.4.7) | all | **med** |
| `/privacy` "Read the security policy →" link points to `/privacy` (wrong href) | /privacy | low-med |
| Decorative SVGs (CrookOutline) lack `aria-hidden` | landing, footer | low |
| Body/accent contrast, heading hierarchy | all | ✅ pass |

No critical failures. Two site-wide AA gaps (muted contrast, focus visibility) +
one broken link are worth a quick pass before a wider launch.

---

## Finding 1 — Muted text contrast ≈ 4.1:1 (fails AA normal) · **med · site-wide**

`--color-muted: #7A7168` on `--color-bg: #0B0A09`. **Verified by orchestrator with
the proper WCAG sRGB-linearized formula: ≈ 4.1:1.**
- **WCAG AA**: 4.5:1 for normal text, 3:1 for large (≥18pt / ≥14pt bold).
- So muted text **passes for large text, fails for normal/small text** — and `--color-muted` is used heavily for small captions, secondary lines, and disclaimers across the app (it's the same token I flagged as "dim" in the Wave 14 visual pass).

(The workers reported 5.5–7.1:1 using a non-WCAG luma formula; the `/under-the-hood` worker got it right at 4.13:1. The correct value is ~4.1:1.)

**Fix path (NOT applied)**: lighten `--color-muted` to ~`#8A8076`+ (≈4.6:1) for normal-size secondary text, or reserve `--color-muted` for large text and use `--color-text` for small secondary copy. One token change with site-wide benefit.

## Finding 2 — No focus indicators (WCAG 2.4.7) · **med · all pages**

`globals.css` contains **no `:focus`, `:focus-visible`, or `outline` rules**
(verified: grep returns empty). Keyboard users get no visible focus ring on links/
buttons (or only the browser default, which inline styles can suppress).

**Fix path (NOT applied)**: add a global `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` (or equivalent) in `globals.css`.

## Finding 3 — `/privacy` broken "security policy" link · low-med

`app/(marketing)/privacy/page.tsx:77-78`: both links point to `/privacy`:
```
<a href="/privacy">Read the privacy policy →</a>
<a href="/privacy">Read the security policy →</a>   ← should be /security (or the real security policy)
```
A visitor clicking "security policy" lands back on privacy. Not strictly a WCAG
violation, but a content/navigation bug surfaced by the audit.
**Fix path (NOT applied)**: point the second link at the real security policy URL.

## Finding 4 — Decorative SVGs without `aria-hidden` · low

`CrookOutline` SVG in the landing hero h1 and footer has no `aria-hidden="true"` /
alt — a screen reader may announce nothing useful or trip over it. (Emoji icons in
`WhyLocalCards` *are* correctly `aria-hidden`.)
**Fix path (NOT applied)**: add `aria-hidden="true"` to purely-decorative SVGs.

---

## Per-page summary (all PASS on contrast for body/accent + heading hierarchy)

- **Landing `/`** — minor-issues/low. Body `#F2EDE6`/bg ≈ 15:1 ✓, accent `#E8888A` ≈ 8:1 ✓. Headings h1→h2→h2→h3, no skips, single h1. Issues: decorative SVG aria (F4); muted token (F1); terminal demo could use `aria-live` (nice-to-have).
- **`/under-the-hood`** — minor-issues/low. Text ≈ 17:1 ✓, accent ≈ 7.8:1 ✓. Headings h1→h2(×4)→h3 valid. Issues: a link relies on color alone (no underline); focus indicators (F2); muted token (F1).
- **`/privacy`** — minor-issues/low. Text ✓, accent ✓, green compliance labels `#4CAF6A` ≈ 6.5:1 ✓. Headings h1→h2 valid. Issues: broken security-policy link (F3); muted token (F1).

---

## Methodology / herd run
- 3 `local-summarizer` (Ollama) workers, concurrent, local-first.
- Orchestrator (Opus) corrected the Tailwind premise, **recomputed the borderline contrast with the proper WCAG formula**, and verified the focus-style + broken-link findings against source.
- **No code changed. No fix executed. Findings only.**
