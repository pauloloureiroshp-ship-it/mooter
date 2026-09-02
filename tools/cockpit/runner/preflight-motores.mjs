#!/usr/bin/env node
/**
 * preflight-motores.mjs — «este motor arranca, aqui, agora?» sem gastar um token.
 *
 * ── PORQUE ISTO EXISTE ──────────────────────────────────────────────────────
 *
 * A 2026-09-02 correram-se 6 tarefas pelo conector. Duas correram no motor
 * local. As outras quatro nao chegaram a existir:
 *
 *   codex  ->  `proc-error: spawn codex ENOENT`
 *   cc     ->  `Not logged in · Please run /login`, exit 1, `<synthetic>`, 0 tokens
 *
 * Nos dois casos o motor ESTAVA instalado e (no caso do `cc`) ESTAVA logado. O
 * que faltava era ambiente — a mesma classe do `gh` sob launchd que originou o
 * `gh-bin.mjs`. E em nenhum dos casos o painel dizia nada: um motor que nao
 * arranca e indistinguivel, no cockpit, de um motor que ninguem usou.
 *
 * ── A REGRA QUE ESTE FICHEIRO NAO QUEBRA ────────────────────────────────────
 *
 * **Presenca nao e prova.** Medido na mesma bancada, no mesmo dia:
 *
 *   ~/.gemini/settings.json  ->  selectedAuthType = "oauth-personal"
 *   gemini -p 'PONG'         ->  «Please set an Auth method …», exit 41
 *
 * Um ficheiro de credenciais no disco diz que ALGUEM se autenticou algures.
 * Nao diz que a sessao esta valida hoje. Por isso `autenticado` sai SEMPRE
 * `null` — provar exige uma chamada ao modelo, e uma auto-verificacao que gasta
 * tokens de cada vez que o painel actualiza deixa de ser gratuita. O que este
 * modulo publica e o que consegue provar: o binario existe, a credencial esta
 * (ou nao esta) no sitio, e o AMBIENTE tem o que o motor precisa.
 *
 * ── NAO EXECUTA NADA ────────────────────────────────────────────────────────
 *
 * Nem `which`, nem `--version`, nem `login status`. Um `execFileSync` por motor
 * a cada `/saude.json` seria o mesmo defeito que fez o `/ledger` demorar 3,4 s.
 * So `fs.existsSync` e leitura de `process.env`.
 *
 * PRIVACIDADE: publica a FONTE (`PATH` / `fora-do-PATH`), nunca o caminho — ele
 * contem o nome do utilizador e isto acaba num painel que se partilha.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { resolverBin } from './gh-bin.mjs';

/**
 * As variaveis de ambiente sem as quais um motor arranca e falha.
 *
 * `USER` esta aqui por medicao, nao por precaucao. Reproduzido a frio a
 * 2026-09-02 nesta maquina, com o `claude` instalado e a sessao valida:
 *
 *   env -i PATH=$PATH HOME=$HOME claude -p 'PONG'
 *     -> «Not logged in · Please run /login»
 *   env -i PATH=$PATH HOME=$HOME USER=$USER claude -p 'PONG'
 *     -> «PONG»
 *
 * Uma variavel. A credencial vive no chaveiro do macOS indexada pela CONTA, e
 * a conta e o `$USER`; sem ela a procura falha e o CLI conclui, de boa-fe, que
 * ninguem se autenticou. `LOGNAME` sozinho NAO chega — tambem foi medido.
 */
export const ENV_NECESSARIO = Object.freeze({
  cc: Object.freeze(['PATH', 'HOME', 'USER']),
  codex: Object.freeze(['PATH', 'HOME']),
  gemini: Object.freeze(['PATH', 'HOME']),
  moo: Object.freeze([]),
  kimi: Object.freeze([]),
});

/**
 * Onde cada motor guarda a prova de que alguem se autenticou.
 *
 * `ficheiro` = caminho relativo a `home`. `env` = variavel que substitui o
 * ficheiro. `chaveiro` = a credencial nao esta em ficheiro nenhum e nao ha
 * maneira de a ler sem uma chamada ao sistema que pode pedir permissao ao dono
 * — que e o caso do Claude Code em macOS, e por isso sai `null`, nao `false`.
 */
export const CREDENCIAL = Object.freeze({
  cc: Object.freeze({ chaveiro: 'macOS Keychain · "Claude Code-credentials", conta = $USER',
    ficheiro: '.claude/.credentials.json', env: 'ANTHROPIC_API_KEY' }),
  codex: Object.freeze({ ficheiro: '.codex/auth.json', env: 'OPENAI_API_KEY' }),
  gemini: Object.freeze({ ficheiro: '.gemini/settings.json', env: 'GEMINI_API_KEY' }),
  kimi: Object.freeze({ env: 'MOONSHOT_API_KEY' }),
  moo: Object.freeze({}),
});

/** Os motores que o conector sabe despachar, e o binario de cada um. */
export const MOTORES = Object.freeze([
  { id: 'moo', bin: null, rotulo: 'Ollama · local', transporte: 'HTTP 127.0.0.1:11434' },
  { id: 'cc', bin: 'claude', rotulo: 'Claude Code', transporte: 'CLI' },
  { id: 'codex', bin: 'codex', rotulo: 'Codex', transporte: 'CLI' },
  { id: 'gemini', bin: 'gemini', rotulo: 'Gemini', transporte: 'CLI' },
  { id: 'kimi', bin: null, rotulo: 'Moonshot · nuvem', transporte: 'HTTPS in-process' },
]);

/**
 * O pre-flight de um motor. Puro: recebe o ambiente e o disco por injeccao.
 *
 * @returns {{id,rotulo,bin,encontrado,fonte,procurados,env_em_falta,credencial,
 *            autenticado,autenticado_porque,estado,porque,resolver}}
 */
export function preFlightDe(motor, {
  env = process.env, home = os.homedir(), plataforma = process.platform,
  existsImpl = fs.existsSync, motorLocalVivo = null,
} = {}) {
  const P = plataforma === 'win32' ? path.win32 : path.posix;
  const faltam = (ENV_NECESSARIO[motor.id] || []).filter((k) => !env[k]);

  let encontrado = null; let fonte = null; let procurados = 0;
  if (motor.bin) {
    const r = resolverBin(motor.bin, { env, home, plataforma, existsImpl });
    encontrado = Boolean(r.caminho);
    fonte = r.fonte;
    procurados = (r.procurados || []).length;
  }

  const cred = CREDENCIAL[motor.id] || {};
  let temCred = null; const ondeCred = [];
  if (cred.env && env[cred.env]) { temCred = true; ondeCred.push(`$${cred.env}`); }
  if (temCred == null && cred.ficheiro) {
    const f = P.join(home, ...cred.ficheiro.split('/'));
    if (existsImpl(f)) { temCred = true; ondeCred.push(cred.ficheiro); }
    else if (!cred.chaveiro) { temCred = false; ondeCred.push(`${cred.ficheiro} nao existe`); }
  }
  if (temCred == null && cred.chaveiro) ondeCred.push(cred.chaveiro);
  // Um motor cuja UNICA credencial e uma variavel de ambiente, e a variavel nao
  // esta, nao e `n/d`: e um facto. O `kimi` corre in-process contra a API da
  // Moonshot — sem `MOONSHOT_API_KEY` nao ha chamada nenhuma para fazer.
  if (temCred == null && cred.env && !cred.ficheiro && !cred.chaveiro) {
    temCred = false;
    ondeCred.push(`$${cred.env} nao esta no ambiente deste processo`);
  }

  // `moo` nao tem binario nem credencial: a prova dele e o motor responder.
  if (motor.id === 'moo') {
    const vivo = motorLocalVivo;
    return {
      id: motor.id, rotulo: motor.rotulo, bin: null, transporte: motor.transporte,
      encontrado: vivo, fonte: vivo ? 'HTTP loopback' : null, procurados: 0,
      env_em_falta: [], credencial: { tem: null, onde: ['nao precisa — corre na maquina do dono'] },
      autenticado: null,
      autenticado_porque: 'nao aplicavel: o motor local nao tem sessao',
      estado: vivo === true ? 'bom' : (vivo === false ? 'mau' : 'n/d'),
      porque: vivo === true ? 'o Ollama respondeu neste endereco'
        : (vivo === false ? 'o Ollama nao respondeu em 127.0.0.1:11434'
          : 'n/d — ninguem perguntou ao motor local nesta chamada'),
      resolver: vivo === false ? 'arranca o Ollama: `ollama serve`' : null,
    };
  }

  const bloqueios = [];
  if (motor.bin && !encontrado) {
    bloqueios.push(`nao encontrei o \`${motor.bin}\` no PATH deste processo nem em ${procurados} caminhos habituais`);
  }
  if (faltam.length) {
    bloqueios.push(`o ambiente deste processo nao tem ${faltam.join(', ')}`);
  }
  if (temCred === false) {
    bloqueios.push(`sem credencial: ${ondeCred.join(' · ')}`);
  }

  return {
    id: motor.id, rotulo: motor.rotulo, bin: motor.bin, transporte: motor.transporte,
    encontrado, fonte, procurados,
    env_em_falta: faltam,
    /**
     * DE QUE AMBIENTE ESTAMOS A FALAR — e a pergunta que torna este campo
     * util ou enganador. Este pre-flight corre no F10. Quem lanca os motores
     * pagos e o CONECTOR, noutro processo, com a sua propria lista de
     * variaveis (`CHILD_ENV_BASE_KEYS`). Um `env_em_falta: []` aqui NAO
     * promete que o conector tem as mesmas — foi exactamente essa a diferenca
     * que fez o `cc` morrer a 2026-09-02 com o `claude` logado.
     */
    env_fonte: 'o ambiente DESTE processo (F10). O conector tem o seu proprio e e o dele que conta para um spawn',
    credencial: { tem: temCred, onde: ondeCred },
    // SEMPRE null, e o `porque` diz porque. Ver o cabecalho: o gemini desta
    // bancada tem `selectedAuthType` no settings e recusa-se a correr.
    autenticado: null,
    autenticado_porque: 'n/d — provar a sessao exige uma chamada ao modelo, e o '
      + 'pre-flight nao gasta tokens. Uma credencial no disco prova que alguem se '
      + 'autenticou algures, nunca que a sessao vale hoje',
    estado: bloqueios.length ? 'mau' : 'n/d',
    porque: bloqueios.length
      ? bloqueios.join(' · ')
      : 'binario encontrado, ambiente completo e credencial no sitio — falta a sessao, que so uma chamada prova',
    resolver: bloqueios.length ? gestoPara(motor, { faltam, encontrado, temCred }) : null,
  };
}

/** O gesto concreto que desbloqueia. Vazio nunca: sem gesto, nao ha diagnostico. */
function gestoPara(motor, { faltam, encontrado, temCred }) {
  if (faltam.includes('USER')) {
    return 'o processo que lanca o motor tem de propagar `USER` — sem ele o Claude Code '
      + 'procura a credencial na conta vazia do chaveiro e conclui que ninguem entrou';
  }
  if (motor.bin && !encontrado) {
    return `instala o \`${motor.bin}\`, ou poe-no num dos caminhos habituais (~/.local/bin, /opt/homebrew/bin, /usr/local/bin)`;
  }
  if (temCred === false) {
    return motor.id === 'gemini'
      ? 'gesto do dono: autentica o `gemini` (GEMINI_API_KEY ou o fluxo do proprio CLI)'
      : `gesto do dono: autentica o \`${motor.id}\``;
  }
  return 'gesto do dono: autentica este motor';
}

/** Os cinco motores de uma vez. */
export function preFlight(opts = {}) {
  const motores = MOTORES.map((m) => preFlightDe(m, opts));
  return {
    motores,
    // O resumo existe para o cartao da saude nao ter de recontar — e para o
    // painel poder dizer «2 dos 5 nao arrancam» sem afirmar que os outros 3
    // arrancam, que e coisa que ninguem provou.
    bloqueados: motores.filter((m) => m.estado === 'mau').map((m) => m.id),
    total: motores.length,
    porque: 'n/d por omissao: este pre-flight prova o que se prova sem gastar tokens',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(preFlight(), null, 2)}\n`);
}
