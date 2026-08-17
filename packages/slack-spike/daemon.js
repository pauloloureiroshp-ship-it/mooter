'use strict';
/**
 * ⚠️ THROWAWAY — spike Slack. O arranque, e as quatro razoes para NAO arrancar.
 *
 * Ordem deliberada (cada passo so corre se o anterior passou):
 *   1. o spike morreu?            -> morte.js  (prazo declarado, +30 dias)
 *   2. o MODO VIVO esta destravado? -> gate.js (linha no SYNC.md)
 *   3. o .env esta mesmo ignorado pelo git? -> ANTES de tocar no token (kimi #7)
 *   4. ha token?
 *
 * O passo 3 vem antes do 4 de proposito: verificar depois de ler o token era
 * verificar depois de o ter em memoria e possivelmente em logs.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const morte = require('./morte.js');
const gate = require('./gate.js');

/**
 * `git check-ignore` e a unica fonte que sabe MESMO se o ficheiro esta
 * ignorado — ler o .gitignore a mao ignora precedencias, negacoes e o
 * .git/info/exclude. Fail-closed: se o git nao responder, nao se arranca.
 */
function envEstaIgnoradoPorOmissao(opcoes) {
  const o = opcoes || {};
  const repo = o.repo;
  const envPath = o.envPath;
  if (!repo || !envPath) return { ignorado: false, porque: 'faltam repo/envPath para verificar' };
  if (!fs.existsSync(envPath)) {
    return { ignorado: false, porque: 'o ficheiro ' + path.basename(envPath) + ' nao existe — '
      + 'cria-o e confirma que o git o ignora antes de la por um token' };
  }
  try {
    execFileSync('git', ['-C', repo, 'check-ignore', '-q', envPath], { stdio: 'ignore' });
    return { ignorado: true, porque: 'git check-ignore confirma que o ficheiro esta ignorado' };
  } catch (e) {
    if (e && e.status === 1) {
      return { ignorado: false, porque: 'git check-ignore diz que ' + path.basename(envPath)
        + ' NAO esta ignorado — um token commitado nao se descommita' };
    }
    return { ignorado: false, porque: 'git nao respondeu (' + ((e && e.message) || 'erro')
      + ') — sem prova, nao se arranca' };
  }
}

/**
 * @returns {{arrancou:boolean, porque:string, passo?:string}}
 * Nunca lanca: quem arranca um daemon quer uma razao legivel, nao um stack.
 */
function arrancar(opcoes) {
  const o = opcoes || {};
  const verificarEnv = o.verificarEnv || envEstaIgnoradoPorOmissao;
  const lerToken = o.lerToken || (() => process.env.SLACK_BOT_TOKEN || null);

  // 1 · o prazo
  const m = morte.estadoDeMorte(o.agora);
  if (m.morto) {
    return { arrancou: false, passo: 'morte', porque: m.porque, morre_em: m.morre_em };
  }

  // 2 · o gate do MODO VIVO — o `if` que o masterprompt v1.1 manda escrever
  const g = gate.modoVivo({ syncPath: o.syncPath });
  if (!g.vivo) {
    return { arrancou: false, passo: 'modo_vivo',
      porque: 'MODO VIVO trancado: ' + g.porque
        + ' (MODO CONSTRUCAO continua permitido — testes e adapter em dry-run)' };
  }

  // 3 · o token so se toca DEPOIS de o git provar que o ficheiro esta ignorado
  const v = verificarEnv({ repo: o.repo, envPath: o.envPath });
  if (!v.ignorado) {
    return { arrancou: false, passo: 'env_nao_ignorado', porque: v.porque };
  }

  // 4 · o token
  const token = lerToken();
  if (!token) {
    return { arrancou: false, passo: 'sem_token',
      porque: 'SLACK_BOT_TOKEN ausente — o .env esta em ordem mas vazio' };
  }

  return { arrancou: true, passo: 'pronto', morre_em: m.morre_em,
    dias_restantes: m.dias_restantes,
    porque: 'prazo por cumprir, MODO VIVO destravado no SYNC.md, .env ignorado pelo git' };
}

module.exports = { arrancar, envEstaIgnoradoPorOmissao };
