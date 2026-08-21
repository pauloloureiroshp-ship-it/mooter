/**
 * ponte-adversarial.mjs — liga o `refutador` ao revisor que JA EXISTE.
 *
 * PORQUE E UMA PONTE E NAO UM REVISOR.
 *
 * `packages/validation/src/adversarial/` ja tem tudo: 5 lentes, o prompt que
 * manda REFUTAR ("You are an adversarial reviewer. Your job is to REFUTE the
 * following claim if at all possible"), o parser de veredicto e o caller de
 * Ollama. O inventario de 2026-08-20 ja prescrevia a ligacao, palavra por
 * palavra: "evidence-verifier chamar validation/adversarial". Copiar o prompt
 * para aqui seria escrever pela segunda vez o que ja esta escrito — e depois
 * mante-lo em dois sitios.
 *
 * O QUE CUSTA LIGAR, e porque nao e um import directo:
 * `tools/cockpit/` corre em node puro e importa ZERO `@mooter/*` (medido — e o
 * padrao sistemico que o inventario aponta). `packages/validation` e fonte
 * TypeScript sem build, sem `main` e sem `exports`. Um `import` de `.ts` a
 * partir de um `.mjs` sob node nao resolve. A ponte e portanto um processo
 * `tsx` — UM por lote, nunca um por achado, porque o arranque do tsx custa mais
 * do que a inferencia de um achado.
 *
 * DEGRADA EM VOZ ALTA: sem tsx, sem Ollama ou com o pacote ausente, devolve
 * `null` e diz porque. O `refutador` trata `null` como "sem revisor ligado" e
 * mantem o achado em `indeciso` — nunca em `sobrevive`. Um achado que ninguem
 * julgou nao pode virar um achado aprovado por causa de uma ponte partida.
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
/** `tools/cockpit/runner` -> raiz do repo. */
export const RAIZ_REPO = path.resolve(AQUI, '..', '..', '..');

export const PACOTE_REL = path.join('packages', 'validation', 'src', 'adversarial', 'reviewer.ts');

/** Existe mesmo o revisor que vamos reutilizar? */
export function pacoteDisponivel(raiz = RAIZ_REPO, existsImpl = fs.existsSync) {
  const p = path.join(raiz, PACOTE_REL);
  return { ok: existsImpl(p), caminho: p };
}

/**
 * O script que corre DENTRO do tsx.
 *
 * Le um lote em JSON no stdin, devolve um veredicto por alvo no stdout. Toda a
 * logica de revisao vem do pacote; isto so transporta.
 */
function scriptDaPonte(raiz, modelo, host) {
  // ⚠️ Tem de ser uma URL `file://`, nao um caminho. Um `import "C:/x/y.ts"` sob
  // ESM devolve `ERR_UNSUPPORTED_ESM_URL_SCHEME` porque o `C:` e lido como
  // esquema de protocolo. Medido a 2026-08-21, na segunda tentativa de ligar.
  const revisor = pathToFileURL(path.join(raiz, PACOTE_REL)).href;
  const bridge = pathToFileURL(path.join(raiz, 'packages', 'validation', 'src', 'adversarial', 'primitives-bridge.ts')).href;
  return `
import { makeOllamaCaller } from ${JSON.stringify(revisor)};
import { runAdversarialReview } from ${JSON.stringify(bridge)};
const chunks = [];
for await (const c of process.stdin) chunks.push(c);
const { alvos, lentes, threshold } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
const caller = makeOllamaCaller({ model: ${JSON.stringify(modelo)}, host: ${JSON.stringify(host)} });
const out = [];
try {
  const { verdicts } = await runAdversarialReview(alvos, caller, { lenses: lentes, threshold, concurrency: 2 });
  for (const tv of verdicts) {
    const porLente = tv.vote.reviewers.map((r) => r.lens + '=' + r.verdict).join(' ');
    out.push({
      id: tv.target.id,
      convergence: tv.vote.convergence,
      score: tv.vote.score,
      confirmMass: tv.vote.confirmMass,
      refuteMass: tv.vote.refuteMass,
      rationale: porLente.slice(0, 200),
    });
  }
} catch (e) {
  out.push({ id: '__erro__', erro: String((e && e.message) || e).slice(0, 200) });
}
process.stdout.write(JSON.stringify(out));
`;
}

/**
 * Corre um LOTE de alvos pelo revisor adversarial local.
 *
 * @returns {Promise<{ok: boolean, veredictos: Map|null, porque: string|null}>}
 */
export function revisarLote(alvos, {
  lentes = ['correctness', 'repro', 'completeness'],
  threshold = 0.5,
  raiz = RAIZ_REPO,
  modelo = process.env.MOO_JUIZ_MODELO || 'qwen2.5-coder:14b',
  host = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434',
  timeoutMs = 15 * 60 * 1000,
  spawnImpl = spawn,
} = {}) {
  const disp = pacoteDisponivel(raiz);
  if (!disp.ok) {
    return Promise.resolve({ ok: false, veredictos: null, porque: `revisor ausente em ${PACOTE_REL}` });
  }
  if (!alvos || alvos.length === 0) {
    return Promise.resolve({ ok: true, veredictos: new Map(), porque: null });
  }

  return new Promise((resolve) => {
    const tmp = path.join(os.tmpdir(), `moo-ponte-${process.pid}-${alvos.length}.mts`);
    let escrito = false;
    try {
      fs.writeFileSync(tmp, scriptDaPonte(raiz, modelo, host));
      escrito = true;
    } catch (err) {
      resolve({ ok: false, veredictos: null, porque: `nao consegui escrever a ponte: ${String(err && err.message).slice(0, 120)}` });
      return;
    }
    const limpar = () => { if (escrito) { try { fs.unlinkSync(tmp); } catch { /* n/d */ } } };

    let p;
    try {
      // ⚠️ Windows, dois defeitos encadeados, ambos medidos a 2026-08-21 ao
      // ligar esta ponte pela primeira vez:
      //   1. desde o Node 18.20/20.12 o `spawn` recusa `.cmd`/`.bat` sem
      //      `shell: true`, e devolve `EINVAL` — que nao diz nada da causa;
      //   2. com `shell: true`, passar args SOLTOS dispara DEP0190 (nao sao
      //      escapados, so concatenados). Por isso vai tudo numa string.
      // As aspas sao obrigatorias: a raiz deste repo tem um espaco
      // ("Paulo Loureiro") e sem elas o tsx recebe dois argumentos.
      const win = process.platform === 'win32';
      p = win
        ? spawnImpl(`npx tsx "${tmp}"`, { cwd: raiz, stdio: ['pipe', 'pipe', 'pipe'], shell: true })
        : spawnImpl('npx', ['tsx', tmp], { cwd: raiz, stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (err) {
      limpar();
      resolve({ ok: false, veredictos: null, porque: `tsx nao arrancou: ${String(err && err.message).slice(0, 120)}` });
      return;
    }

    let out = '';
    let erro = '';
    let fechado = false;
    const acabar = (r) => { if (!fechado) { fechado = true; limpar(); resolve(r); } };

    const morte = setTimeout(() => {
      try { p.kill(); } catch { /* n/d */ }
      acabar({ ok: false, veredictos: null, porque: `revisor excedeu ${Math.round(timeoutMs / 1000)}s` });
    }, timeoutMs);
    if (typeof morte.unref === 'function') morte.unref();

    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { erro += String(d).slice(0, 400); });
    p.on('error', (err) => {
      clearTimeout(morte);
      acabar({ ok: false, veredictos: null, porque: `tsx falhou: ${String(err && err.message).slice(0, 120)}` });
    });
    p.on('close', (code) => {
      clearTimeout(morte);
      if (code !== 0) {
        acabar({ ok: false, veredictos: null, porque: `revisor saiu com ${code}: ${erro.trim().slice(0, 160) || 'sem stderr'}` });
        return;
      }
      try {
        const arr = JSON.parse(out);
        const m = new Map();
        for (const v of arr) m.set(v.id, v);
        acabar({ ok: true, veredictos: m, porque: null });
      } catch {
        acabar({ ok: false, veredictos: null, porque: `resposta do revisor ilegivel: ${out.slice(0, 120)}` });
      }
    });

    p.stdin.on('error', () => { /* o `close` ja trata */ });
    p.stdin.end(JSON.stringify({ alvos, lentes, threshold }));
  });
}

/**
 * Um `reviewImpl` pronto a dar ao `refutador`, servido a partir de um lote ja
 * revisto. Assim o portao chama uma funcao simples por achado, e a GPU so
 * trabalha uma vez por lote.
 */
export function reviewImplDoLote(veredictos) {
  if (!veredictos) return null;
  return async (alvo) => {
    const v = veredictos.get(alvo.id);
    if (!v || v.erro) throw new Error(v ? v.erro : 'alvo ausente do lote');
    // A CONVERGENCIA da votacao, nao o voto de uma lente. `UNCERTAIN` viaja
    // como `uncertain` de proposito: o portao trata-o como indeciso, e um
    // indeciso nao passa para lane paga.
    const m = { CONFIRMED: 'confirm', REJECTED: 'refute', UNCERTAIN: 'uncertain' };
    return {
      verdict: m[v.convergence] || 'uncertain',
      confidence: Math.abs(v.score ?? 0),
      rationale: v.rationale,
    };
  };
}
