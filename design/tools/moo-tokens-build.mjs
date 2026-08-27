#!/usr/bin/env node
// moo-tokens-build — gera moo-ui.css e moo-tokens.ts a partir de moo-tokens.json.
// Determinista, zero dependências, $0. Nunca editar a saída à mão.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const T = JSON.parse(readFileSync(resolve(root, 'tokens/moo-tokens.json'), 'utf8'));
const kebab = (o, p = '') => Object.entries(o).flatMap(([k, v]) =>
  typeof v === 'object' && v !== null ? kebab(v, `${p}${k}-`) : [[`${p}${k}`, v]]);

const head = `/* GERADO por tools/moo-tokens-build.mjs a partir de tokens/moo-tokens.json.
   NÃO EDITAR À MÃO — a próxima geração apaga o que aqui escreveres.
   fonte: ${T.$meta.repo} · medido ${T.$meta.medido_em} · v${T.$meta.version} */\n`;

const vars = (obj, ind = '  ') => kebab(obj).map(([k, v]) => `${ind}--moo-${k}: ${v};`).join('\n');

/* As duas paletas são emitidas TAMBÉM com o tema no nome, e não só através do
   token activo. A razão é mecânica: um consumidor que queira a paleta `papel`
   sem depender do atributo `[data-moo-theme]` no DOM — como
   `landing/app/globals.css`, onde a shell clara é uma CLASSE (`.app-shell-root`)
   herdada de há muito — não tinha forma nenhuma de lhe chegar. Sem isto, ligar o
   landing aos tokens obrigava a mexer no DOM de todas as páginas autenticadas,
   ou a duplicar os valores — que é exactamente o que a verificação 1 proíbe.

   O token activo (`--moo-bg`) continua a existir e continua a ser o que se usa:
   estes são o endereço fixo de cada paleta, não uma segunda fonte. */
let css = head + `
:root {
${vars({ tinta: T.color.tinta }, '  ')}
${vars({ papel: T.color.papel }, '  ')}
${vars({ tier: { web: T.color.tier.web, papel: T.color.tier.papel, terminal: T.color.tier.terminal } }, '  ')}

  /* activos — tinta por omissão; o bloco [data-moo-theme="papel"] remapeia */
${vars(T.color.tinta)}
${vars({ tier: T.color.tier.web }, '  ')}
${vars({ term: T.color.term }, '  ')}
${vars({ marca: T.color.marca }, '  ')}
${vars({ space: T.space }, '  ')}
${vars({ radius: T.radius }, '  ')}
${vars({ shadow: T.shadow }, '  ')}
  --moo-font-sans: ${T.type.family.sans};
  --moo-font-mono: ${T.type.family.mono};
  --moo-font-hand: ${T.type.family.hand};
  --moo-ms-interact: ${T.motion.interact.ms}ms;
  --moo-ms-surface: ${T.motion.surface.ms}ms;
  --moo-ms-reveal: ${T.motion.reveal.ms}ms;
}

/* tema papel — mesmos nomes, valores do shell autenticado */
[data-moo-theme="papel"] {
${vars(T.color.papel)}
${vars({ tier: T.color.tier.papel }, '  ')}
}

/* escala tipográfica */
${Object.entries(T.type.scale).map(([k, s]) => {
  const fam = s.family === 'mono' ? 'var(--moo-font-mono)' : 'var(--moo-font-sans)';
  return `.moo-${k} { font: ${s.weight} ${s.size}/${s.lh} ${fam}; letter-spacing: ${s.ls};` +
    (s.case ? ` text-transform: ${s.case};` : '') +
    (s.tabular ? ' font-variant-numeric: tabular-nums;' : '') + ' }';
}).join('\n')}

/* ── LAYOUT · Papel Milimétrico (direcção fixada em ${T.$meta.direccao.decidida_em}) ── */
.moo-mm { position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(rgba(232,136,138,.05) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232,136,138,.05) 1px, transparent 1px),
    linear-gradient(rgba(232,136,138,.11) 1px, transparent 1px),
    linear-gradient(90deg, rgba(232,136,138,.11) 1px, transparent 1px);
  background-size: ${T.layout.grelha.base_px}px ${T.layout.grelha.base_px}px,
                   ${T.layout.grelha.base_px}px ${T.layout.grelha.base_px}px, 64px 64px, 64px 64px; }
.moo-folha { position: relative; padding: 0 ${T.layout.grelha.folha_padding_px}px; }
.moo-secao { display: grid; grid-template-columns: ${T.layout.grelha.margem_px}px 1fr;
  border-top: 1px solid var(--moo-line-strong); padding: 48px 0; }
.moo-marg { padding-right: 32px; text-align: right; font-family: var(--moo-font-mono);
  font-size: 10px; letter-spacing: .16em; text-transform: uppercase;
  color: var(--moo-faint); line-height: 1.9; }
.moo-marg b { display: block; color: var(--moo-text); font-weight: 500; }
.moo-cota { stroke: var(--moo-accent); stroke-width: 1.1; fill: none; }
.moo-cota-t { fill: var(--moo-accent); font-family: var(--moo-font-mono);
  font-size: 9px; letter-spacing: .1em; }
.moo-cartucho { display: flex; justify-content: space-between; align-items: baseline;
  font-family: var(--moo-font-mono); font-size: 10px; letter-spacing: .24em;
  color: var(--moo-faint); border-bottom: 1px solid var(--moo-line-strong); padding-bottom: 16px; }

/* ── MOVIMENTO · a família de quatro, e mais nenhuma ── */
.moo-ent { opacity: 0; animation: moo-ent 640ms cubic-bezier(.16,1,.3,1) forwards var(--d, 0ms); }
.moo-traco { stroke-dasharray: var(--L); stroke-dashoffset: var(--L);
  animation: moo-traco 1200ms cubic-bezier(.16,1,.3,1) forwards var(--d, 0ms); }
.moo-pulso { animation: moo-pulso 2200ms cubic-bezier(.45,0,.55,1) infinite; }
@keyframes moo-ent   { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
@keyframes moo-traco { to { stroke-dashoffset: 0; } }
@keyframes moo-pulso { 0%,100% { opacity: 1; } 50% { opacity: .35; } }

/* foco — anel rosa em tudo o que é interactivo, sem excepção */
:focus-visible { outline: 2px solid var(--moo-accent); outline-offset: 2px; border-radius: 2px; }

/* movimento */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { animation-duration: .01ms !important; animation-iteration-count: 1 !important;
                           transition-duration: .01ms !important; scroll-behavior: auto !important; }
}
`;

const ts = head.replace(/\/\*|\*\//g, m => m === '/*' ? '/*' : '*/') + `
export const MOO = ${JSON.stringify({
  color: T.color, type: T.type, space: T.space, radius: T.radius,
  shadow: T.shadow, motion: T.motion, numero: T.numero
}, null, 2)} as const;

export type MooTheme = 'tinta' | 'papel';
export type TierKey = 't0' | 't1' | 't2' | 't3';
export const TIER_WEB = MOO.color.tier.web;
export const TIER_TERMINAL = MOO.color.tier.terminal;
export const TIER_PAPEL = MOO.color.tier.papel;
`;

export const build = () => ({ css, ts });

/* `file://${process.argv[1]}` NUNCA coincide com `import.meta.url`: no Windows
   `argv[1]` é `C:\...` (barras invertidas, sem a terceira barra do file://), e em
   qualquer sistema é o caminho tal como foi escrito — `design/tools/…` quando o
   comando é relativo. Consequência medida a 2026-08-27: `node
   design/tools/moo-tokens-build.mjs` corria, imprimia NADA, saía 0 — e não
   escrevia ficheiro nenhum. O comando publicado no README e no masterprompt era
   um no-op silencioso, e só não se via porque o pacote já vinha com a saída
   gerada. `pathToFileURL` é a forma que normaliza os dois lados. */
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(resolve(root, 'tokens/moo-ui.css'), css);
  writeFileSync(resolve(root, 'tokens/moo-tokens.ts'), ts);
  console.log(`moo-ui.css    ${css.length} bytes\nmoo-tokens.ts ${ts.length} bytes`);
}
