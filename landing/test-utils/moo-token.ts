/**
 * Resolve o valor FINAL de um custom property do `globals.css`, seguindo a
 * cadeia de `var(--moo-…)` até `design/tokens/moo-ui.css`.
 *
 * PORQUÊ ISTO EXISTE
 * ------------------
 * Até 2026-08-27 os testes de paridade assertavam o hex literal no ficheiro:
 *
 *     expect(GLOBALS).toMatch(/\.app-shell-dark\s*\{[\s\S]*?--bg:\s*#0B0A09/)
 *
 * Isso prova a FORMA, não o comportamento — e passou a falhar quando o
 * `globals.css` deixou de repetir o valor e passou a lê-lo do ficheiro gerado
 * (`--bg: var(--moo-tinta-bg)`), que é precisamente a melhoria que a verificação
 * "fonte única" do portão pede.
 *
 * Resolver a cadeia é mais forte, não mais fraco: continua a exigir `#0B0A09` no
 * ecrã, e passa a apanhar também o caso em que alguém aponta a um token que NÃO
 * EXISTE — o valor resolve para vazio e a cor desaparece. Aconteceu mesmo nesse
 * dia: os `--tier-*` apontavam a `--moo-tier-papel-t0`, que o gerador ainda não
 * emitia, e nada no CSS o denunciava.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MOO_UI = join(__dirname, '..', '..', 'design', 'tokens', 'moo-ui.css');

/** Lê as custom properties do bloco cuja chaveta abre depois de `ancora`. */
export function blocoDe(css: string, ancora: string): Record<string, string> {
  const re = new RegExp(ancora.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{');
  const m = re.exec(css);
  if (!m) return {};
  const abre = css.indexOf('{', m.index);
  const fecha = css.indexOf('\n}', abre);
  if (abre === -1 || fecha === -1) return {};
  const out: Record<string, string> = {};
  for (const d of css.slice(abre + 1, fecha).matchAll(/^\s*--([\w-]+)\s*:\s*([^;]+);/gm)) {
    out[d[1]] = d[2].trim();
  }
  return out;
}

/**
 * `--bg` dentro de `.app-shell-dark` → `#0B0A09`, seguindo `var(--moo-…)`.
 * Devolve `null` quando a cadeia não resolve — o que é um FALHANÇO a reportar,
 * nunca um valor por omissão.
 */
export function resolveToken(globals: string, ancora: string, nome: string): string | null {
  const bloco = blocoDe(globals, ancora);
  let v = bloco[nome];
  if (v === undefined) return null;
  const raiz = blocoDe(readFileSync(MOO_UI, 'utf8'), ':root');
  for (let i = 0; i < 6; i++) {
    const m = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v.trim());
    if (!m) break;
    const seguinte = raiz[m[1].slice(2)];
    if (seguinte === undefined) return null;   // aponta a um token que não existe
    v = seguinte;
  }
  return v.trim();
}
