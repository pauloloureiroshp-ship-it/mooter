'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack.
 *
 * O `if` que o masterprompt v1.1 manda escrever. MODO CONSTRUCAO corre sempre;
 * MODO VIVO (primeiro dispatch real, primeiro pendente real) so quando a frente
 * kimi-egress fechar e alguem o escrever no SYNC.md.
 *
 * Porque uma LINHA num ficheiro e nao uma env var: a env var vive na cabeca de
 * quem arranca o daemon e nao deixa rasto. A linha no SYNC.md e a mesma coisa
 * que a outra frente ja tem de actualizar quando fecha — o destrave passa a ser
 * um efeito de fechar a frente, nao um segundo gesto que alguem pode esquecer.
 *
 * Fail-closed em todos os ramos: ficheiro que nao existe, que nao se le, ou que
 * nao tem a frase EXACTA => trancado. Uma frase parecida nao conta: isto e um
 * contrato entre duas frentes, nao uma pista para adivinhar.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PORQUE A COMPARACAO E POR LINHA INTEIRA, MAS TOLERA O FORMATO
 *
 * Exigir a linha byte-a-byte tinha um footgun com data marcada: num SYNC.md a
 * frase nasce quase sempre como bullet (`- kimi-egress FECHADA — ...`), e o
 * travessao `—` escreve-se com frequencia como `-`. No dia do destrave o gate
 * continuaria trancado, e a pessoa sob pressao ia "arranjar" ESTE ficheiro em
 * vez do texto — isto e, desligar a guarda para passar.
 *
 * Por isso normaliza-se o ACIDENTE (marcador de lista/citacao, negrito, crases,
 * tipo de travessao, NBSP, espacos repetidos, capitalizacao) e mantem-se o
 * ESSENCIAL: a frase tem de ser a linha INTEIRA. Uma frase dentro de prosa
 * («quando a kimi-egress FECHADA — slack-spike destravado, entao...») continua a
 * NAO destravar, porque a linha nao e so a frase. A tolerancia so anda na
 * direccao segura: nunca transforma prosa em autorizacao.
 * ─────────────────────────────────────────────────────────────────────────
 */

const fs = require('fs');

const LINHA_DESTRAVE = 'kimi-egress FECHADA — slack-spike destravado';

/**
 * A SEGUNDA linha, e porque nao pode ser a primeira.
 *
 * A de cima destrava o MODO VIVO do spike. Ela ESTA no SYNC.md desde 2026-08-17,
 * e nao quer dizer o que o nome sugere: medido a 2026-08-25, ela e o destrave do
 * spike, nao a correccao do ALTO. O proprio commit que a repos no sitio
 * (`94a0d3e8`) escreve-o: «um GO CONDICIONADO cuja condicao dura (exclusao do
 * kimi por construcao) ainda esta em vigor NAO e historia, e estado».
 *
 * O ALTO e outro: a recusa por `agent:"kimi"` deixa um plano no disco que o
 * recibo nao declara. Procurado em `main` a 2026-08-25 — o veto de egress NAO
 * la esta. Ou seja: reutilizar a linha de cima para readmitir o kimi seria
 * chamar condicional a uma aceitacao incondicional, porque a condicao ja estava
 * cumprida antes de alguem a escolher como condicao.
 *
 * Por isso o kimi tem linha PROPRIA, que hoje nao existe em lado nenhum. O
 * mecanismo e o mesmo — uma frase no SYNC.md, fail-closed, escrita por quem
 * fecha a frente — e vale pelo mesmo motivo: deixa rasto, e um `git blame`
 * mostra quem a escreveu e quando.
 */
const LINHA_KIMI = 'kimi-egress VETO EM MAIN — kimi readmitido na rota';

/** Tira o acidente de formatacao e deixa a frase. Nao tira contexto: prosa continua prosa. */
function normalizarLinha(linha) {
  return String(linha == null ? '' : linha)
    .replace(/ /g, ' ')            // NBSP colado por copy-paste
    .replace(/^[\s>*+\-]+/, '')         // marcadores de lista e de citacao
    .replace(/[\s*`]+$/, '')            // fecho de negrito/crase
    .replace(/^[`]+/, '')               // abertura de crase
    .replace(/[—–‒]/g, '-') // em-dash, en-dash, figure-dash -> '-'
    .replace(/\s+/g, ' ')               // espacos repetidos
    .trim()
    .toLowerCase();
}

const DESTRAVE_NORMALIZADO = normalizarLinha(LINHA_DESTRAVE);
const KIMI_NORMALIZADO = normalizarLinha(LINHA_KIMI);

function modoVivo(opcoes) {
  const o = opcoes || {};
  const syncPath = o.syncPath;
  if (!syncPath) {
    return { vivo: false, porque: 'SYNC.md nao foi lido: nenhum caminho declarado — trancado' };
  }
  let texto;
  try {
    texto = fs.readFileSync(syncPath, 'utf8');
  } catch (e) {
    return { vivo: false, linha: LINHA_DESTRAVE,
      porque: 'SYNC.md nao foi lido (' + (e && e.code ? e.code : 'erro') + ') — sem prova de que a '
        + 'kimi-egress fechou, o MODO VIVO fica trancado' };
  }
  const linhas = texto.split(/\r?\n/).map(normalizarLinha);
  if (linhas.includes(DESTRAVE_NORMALIZADO)) {
    return { vivo: true, linha: LINHA_DESTRAVE, porque: 'a linha de destrave esta no SYNC.md' };
  }
  return { vivo: false, linha: LINHA_DESTRAVE,
    porque: 'o SYNC.md nao tem a linha exacta «' + LINHA_DESTRAVE + '» — a frente kimi-egress '
      + 'ainda manda, e o MODO VIVO fica trancado' };
}

/**
 * O kimi foi readmitido na rota?
 *
 * Mesma mecanica do `modoVivo`, mesma tolerancia de formatacao, mesmo
 * fail-closed em todos os ramos — ficheiro ausente, ilegivel, ou sem a frase
 * como LINHA INTEIRA => recusado. Deliberadamente NAO reutiliza o `modoVivo`:
 * sao duas condicoes independentes e juntar as duas num sitio so faria com que
 * fechar uma frente destravasse a outra sem ninguem decidir.
 */
function kimiReadmitido(opcoes) {
  const o = opcoes || {};
  const syncPath = o.syncPath;
  if (!syncPath) {
    return { ok: false, linha: LINHA_KIMI,
      porque: 'SYNC.md nao foi lido: nenhum caminho declarado — o kimi fica fora' };
  }
  let texto;
  try {
    texto = fs.readFileSync(syncPath, 'utf8');
  } catch (e) {
    return { ok: false, linha: LINHA_KIMI,
      porque: 'SYNC.md nao foi lido (' + (e && e.code ? e.code : 'erro') + ') — sem prova de que o '
        + 'veto de egress entrou em main, o kimi fica fora' };
  }
  const linhas = texto.split(/\r?\n/).map(normalizarLinha);
  if (linhas.includes(KIMI_NORMALIZADO)) {
    return { ok: true, linha: LINHA_KIMI, porque: 'a linha de readmissao esta no SYNC.md' };
  }
  return { ok: false, linha: LINHA_KIMI,
    porque: 'o SYNC.md nao tem a linha exacta «' + LINHA_KIMI + '» — o ALTO da kimi-egress (o '
      + 'plano que fica no disco sem o recibo o declarar) continua sem veto em main' };
}

module.exports = { LINHA_DESTRAVE, DESTRAVE_NORMALIZADO, modoVivo, normalizarLinha,
  LINHA_KIMI, KIMI_NORMALIZADO, kimiReadmitido };
