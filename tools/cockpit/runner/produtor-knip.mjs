/**
 * produtor-knip.mjs — código morto como apontamentos.
 *
 * Medido a 2026-08-26 contra `ab-audit-subjects/hono`, `knip@6.32.3`: o relatório
 * `--reporter json` traz `{ issues: [ { file, <tipo>: [ … ], … } ] }` — 102
 * entradas de ficheiro, 19 com alguma coisa lá dentro.
 *
 * ── A DECISÃO QUE ESTE FICHEIRO TOMA, E QUE NÃO É ÓBVIA ─────────────────────
 * `apontamentoDoDetector` exige `line` **inteiro ≥ 1**. Medido no mesmo
 * relatório, os tipos do knip dividem-se em dois grupos:
 *
 *     COM linha : exports 24 · types 22 · devDependencies 16
 *     SEM linha : files 83 · binaries 12
 *
 * Um ficheiro inteiro não usado (`files`) e um binário não listado (`binaries`)
 * não têm posição — são afirmações sobre o ficheiro, não sobre uma linha. A
 * tentação é carimbá-los com `line: 1`. **Não se faz**, e a razão é a mesma que
 * governa o resto deste motor: `line` entra no hash de identidade, e uma linha
 * inventada é uma posição afirmada que ninguém mediu. Um apontamento que aponta
 * para o sítio errado gasta o julgamento do dono duas vezes — uma a ler, outra a
 * perceber que a linha não queria dizer nada.
 *
 * Os sem-linha são CONTADOS, por tipo, no `meta.sem_linha` — que vai para o
 * manifesto e daí para o `/fleet.json`. Um zero afirmado com denominador é
 * medição; um zero por ninguém ter olhado não é.
 *
 * O knip é Node puro (usa `oxc-parser`/`oxc-resolver`, sem peer-dep de
 * `typescript`), portanto o processo filho tem PID visível ao Windows e a sonda
 * de sockets do `rede-zero.mjs` aplica-se-lhe.
 */

import { posix, spawnVivo } from './produtores.mjs';

/** Tipos que o knip emite e que trazem posição. Derivada da medição, não da doc. */
export const TIPOS_COM_LINHA = Object.freeze(['exports', 'types', 'dependencies', 'devDependencies', 'duplicates', 'enumMembers', 'namespaceMembers', 'unlisted', 'unresolved', 'optionalPeerDependencies', 'catalog', 'catalogReferences']);

const FRASE = {
  exports: (n) => `export '${n}' sem qualquer utilizador no projecto`,
  types: (n) => `tipo '${n}' exportado e sem qualquer utilizador`,
  dependencies: (n) => `dependência '${n}' declarada e não usada`,
  devDependencies: (n) => `devDependency '${n}' declarada e não usada`,
  duplicates: (n) => `'${n}' exportado mais do que uma vez`,
  enumMembers: (n) => `membro de enum '${n}' sem utilizador`,
  namespaceMembers: (n) => `membro de namespace '${n}' sem utilizador`,
  unlisted: (n) => `'${n}' é usado e não está declarado no package.json`,
  unresolved: (n) => `'${n}' é importado e não resolve`,
};

/**
 * `{issues:[{file, <tipo>:[{name,line}]}]}` → `{file,line,rule,msg}`.
 * Devolve também a contagem do que ficou de fora, por tipo — ver o cabeçalho.
 */
export function traduzir(relatorio) {
  const issues = (relatorio && Array.isArray(relatorio.issues)) ? relatorio.issues : [];
  const brutos = [];
  const semLinha = {};
  for (const it of issues) {
    if (!it || typeof it.file !== 'string' || !it.file.trim()) continue;
    for (const [tipo, lista] of Object.entries(it)) {
      if (tipo === 'file' || !Array.isArray(lista)) continue;
      for (const e of lista) {
        const nome = e && e.name ? String(e.name) : null;
        if (!nome) continue;
        const linha = Number(e.line);
        if (!Number.isInteger(linha) || linha < 1) { semLinha[tipo] = (semLinha[tipo] || 0) + 1; continue; }
        const frase = FRASE[tipo] || ((n) => `${tipo}: '${n}'`);
        brutos.push({
          file: posix(it.file),
          line: linha,
          rule: `knip/${tipo}`,
          msg: frase(nome),
        });
      }
    }
  }
  return { brutos, semLinha };
}

/**
 * @param {object} opts
 * @param {string} opts.bin        caminho para `node_modules/knip/bin/knip.js`
 * @param {string} [opts.config]   ficheiro de configuração do knip
 */
export function produtorKnip({
  bin, config = null, spawnImpl = spawnVivo, node = process.execPath,
} = {}) {
  return {
    id: 'knip',
    origem: 'knip',
    async correr({ raiz, ambiente }) {
      if (!bin) throw new Error('knip sem --knip: o caminho para bin/knip.js é obrigatório (não se instala nada durante a corrida)');

      const args = [
        bin,
        // Sem `-D`: MEDIDO a 2026-08-26, em `knip@6.32.3` o `-D` é `--directory`
        // e a corrida morre com «Option '-D' argument is ambiguous». O relatório
        // por omissão já traz todos os tipos de issue.
        '--reporter', 'json',
        '--no-progress',
        '--no-exit-code',     // um relatório com achados não é uma falha do processo
      ];
      if (config) args.push('-c', config);

      const t0 = Date.now();
      const r = await new Promise((resolve) => {
        let out = ''; let err = ''; let p;
        try { p = spawnImpl(node, args, { cwd: raiz, env: ambiente, windowsHide: true }); }
        catch (e) { resolve({ rc: -1, out: '', err: String(e && e.message) }); return; }
        p.stdout.on('data', (d) => { out += String(d); });
        p.stderr.on('data', (d) => { err += String(d); });
        p.on('error', (e) => resolve({ rc: -1, out, err: err + String(e && e.message) }));
        p.on('close', (rc) => resolve({ rc, out, err }));
      });
      const ms = Date.now() - t0;

      let relatorio;
      try { relatorio = JSON.parse(r.out); }
      catch { throw new Error(`knip não devolveu JSON (rc=${r.rc}): ${r.err.slice(0, 300) || r.out.slice(0, 300)}`); }

      const { brutos, semLinha } = traduzir(relatorio);
      return {
        brutos,
        meta: {
          ficheiros_com_issue: Array.isArray(relatorio.issues) ? relatorio.issues.length : null,
          // O que o knip disse e que NÃO virou apontamento, por tipo. É a
          // diferença entre "o knip não achou nada" e "o esquema não aceita".
          sem_linha: semLinha,
          ms_knip: ms,
        },
      };
    },
  };
}
