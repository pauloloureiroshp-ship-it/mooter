// Wave 32 — minimal zero-dep box-drawing primitives for the transparency TUIs
// (workflow-watch, pastor-train-watch). Mirrors the proven heuristics in the
// dashboard command (displayWidth: emoji = 2 cols) so all Mooter TUIs align
// identically. Pure string functions — no I/O, no ANSI state.

/** Terminal display width: emoji/CJK count as 2 columns, everything else as 1. */
export function displayWidth(s: string): number {
  let w = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0) ?? 0;
    const wide =
      cp >= 0x1f000 ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x1100 && cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xff00 && cp <= 0xff60);
    w += wide ? 2 : 1;
  }
  return w;
}

export function padToWidth(s: string, target: number): string {
  return s + " ".repeat(Math.max(0, target - displayWidth(s)));
}

export function progressBar(pct: number, width: number): string {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  return `[${"█".repeat(filled)}${"░".repeat(width - filled)}]`;
}

export function boxTop(title: string, width: number): string {
  const inner = width - 2;
  const label = ` ${title} `;
  const dashes = Math.max(0, inner - 1 - displayWidth(label));
  return `┌─${label}${"─".repeat(dashes)}┐`;
}

export function boxRow(content: string, width: number): string {
  const inner = width - 2;
  let trimmed = content;
  while (displayWidth(trimmed) > inner) trimmed = trimmed.slice(0, -1);
  return `│${padToWidth(trimmed, inner)}│`;
}

export function boxSep(width: number): string {
  return `├${"─".repeat(width - 2)}┤`;
}

export function boxBottom(width: number): string {
  return `└${"─".repeat(width - 2)}┘`;
}
