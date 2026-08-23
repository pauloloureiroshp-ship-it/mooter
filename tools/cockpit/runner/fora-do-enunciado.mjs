/**
 * fora-do-enunciado.mjs — achados que nao cumprem o criterio do PROPRIO pilar.
 *
 * Isto nao julga o codigo. Julga o achado contra a regra que o pilar escreveu no
 * seu enunciado, e verifica-a **contra o ficheiro no sha em que o achado nasceu**
 * — nao contra o texto que o modelo devolveu. A diferenca nao e academica: a
 * primeira versao desta regra lia o resumo do modelo e dizia 29 falhas no P3; ir
 * ao ficheiro deu 15. As outras 14 eram comentarios legitimos que o modelo citou
 * sem o marcador, ou com a barra escapada. Um verificador que le a resposta em
 * vez da fonte esta a acreditar em quem devia estar a auditar.
 *
 * REGRAS (uma por pilar, e so para pilares cujo enunciado da um criterio literal):
 *
 *   P2 — "copy the lines that give a variable the initial value `0`, `''` or `[]`".
 *        A linha citada tem de conter um desses tres. `durationMs,`,
 *        `agents_done?: number;` e `const now = opts.now ?? x` nao contem nenhum.
 *
 *   P3 — "copy ONE comment ... Comment lines start with // or with *".
 *        A linha citada tem de ser comentario NO FICHEIRO. Segue-se o estado de
 *        bloco `/* *\/` desde o topo, senao uma continuacao sem `*` era acusada
 *        de ser codigo.
 *
 *   P11 — "copy ONE line that puts a NUMBER inside a message a person will read:
 *        text between quotes with a digit in it". A linha citada tem de ter uma
 *        string COM digito.
 *
 *        Medido a 2026-08-23: 76 dos 87 achados do P11 falham isto — 87%. E o
 *        pilar foi desenhado nesta mesma sessao, por quem escreve isto, e
 *        descrito como "desenhado a partir do que se provou funcionar". Citava
 *        `text: 'vivacidade n/d — '` (string sem digito), `erro: 'nao consegui
 *        ler ' + alvo` (idem) e ate `raiz: v.root,` — que nem mensagem e.
 *
 *        Passou o ensaio do defeito semeado. E a licao da sensibilidade-vs-
 *        precisao aplicada ao proprio autor: detectar o defeito plantado nao diz
 *        nada sobre o que se produz em campo.
 *
 * Um pilar sem regra aqui e simplesmente ignorado — nao se inventa criterio.
 *
 * Uso:
 *   node tools/cockpit/runner/fora-do-enunciado.mjs            # ensaio
 *   node tools/cockpit/runner/fora-do-enunciado.mjs --aplicar
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

import { ehAchado, chaveDoRecibo, lerTriagem, registarTriagem } from './triagem.mjs';

export const MOTIVO = 'nao-e-um-problema';

/** Marca cada linha do ficheiro como comentario, seguindo blocos multi-linha. */
export function mapaComentarios(linhas) {
  const out = []; let dentro = false;
  for (const l of linhas) {
    const tr = String(l).trim();
    if (dentro) { out.push(true); if (tr.includes('*/')) dentro = false; continue; }
    if (/^(\/\/|\*)/.test(tr)) { out.push(true); continue; }
    if (/^\/\*/.test(tr)) { out.push(true); if (!tr.includes('*/')) dentro = true; continue; }
    out.push(false);
  }
  return out;
}

/** A linha contem uma semente `0`, `''`, `""` ou `[]`? */
export function temSemente(linha) {
  return /(^|[^\w])(0|''|""|\[\]|``)([^\w]|$)/.test(String(linha));
}

/**
 * A linha poe um NUMERO dentro de uma mensagem que uma pessoa vai ler?
 *
 * O enunciado do P11 e explicito: "copy ONE line that puts a NUMBER inside a
 * message a person will read: text between quotes with a digit in it". Uma linha
 * citada sem string, ou com string sem digito, nao cumpre o proprio criterio —
 * e medido a 2026-08-23 havia muitas: `text: 'vivacidade n/d — ' + ...`,
 * `erro: 'nao consegui ler ' + alvo`, e ate `raiz: v.root,` que nem mensagem e.
 */
export function temNumeroEmMensagem(linha) {
  return /(['"`])[^'"`\n]*\d[^'"`\n]*\1/.test(String(linha));
}

/** Qual a linha que o resumo cita, por pilar. `null` quando nao se consegue ler. */
export function linhaCitada(pilar, resumo) {
  const re = pilar === 'P3' ? /COMMENT LINE (\d+)/
    : pilar === 'P11' ? /MESSAGE LINE (\d+)/
      : /LINE (\d+)/;
  const m = String(resumo || '').match(re);
  return m ? Number(m[1]) : null;
}

/**
 * Cumpre o criterio do proprio pilar?
 *
 * Devolve `null` — e NAO `false` — quando nao se consegue decidir (ficheiro
 * ausente, linha fora do ficheiro, pilar sem regra). Um indecidivel tratado como
 * falha seria descartar por nao se ter conseguido olhar.
 */
export function cumpre(pilar, resumo, linhas) {
  const n = linhaCitada(pilar, resumo);
  if (!n || !Array.isArray(linhas) || linhas.length < n) return null;
  if (pilar === 'P3') return Boolean(mapaComentarios(linhas)[n - 1]);
  if (pilar === 'P2') return temSemente(linhas[n - 1]);
  if (pilar === 'P11') return temNumeroEmMensagem(linhas[n - 1]);
  return null;
}

const lerFicheiroNoSha = (() => {
  const cache = new Map();
  return (sha, ficheiro, { showImpl } = {}) => {
    const k = `${sha}:${ficheiro}`;
    if (!cache.has(k)) {
      try {
        const bruto = showImpl
          ? showImpl(k)
          : execFileSync('git', ['show', k], { encoding: 'utf8', maxBuffer: 2e7 });
        cache.set(k, String(bruto).split('\n'));
      } catch { cache.set(k, null); }
    }
    return cache.get(k);
  };
})();

export function planear(registos, { decisoes = new Map(), showImpl } = {}) {
  const fora = []; const dentro = []; const indecidivel = [];
  const vistos = new Set();
  for (const r of registos) {
    if (!ehAchado(r)) continue;
    const chave = chaveDoRecibo(r);
    if (!chave || vistos.has(chave) || decisoes.has(chave)) continue;
    vistos.add(chave);
    const linhas = lerFicheiroNoSha(r.repo_sha, r.ficheiro, { showImpl });
    const v = cumpre(r.pilar, r.resultado_resumo, linhas);
    const onde = { chave, pilar: r.pilar, ficheiro: r.ficheiro ?? null };
    if (v === null) indecidivel.push(onde);
    else if (v) dentro.push(onde);
    else fora.push(onde);
  }
  return { fora, dentro, indecidivel };
}

const porPilar = (xs) => xs.reduce((a, x) => ({ ...a, [x.pilar]: (a[x.pilar] || 0) + 1 }), {});

function principal() {
  const aplicar = process.argv.includes('--aplicar');
  const base = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
  const triagemFile = path.join(base, 'triagem.jsonl');
  let registos = [];
  try {
    registos = fs.readFileSync(path.join(base, 'runner-ledger.jsonl'), 'utf8')
      .split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { console.log('sem ledger legivel — n/d'); process.exitCode = 1; return; }

  const decisoes = lerTriagem(triagemFile).decisoes ?? new Map();
  const { fora, dentro, indecidivel } = planear(registos, { decisoes });

  console.log(`  fora do enunciado ${String(fora.length).padStart(4)}   ${JSON.stringify(porPilar(fora))}`);
  console.log(`  cumprem           ${String(dentro.length).padStart(4)}   ${JSON.stringify(porPilar(dentro))}  <- ficam para juizo humano`);
  console.log(`  indecidiveis      ${String(indecidivel.length).padStart(4)}   ${JSON.stringify(porPilar(indecidivel))}  (nao se descarta o que nao se conseguiu ler)`);

  if (!aplicar) { console.log('\nENSAIO — nada escrito. Para aplicar: --aplicar'); return; }

  const ts = registos[registos.length - 1]?.ts || null;
  for (const f of fora) {
    registarTriagem(triagemFile, {
      chave: f.chave,
      decisao: 'descartado',
      motivo: MOTIVO,
      por: 'claude',
      nota: `${f.pilar}: a linha citada nao cumpre o criterio do proprio enunciado, verificado contra ${f.ficheiro} no sha do achado`,
      ...(ts ? { ts } : {}),
    });
  }
  console.log(`\n${fora.length} decisoes escritas em ${triagemFile} (append-only, por=claude)`);
}

if (process.argv[1] && process.argv[1].endsWith('fora-do-enunciado.mjs')) principal();
