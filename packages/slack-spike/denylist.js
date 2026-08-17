'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack.
 *
 * kimi #5: o NOME de um segredo e informacao. `segredo.env` publicado num canal
 * diz a um estranho onde procurar, mesmo sem o conteudo.
 *
 * Esta lista NAO e a defesa principal — a defesa e a allowlist de campos do
 * `publicar.js`, que so deixa sair valores derivados (custo, modelo, autor) e
 * nunca texto do repo. Isto e o cinto por cima dos suspensorios: apanha o caso
 * em que uma mensagem de estado ou de erro traz um nome pelo caminho.
 */

const MARCADOR = '[nome-de-ficheiro-sensivel removido]';

/**
 * ⚠️ `(?![A-Za-z0-9])` E NAO `\b`. O `_` conta como caracter de palavra para o
 * `\b`, logo `segredo.env_` NAO casava — e um `_` a seguir a um nome aparece por
 * duas vias banais: o proprio ledger (`prod.env_bak`) e a decoracao de markdown
 * (`_segredo.env_`, italico no Slack). Encontrei-o a mutar a ordem do varrimento:
 * a ordem certa (varrer os dados antes de formatar) resolve a segunda via, mas nao
 * a primeira — se o nome ja vier colado a um `_` do ledger, nenhuma ordem ajuda.
 * O lookahead trata as duas, e continua a NAO apanhar `prod.environment`, porque
 * ai o que segue e uma letra.
 */
const PADROES = [
  // qualquer ficheiro com extensao de segredo: segredo.env, prod.env, chave.pem
  /\S*\.(env|pem|key|p12|pfx|jks|keystore|asc|gpg)(?![A-Za-z0-9])/gi,
  // chaves ssh por nome proprio
  /\b(id_rsa|id_dsa|id_ecdsa|id_ed25519)(\.pub)?\b/gi,
  // dotfiles de credenciais
  /(^|[\s"'([{/\\])\.(npmrc|netrc|pgpass|htpasswd|aws\/credentials)\b/gi,
  // ficheiros de credenciais com nome falante
  /\b(serviceAccount|credentials|secrets?|segredos?)[A-Za-z0-9._-]*\.(json|ya?ml|txt|ini|toml)\b/gi,
];

/** @returns {string[]} nomes distintos encontrados (vazio quando nao ha nenhum). */
function nomesSensiveis(texto) {
  const t = String(texto == null ? '' : texto);
  const achados = new Set();
  for (const re of PADROES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      // o grupo 1 de alguns padroes e o delimitador que os precede; o que
      // interessa e o match inteiro, sem esse delimitador.
      achados.add(m[0].replace(/^[\s"'([{/\\]+/, ''));
      if (m.index === re.lastIndex) re.lastIndex++;
    }
  }
  return [...achados];
}

/** @returns {{texto:string, removidos:string[]}} */
function limpar(texto) {
  const t = String(texto == null ? '' : texto);
  const removidos = nomesSensiveis(t);
  if (!removidos.length) return { texto: t, removidos: [] };
  let out = t;
  // do mais longo para o mais curto: substituir `x.env` antes de `.env` evita
  // deixar um pedaco do nome para tras.
  for (const nome of [...removidos].sort((a, b) => b.length - a.length)) {
    out = out.split(nome).join(MARCADOR);
  }
  return { texto: out, removidos };
}

module.exports = { MARCADOR, PADROES, nomesSensiveis, limpar };
