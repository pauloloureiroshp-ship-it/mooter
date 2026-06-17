import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { MATRIX_MODELS, MATRIX_CATEGORIES } from './matrix-roster';

// Lockstep guard for R0 #1 (roster drift 14→17). The CANONICAL roster lives in
// the frozen router engine:
//   packages/router/src/specialization-matrix.ts → MATRIX_MODELS    (17)
//   packages/router/src/task-categories.ts       → TASK_CATEGORIES  (24)
// We can't IMPORT those modules here: Next's bundler can't pull them into the
// landing build graph, and tsc rejects their `.ts`-extension imports (TS5097).
// So we read the engine SOURCE as text and extract the array literals. This keeps
// packages/router the single source of truth — any engine roster change that the
// landing mirror (app/lib/matrix-roster.ts) does not follow turns CI red here —
// with zero bundler/tsc coupling to the engine.

const here = dirname(fileURLToPath(import.meta.url)); // landing/app/lib
const ENGINE = join(here, '..', '..', '..', 'packages', 'router', 'src');

/** Extract the quoted string literals from `export const <name> = [ ... ]`. */
function extractArray(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  if (!m) throw new Error(`could not locate "export const ${name} = [...]" in engine source`);
  return [...m[1].matchAll(/["']([^"']+)["']/g)].map((x) => x[1]);
}

const specSrc = readFileSync(join(ENGINE, 'specialization-matrix.ts'), 'utf8');
const catSrc = readFileSync(join(ENGINE, 'task-categories.ts'), 'utf8');

const ENGINE_MODELS = extractArray(specSrc, 'MATRIX_MODELS');
// TASK_CATEGORIES is composed of these sub-arrays, spread in this exact order.
const ENGINE_CATEGORIES = [
  ...extractArray(catSrc, 'CODING_CATEGORIES'),
  ...extractArray(catSrc, 'REASONING_CATEGORIES'),
  ...extractArray(catSrc, 'WRITING_CATEGORIES'),
  ...extractArray(catSrc, 'AGENTS_CATEGORIES'),
  ...extractArray(catSrc, 'CONTEXT_CATEGORIES'),
];

describe('matrix-roster lockstep with the router engine', () => {
  it('mirrors MATRIX_MODELS exactly (count + ids + order)', () => {
    // The literal R0 #1 acceptance: route roster count === engine roster count.
    expect(MATRIX_MODELS.length).toBe(ENGINE_MODELS.length);
    expect(MATRIX_MODELS.length).toBe(17);
    expect([...MATRIX_MODELS]).toEqual(ENGINE_MODELS);
  });

  it('mirrors TASK_CATEGORIES exactly (count + ids + order)', () => {
    expect(MATRIX_CATEGORIES.length).toBe(ENGINE_CATEGORIES.length);
    expect(MATRIX_CATEGORIES.length).toBe(24);
    expect([...MATRIX_CATEGORIES]).toEqual(ENGINE_CATEGORIES);
  });

  it('has no duplicate model or category ids', () => {
    expect(new Set(MATRIX_MODELS).size).toBe(MATRIX_MODELS.length);
    expect(new Set(MATRIX_CATEGORIES).size).toBe(MATRIX_CATEGORIES.length);
  });
});
