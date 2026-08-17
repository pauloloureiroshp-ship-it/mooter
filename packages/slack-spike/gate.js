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
 */

const fs = require('fs');

const LINHA_DESTRAVE = 'kimi-egress FECHADA — slack-spike destravado';

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
  const linhas = texto.split(/\r?\n/).map((l) => l.trim());
  if (linhas.includes(LINHA_DESTRAVE)) {
    return { vivo: true, linha: LINHA_DESTRAVE, porque: 'a linha de destrave esta no SYNC.md' };
  }
  return { vivo: false, linha: LINHA_DESTRAVE,
    porque: 'o SYNC.md nao tem a linha exacta «' + LINHA_DESTRAVE + '» — a frente kimi-egress '
      + 'ainda manda, e o MODO VIVO fica trancado' };
}

module.exports = { LINHA_DESTRAVE, modoVivo };
