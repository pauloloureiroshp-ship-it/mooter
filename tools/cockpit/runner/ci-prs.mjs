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

export const TIMEOUT_MS = 8000;
/** Quantas corridas de CI olhar para tras. Uma janela, nao a historia toda. */
export const CORRIDAS = 20;

const nd = (porque) => ({ disponivel: false, porque: `n/d — ${porque}` });

function gh(args, { execImpl = execFileSync, timeout = TIMEOUT_MS } = {}) {
  const saida = String(execImpl('gh', args, {
    encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 4 * 1024 * 1024,
  }));
  return saida.trim() ? JSON.parse(saida) : [];
}

/**
 * O estado do CI e dos PRs. Best-effort por desenho: uma seccao do Ledger nunca
 * pode derrubar a construcao do Ledger.
 */
export function ciEPrs({ execImpl = execFileSync, timeout = TIMEOUT_MS, corridas = CORRIDAS } = {}) {
  let prs;
  try {
    prs = gh(['pr', 'list', '--state', 'open', '--json', 'number,isDraft,statusCheckRollup'],
      { execImpl, timeout });
  } catch (e) {
    const msg = String((e && e.message) || e);
    return nd(/not found|ENOENT/i.test(msg) ? 'o `gh` nao esta instalado nesta maquina'
      : /auth|login/i.test(msg) ? 'o `gh` nao tem sessao iniciada'
        : `o \`gh\` falhou: ${msg.slice(0, 90)}`);
  }
  let runs = null;
  try {
    runs = gh(['run', 'list', '-L', String(corridas), '--json', 'conclusion,status'],
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
