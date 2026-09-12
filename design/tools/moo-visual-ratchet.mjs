#!/usr/bin/env node
/**
 * moo-visual-ratchet — põe o auditor visual a impedir alguma coisa.
 *
 * O PROBLEMA QUE ISTO RESOLVE
 * ---------------------------
 * A 2026-08-29 o auditor visual ganhou tema por prancha e passou a medir os dois
 * temas. No mesmo dia ficou escrito, em voz alta, o que faltava:
 *
 *   «o auditor continua a não correr em CI sobre o canvas real. As mordidas
 *    correm; a medição das cinco folhas só corre quando alguém a corre à mão.
 *    Um instrumento honesto que ninguém invoca continua a não impedir nada.»
 *
 * É esta a peça. Sem ela, tudo o que foi feito nas ondas anteriores — o parser
 * de cores corrigido, a matriz de contraste derivada, os dois temas — mede bem e
 * não trava nada. Um portão que ninguém corre é indistinguível de um portão que
 * não existe, que é a mesma frase que este repo já escreveu sobre a marca, sobre
 * o movimento reduzido e sobre a lista do `test:design`.
 *
 * PORQUE É UM RATCHET E NÃO UM LIMIAR
 * -----------------------------------
 * Há hoje UM achado real por corrigir: `#D46A5A` a 4,11–4,50:1 nos painéis
 * escuros do cockpit. Chega ao ecrã por `--moo-tinta-bad`, e corrigi-lo é mexer
 * na paleta, que é canon e decisão do dono. Ligar «zero achados» ao CI hoje
 * deixava o `main` vermelho à espera de uma decisão que não é do CI — e um CI
 * cronicamente vermelho aprende-se a ignorar.
 *
 * Então não se exige zero. Exige-se a regra que este repo já usa em três sítios
 * (`wave-gate.mjs`, `docs-hygiene --ratchet`, `moo-design-ratchet`):
 *
 *     nenhuma medição pode PIORAR, e nenhuma prancha pode DESAPARECER.
 *
 * Zero continua a ser o alvo. A linha de base está em
 * `design/.visual-baseline.json`, é dados, e só se actualiza para baixo — a
 * descida é um commit deliberado, com o número antes e depois à vista.
 *
 *   node design/tools/moo-visual-ratchet.mjs             # relatório
 *   node design/tools/moo-visual-ratchet.mjs --ci        # sai 1 se piorou
 *   node design/tools/moo-visual-ratchet.mjs --promover  # baixa a base (só baixa)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const AQUI = dirname(fileURLToPath(import.meta.url));
const DESIGN = resolve(AQUI, '..');
/* Apontavel por ambiente pela mesma razao que o `MOO_TOKENS` do auditor: uma
   regra que nao se pode apontar a outro sitio nao se pode testar, e uma regra
   nao testada e indistinguivel de uma que nao morde. */
const BASE = process.env.MOO_VISUAL_BASE
  ? resolve(process.env.MOO_VISUAL_BASE)
  : join(DESIGN, '.visual-baseline.json');
const CANVAS = process.env.MOO_AUDIT_CANVAS || join(DESIGN, 'canvas.json');
const RELATORIO = process.env.MOO_AUDIT_OUT || join(DESIGN, '.visual-audit.json');

/* Métricas onde MENOS é melhor. `corte` só conta em pranchas de altura fixa —
   numa que rola por natureza não é defeito, e é o `canvas.json` que diz qual é
   qual. Fora daqui ficam de propósito: `caixas`, `barras` e `base8pc`, que são
   descritivos do desenho e não defeitos — pô-los aqui era transformar uma
   medição em regra sem ninguém ter decidido isso. */
const METRICAS = ['contraste', 'overflowX', 'easing', 'raio', 'corte'];

const medidas = (l) => ({
  contraste: l.contrasteNovo.length,
  overflowX: l.overflowX,
  easing: new Set(l.easBad).size,
  raio: new Set(l.raiBad).size,
  corte: l.scroll ? 0 : Math.max(0, l.corte),
});

const chave = (l) => `${l.prancha} · ${l.tema ?? 'n/d'}`;

/** Corre o auditor de verdade — o ratchet nunca inventa números próprios. */
function correrAuditor() {
  const AUDITOR = join(AQUI, 'moo-visual-audit.mjs');
  try {
    execFileSync(process.execPath, [AUDITOR, CANVAS],
      { encoding: 'utf8', stdio: ['ignore', 'inherit', 'inherit'] });
  } catch (e) {
    /* Exit 2 = recusou-se a inventar (canvas em falta, vocabulário inválido).
       Exit 3 = mediu, mas a declaração de tema não se sustenta.
       Nenhum dos dois é «piorou»: são falhas duras, e passam à frente do ratchet
       em vez de serem diluídas numa contagem. */
    console.error(`\n  moo-visual-ratchet: o auditor saiu com ${e.status} — não há números para comparar.\n`);
    process.exit(e.status || 1);
  }
  return JSON.parse(readFileSync(RELATORIO, 'utf8'));
}

const instantaneo = (rel) => Object.fromEntries(
  rel.map((l) => [chave(l), medidas(l)]).sort((a, b) => a[0].localeCompare(b[0])));

const rel = correrAuditor();
const agora = instantaneo(rel);

if (!existsSync(BASE)) {
  writeFileSync(BASE, JSON.stringify(agora, null, 2) + '\n');
  console.log(`\n  linha de base criada em design/.visual-baseline.json — ${Object.keys(agora).length} medições\n`);
  process.exit(0);
}

const base = JSON.parse(readFileSync(BASE, 'utf8'));

if (process.argv.includes('--promover')) {
  /* Só BAIXA. Uma «promoção» que subisse o número seria o mesmo que apagar o
     defeito do relatório — a régua a mexer-se para acomodar o trabalho, que é
     exactamente o que este repo recusou a 2026-08-27. */
  const nova = {};
  for (const k of new Set([...Object.keys(base), ...Object.keys(agora)])) {
    const a = agora[k], b = base[k];
    if (!a) continue;                              // prancha que saiu: ver abaixo
    nova[k] = b ? Object.fromEntries(METRICAS.map((m) => [m, Math.min(a[m], b[m])])) : a;
  }
  writeFileSync(BASE, JSON.stringify(nova, null, 2) + '\n');
  console.log('\n  base promovida (só desceu onde melhorou)\n');
  process.exit(0);
}

const piorou = [], melhorou = [], sumiram = [], novas = [];

for (const k of Object.keys(base)) if (!agora[k]) sumiram.push(k);
for (const k of Object.keys(agora)) {
  const a = agora[k], b = base[k];
  if (!b) {
    novas.push(k);
    /* Uma medição NOVA entra com base zero, não com o seu próprio valor. Senão,
       acrescentar uma prancha (ou um tema) com defeitos seria uma forma de os
       legalizar no momento em que nascem. */
    for (const m of METRICAS) if (a[m] > 0) piorou.push(`${k} · ${m}: nova, ${a[m]}`);
    continue;
  }
  for (const m of METRICAS) {
    if (a[m] > b[m]) piorou.push(`${k} · ${m}: ${b[m]} → ${a[m]}`);
    else if (a[m] < b[m]) melhorou.push(`${k} · ${m}: ${b[m]} → ${a[m]}`);
  }
}

const total = (o) => Object.values(o).reduce((s, m) => s + METRICAS.reduce((t, k) => t + m[k], 0), 0);

console.log(`\n  🐮 RATCHET DO AUDITOR VISUAL   base ${total(base)}  →  agora ${total(agora)}`
  + `   (${Object.keys(agora).length} medições em ${new Set(rel.map((l) => l.prancha)).size} superfícies)`);
console.log('  ' + '─'.repeat(66));

if (sumiram.length) {
  /* Uma prancha que desaparece não é uma melhoria: é o âmbito a estreitar. Foi
     assim que os `.svg` viveram invisíveis até 2026-08-27 e que o
     `moo-visual-audit.test.mjs` ficou fora do `test:design` até 2026-08-29. */
  for (const k of sumiram) console.log(`  ❌ ${k} — desapareceu da medição`);
}
for (const x of piorou) console.log(`  ❌ ${x}`);
for (const x of melhorou) console.log(`  ✅ ${x}`);
for (const k of novas) console.log(`  ·  ${k} — medição nova`);
if (!piorou.length && !sumiram.length && !melhorou.length) console.log('     sem alterações.');

if (melhorou.length && !piorou.length && !sumiram.length) {
  console.log('\n     melhorou — corre `npm run design:visual:promover` para travar o novo mínimo.');
}
console.log('');

if (process.argv.includes('--ci') && (piorou.length || sumiram.length)) process.exit(1);
