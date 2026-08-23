/**
 * refutado-pela-fonte.mjs — achados que a PROPRIA fonte desmente.
 *
 * Irmao do `fora-do-enunciado.mjs`, e a distincao importa: aquele pergunta "o
 * achado cumpre a regra que o pilar escreveu?"; este pergunta "olhando para o
 * codigo, a afirmacao e falsa?". Sao dois filtros, e nenhum deles julga se o
 * codigo tem defeito — isso fica para quem sabe o que o codigo devia fazer.
 *
 * DUAS REGRAS, e so duas, porque so estas duas se provam:
 *
 *   P2 — semente `[]` ou `''` (sem `0` na linha).
 *        Uma coleccao vazia e AUTO-DESCRITIVA: vazio quer dizer "nada", e ler
 *        `[]` como "nao medido" nao e possivel. Ja o `0` e ambiguo — pode ser
 *        zero medido ou zero por omissao —, e e exactamente ai que mora a
 *        doutrina deste repo. Por isso o `0` NAO entra aqui: fica para juizo.
 *
 *   P3 — o achado diz `THEY DIVERGE: comment says X, code does Y`, e o X esta
 *        literalmente na linha de codigo citada. Se la esta, nao divergem.
 *
 * O QUE FICOU DE FORA, e porque:
 *
 *   · "a variavel e reatribuida entre o inicio e a saida, logo a semente nao
 *     chega" — TESTEI E NAO SE SUSTENTA. Em `burn-rate-status.js` o `usd += ...`
 *     esta dentro de um ciclo: com lista vazia a semente chega mesmo. Uma
 *     reatribuicao condicional nao refuta nada. Regra deitada fora.
 *
 *   · "o comentario esta a 17 linhas do codigo, logo o par e arbitrario" —
 *     mediana real de 17, p75 de 30. E sinal, mas nao e prova: um bloco JSDoc
 *     descreve legitimamente codigo 20 linhas abaixo. Escolher um limiar seria
 *     inventar o criterio, que e o defeito que este projecto passou o dia a
 *     corrigir.
 *
 * Uso: node tools/cockpit/runner/refutado-pela-fonte.mjs [--aplicar]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ehAchado, chaveDoRecibo, lerTriagem, registarTriagem } from './triagem.mjs';

export const MOTIVO = 'nao-e-um-problema';

/** A linha tem `[]` ou `''`/`""` e NAO tem um `0` solto. */
export function coleccaoVazia(linha) {
  const l = String(linha);
  const vazio = /(\[\]|''|"")/.test(l);
  const zero = /(^|[^\w.])0([^\w]|$)/.test(l);
  return vazio && !zero;
}

/** O valor que o comentario afirma esta na linha de codigo citada? */
export function valorPresente(resumo, linhaCodigo) {
  const m = String(resumo || '').match(/THEY DIVERGE:\s*comment says\s+([^,\n]{1,40}?),/i);
  if (!m) return null;
  const x = m[1].trim().replace(/^[`'"]+|[`'"]+$/g, '');
  if (!x) return null;
  return String(linhaCodigo || '').includes(x);
}

/**
 * O achado desmente-se a si proprio: alega divergencia entre dois valores IGUAIS.
 *
 * Medido a 2026-08-23 no P11: 9 dos 78 diziam coisas como
 * `message says 0, code uses 0` · `says 4, uses 4` · `says v0.2, uses v0.2`.
 * Nao e preciso ler codigo nenhum para saber que estao errados — a propria
 * afirmacao contem a refutacao. Vale para P3 (`code does`) e P11 (`code uses`).
 */
export function autoRefutado(resumo) {
  const m = String(resumo || '').match(/says\s+(.+?),\s*code\s+(?:uses|does)\s+(.+?)(?:\s+PROOF|$)/i);
  if (!m) return null;
  const limpar = (x) => String(x).trim().replace(/^[`'"<]+|[`'">]+$/g, '').trim();
  const a = limpar(m[1]); const b = limpar(m[2]);
  if (!a || !b) return null;
  return a === b;
}

const numero = (resumo, re) => {
  const m = String(resumo || '').match(re);
  return m ? Number(m[1]) : null;
};

/** Refutado? `true` = a fonte desmente. `null` = nao se consegue decidir. */
export function refutado(pilar, resumo, linhas) {
  // Antes de tudo, e sem precisar do ficheiro: a alegacao contradiz-se?
  if (autoRefutado(resumo) === true) return true;
  if (!Array.isArray(linhas)) return null;
  if (pilar === 'P2') {
    const n = numero(resumo, /LINE (\d+)/);
    if (!n || linhas.length < n) return null;
    return coleccaoVazia(linhas[n - 1]);
  }
  if (pilar === 'P3') {
    const n = numero(resumo, /CODE LINE (\d+)/);
    if (!n || linhas.length < n) return null;
    return valorPresente(resumo, linhas[n - 1]);
  }
  return null;
}

const leitor = (() => {
  const cache = new Map();
  return (sha, ficheiro, showImpl) => {
    const k = `${sha}:${ficheiro}`;
    if (!cache.has(k)) {
      try {
        const b = showImpl ? showImpl(k) : execFileSync('git', ['show', k], { encoding: 'utf8', maxBuffer: 2e7 });
        cache.set(k, String(b).split('\n'));
      } catch { cache.set(k, null); }
    }
    return cache.get(k);
  };
})();

export function planear(registos, { decisoes = new Map(), showImpl } = {}) {
  const fora = []; const ficam = [];
  const vistos = new Set();
  for (const r of registos) {
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave) || decisoes.has(chave)) continue;
    vistos.add(chave);
    const v = refutado(r.pilar, r.resultado_resumo, leitor(r.repo_sha, r.ficheiro, showImpl));
    (v === true ? fora : ficam).push({ chave, pilar: r.pilar, ficheiro: r.ficheiro ?? null });
  }
  return { fora, ficam };
}

const porPilar = (xs) => xs.reduce((a, x) => ({ ...a, [x.pilar]: (a[x.pilar] || 0) + 1 }), {});

function principal() {
  const aplicar = process.argv.includes('--aplicar');
  const base = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  const triagemFile = path.join(base, 'triagem.jsonl');
  let registos = [];
  try {
    registos = fs.readFileSync(path.join(base, 'runner-ledger.jsonl'), 'utf8').split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { console.log('sem ledger legivel — n/d'); process.exitCode = 1; return; }

  const decisoes = lerTriagem(triagemFile).decisoes ?? new Map();
  const { fora, ficam } = planear(registos, { decisoes });
  console.log(`  refutados pela fonte ${String(fora.length).padStart(4)}   ${JSON.stringify(porPilar(fora))}`);
  console.log(`  ficam                ${String(ficam.length).padStart(4)}   ${JSON.stringify(porPilar(ficam))}  <- juizo humano`);

  if (!aplicar) { console.log('\nENSAIO — nada escrito. Para aplicar: --aplicar'); return; }
  const ts = registos[registos.length - 1]?.ts || null;
  for (const f of fora) {
    registarTriagem(triagemFile, {
      chave: f.chave,
      decisao: 'descartado',
      motivo: MOTIVO,
      por: 'claude',
      nota: `${f.pilar}: a fonte desmente a afirmacao (verificado em ${f.ficheiro} no sha do achado)`,
      ...(ts ? { ts } : {}),
    });
  }
  console.log(`\n${fora.length} decisoes escritas em ${triagemFile} (append-only, por=claude)`);
}

if (process.argv[1] && process.argv[1].endsWith('refutado-pela-fonte.mjs')) principal();
