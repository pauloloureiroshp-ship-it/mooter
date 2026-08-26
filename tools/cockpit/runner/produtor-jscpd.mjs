/**
 * produtor-jscpd.mjs — clones como apontamentos.
 *
 * Medido a 2026-08-26 contra `ab-audit-subjects/hono/src` (312 ficheiros,
 * 78 751 linhas), `jscpd@5.0.16`: **904 clones** em 273 ficheiros, 15,43% de
 * linhas duplicadas, 527 ms a frio e 312-325 ms nas corridas seguintes.
 *
 * ── AS DUAS ARMADILHAS QUE ESTE FICHEIRO EXISTE PARA APANHAR ────────────────
 *
 * 1. **O reporter `json` NÃO escreve para stdout.** Só existe `-o/--output <dir>`,
 *    e o ficheiro sai sempre como `<dir>/jscpd-report.json`. Um adaptador que
 *    lesse o stdout receberia vazio e reportaria zero clones num repositório com
 *    904 — o pior modo de falha possível: silencioso e a favor.
 *
 * 2. **`firstFile.name` vem relativo à raiz varrida e com barras INVERTIDAS**
 *    (`adapter\aws-lambda\handler.test.ts`). A flag `-a` dá absoluto, mas no
 *    formato *extended-length* do Windows (`\\?\C:\…`), que não serve para nada
 *    a jusante. Fica-se no relativo e junta-se a raiz aqui.
 *
 * ── A ÂNCORA É A PRIMEIRA OCORRÊNCIA, E ISSO É UMA DECISÃO ─────────────────
 * Um clone tem dois lados. Emitir os dois duplicaria a fila (904 → 1808) e cada
 * par pediria dois julgamentos para a mesma decisão. Emite-se UM apontamento por
 * clone, ancorado em `firstFile`, e o outro lado viaja dentro do `msg` — que é
 * onde o dono precisa dele para decidir, e não numa segunda linha da fila.
 *
 * O binário é nativo (`jscpd-windows-x64-msvc`, 3 743 136 B), portanto não se
 * lhe pode pôr instrumentação de Node por dentro. A medição de rede dele é a
 * sonda de sockets por PID do `rede-zero.mjs` — observação, e está dito como tal.
 * Referência do reconhecimento: 129 sondas ao PID durante uma corrida de
 * 31 197 ms sobre 3 853 ficheiros deram 0 ligações TCP e 0 endpoints UDP.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { posix, spawnVivo } from './produtores.mjs';

export const RELATORIO = 'jscpd-report.json';

/**
 * `duplicates[]` → `{file,line,rule,msg}`.
 *
 * `startLoc.line` é sempre ≥ 1 (confirmado na corrida de 2026-08-26), o que é
 * exactamente o que `apontamentoDoDetector` exige; ainda assim valida-se, porque
 * um apontamento rejeitado em silêncio é indistinguível de um que nunca existiu.
 */
export function traduzir(relatorio, { raizVarrida } = {}) {
  const dups = (relatorio && Array.isArray(relatorio.duplicates)) ? relatorio.duplicates : [];
  const brutos = [];
  for (const d of dups) {
    const a = d && d.firstFile;
    const b = d && d.secondFile;
    if (!a || !b) continue;
    const linha = Number(a.startLoc && a.startLoc.line);
    if (!Number.isInteger(linha) || linha < 1) continue;
    const outro = `${posix(b.name)}:${b.startLoc && b.startLoc.line}-${b.endLoc && b.endLoc.line}`;
    brutos.push({
      file: posix(raizVarrida ? path.join(raizVarrida, a.name) : a.name),
      line: linha,
      rule: `jscpd/duplicate:${d.format || 'desconhecido'}`,
      msg: `${d.lines} linhas (${d.tokens} tokens) duplicadas com ${outro}`,
    });
  }
  return brutos;
}

/**
 * @param {object} opts
 * @param {string} opts.bin       caminho para `node_modules/jscpd/run-jscpd.js`
 * @param {string} [opts.alvo]    subcaminho dentro da raiz a varrer
 * @param {string} [opts.saida]   pasta temporária para o relatório
 */
export function produtorJscpd({
  bin, alvo = '.', saida = null,
  spawnImpl = spawnVivo, readImpl = fs.readFileSync,
  mkdtempImpl = fs.mkdtempSync, node = process.execPath,
} = {}) {
  return {
    id: 'jscpd',
    origem: 'jscpd',
    async correr({ raiz, ambiente }) {
      if (!bin) throw new Error('jscpd sem --jscpd: o caminho para run-jscpd.js é obrigatório (não se instala nada durante a corrida)');
      const dirSaida = saida || mkdtempImpl(path.join(os.tmpdir(), 'f1-jscpd-'));
      const raizVarrida = posix(path.join(raiz, alvo));

      const args = [
        bin, raizVarrida,
        '--reporters', 'json,silent',
        '--output', dirSaida,
        '--no-colors',
      ];
      const t0 = Date.now();
      const r = await new Promise((resolve) => {
        let out = ''; let err = ''; let p;
        try { p = spawnImpl(node, args, { env: ambiente, windowsHide: true }); }
        catch (e) { resolve({ rc: -1, out: '', err: String(e && e.message) }); return; }
        p.stdout.on('data', (d) => { out += String(d); });
        p.stderr.on('data', (d) => { err += String(d); });
        p.on('error', (e) => resolve({ rc: -1, out, err: err + String(e && e.message) }));
        p.on('close', (rc) => resolve({ rc, out, err }));
      });
      const ms = Date.now() - t0;

      let relatorio;
      const alvoRelatorio = path.join(dirSaida, RELATORIO);
      try { relatorio = JSON.parse(String(readImpl(alvoRelatorio, 'utf8'))); }
      catch (e) {
        throw new Error(`jscpd não deixou ${RELATORIO} em ${dirSaida} (rc=${r.rc}): ${String(e && e.message)} · ${r.err.slice(0, 200)}`);
      }

      const st = relatorio.statistics && relatorio.statistics.total;
      return {
        brutos: traduzir(relatorio, { raizVarrida }),
        meta: {
          clones: st ? st.clones ?? null : null,
          linhas_duplicadas: st ? st.duplicatedLines ?? null : null,
          percentagem: st ? st.percentage ?? null : null,
          relatorio: posix(alvoRelatorio),
          ms_jscpd: ms,
        },
      };
    },
  };
}
