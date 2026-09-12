#!/usr/bin/env node
/**
 * ci-prs.mjs — o unico bloco do Ledger que dizia `n/d` por nunca ter perguntado.
 *
 * A decisao (registada no commit, como o kickoff pediu): ALIMENTAR, nao remover.
 * As duas hipoteses eram remover a seccao ou liga-la ao `gh`. Remover custava
 * menos linhas e custava mais em substancia: os PRs e o CI sao a unica parte do
 * trabalho deste projecto que existe FORA da maquina do dono, e um Ledger que
 * so conta o que a GPU local fez conta metade da historia. A ligacao sao 40
 * linhas com fallback honesto.
 *
 * REGRAS, e as tres saem do mesmo principio:
 *
 *  1. `gh` ausente, sem login, sem rede, timeout -> `n/d` COM O MOTIVO. Nunca
 *     zero. Zero PRs abertos e um facto; "nao consegui perguntar" e outro, e
 *     confundi-los seria pior do que a seccao vazia que isto substitui.
 *  2. TIMEOUT CURTO. O construtor do snapshot corre num launchd diario; nao
 *     pode ficar pendurado numa rede que nao responde.
 *  3. NADA DE CONTEUDO. So contagens, estados e numeros de PR — nenhum titulo,
 *     nenhum corpo, nenhum nome de utilizador. Este ficheiro acaba num HTML que
 *     se envia a terceiros.
 */

import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { resolverGh, redigirCasa } from './gh-bin.mjs';

export const TIMEOUT_MS = 8000;
/** Quantas corridas de CI olhar para tras. Uma janela, nao a historia toda. */
export const CORRIDAS = 20;

const nd = (porque) => ({ disponivel: false, porque: `n/d — ${porque}` });

/** O PATH cabe na mensagem, mas nao pode despejar-se nela. */
const PATH_NA_MENSAGEM = 80;

function gh(bin, args, { execImpl = execFileSync, timeout = TIMEOUT_MS } = {}) {
  const saida = String(execImpl(bin, args, {
    encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
  }));
  return saida.trim() ? JSON.parse(saida) : [];
}

/**
 * O estado do CI e dos PRs. Best-effort por desenho: uma seccao do Ledger nunca
 * pode derrubar a construcao do Ledger.
 */
export function ciEPrs({
  execImpl = execFileSync, timeout = TIMEOUT_MS, corridas = CORRIDAS,
  resolverImpl = resolverGh, ghBin = null,
} = {}) {
  /**
   * PROCURAR ANTES DE CORRER, e depois dizer a verdade sobre o que se procurou.
   *
   * Ate 2026-09-01 isto nao procurava nada: chamava `gh` e, num ENOENT,
   * afirmava «o `gh` nao esta instalado nesta maquina». Sob launchd — que da um
   * PATH de quatro directorios — a afirmacao era FALSA e o dono leu-a no
   * `/ledger` com o `gh` instalado a dois directorios de distancia. Um
   * diagnostico errado e pior do que nenhum: manda arranjar o que nao esta
   * partido e esconde o que esta.
   *
   * As duas saidas sao agora distintas E VERIFICAVEIS:
   *   · nao encontrado em lado nenhum  -> diz onde procurou e nao afirma
   *                                       instalacao nenhuma;
   *   · encontrado fora do PATH        -> USA-O, e publica `gh_fonte` para que
   *                                       o ambiente pobre fique visivel.
   */
  const achado = ghBin ? { caminho: ghBin, fonte: 'injectado' } : resolverImpl();
  if (!achado.caminho) {
    const p = String(achado.path_do_processo || '');
    const pTrunc = p.length > PATH_NA_MENSAGEM ? `${p.slice(0, PATH_NA_MENSAGEM)}…` : (p || 'vazio');
    return {
      ...nd(`nao encontrei o \`gh\` no PATH deste processo (PATH=${pTrunc}) nem em `
        + `${(achado.procurados || []).length} caminhos habituais — pode nao estar instalado, `
        + 'ou estar fora deles'),
      gh_fonte: null,
    };
  }

  let prs;
  try {
    prs = gh(achado.caminho, ['pr', 'list', '--state', 'open', '--json', 'number,isDraft,statusCheckRollup'],
      { execImpl, timeout });
  } catch (e) {
    // `redigirCasa` porque um `spawn /Users/<alguem>/.local/bin/gh ENOENT` poria
    // o nome do dono num HTML que se envia a terceiros — o que o cabecalho
    // deste ficheiro proibe em maiusculas.
    const msg = redigirCasa(String((e && e.message) || e));
    return {
      ...nd(/not found|ENOENT/i.test(msg)
        ? `encontrei o \`gh\` (via ${achado.fonte}) mas nao consegui corre-lo: ${msg.slice(0, 90)}`
        : /auth|login/i.test(msg) ? 'o `gh` nao tem sessao iniciada'
          : `o \`gh\` falhou: ${msg.slice(0, 90)}`),
      gh_fonte: achado.fonte,
    };
  }
  let runs = null;
  try {
    runs = gh(achado.caminho, ['run', 'list', '-L', String(corridas), '--json', 'conclusion,status'],
      { execImpl, timeout });
  } catch { /* os PRs sozinhos ja valem — o CI sai n/d dentro do bloco */ }

  const estadoDoPr = (p) => {
    const roll = p.statusCheckRollup;
    if (!Array.isArray(roll) || !roll.length) return 'sem-checks';
    const estados = roll.map((c) => String(c.conclusion || c.state || '').toUpperCase());
    if (estados.some((e) => e === 'FAILURE' || e === 'ERROR')) return 'vermelho';
    if (estados.some((e) => e === '' || e === 'PENDING' || e === 'IN_PROGRESS')) return 'a-correr';
    return 'verde';
  };
  const porEstado = { verde: 0, vermelho: 0, 'a-correr': 0, 'sem-checks': 0 };
  for (const p of prs) porEstado[estadoDoPr(p)] += 1;

  const terminadas = (runs || []).filter((r) => r.status === 'completed');
  return {
    disponivel: true,
    porque: null,
    // A FONTE, nunca o caminho: `/Users/<alguem>/.local/bin/gh` e o nome do
    // dono, e isto acaba num ficheiro que se partilha.
    gh_fonte: achado.fonte,
    prs_abertos: prs.length,
    rascunhos: prs.filter((p) => p.isDraft).length,
    prs_por_estado: porEstado,
    ci: terminadas.length
      ? {
        janela: terminadas.length,
        verdes: terminadas.filter((r) => r.conclusion === 'success').length,
        vermelhas: terminadas.filter((r) => r.conclusion === 'failure').length,
      }
      // `runs` a null e `runs` vazio nao sao a mesma coisa, e nenhum deles e
      // "0% de sucesso". Uma janela sem corridas terminadas nao mede nada.
      : { janela: 0, verdes: null, vermelhas: null, porque: runs == null ? 'n/d — nao consegui listar as corridas' : 'n/d — nenhuma corrida terminada na janela' },
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(ciEPrs(), null, 2)}\n`);
}
