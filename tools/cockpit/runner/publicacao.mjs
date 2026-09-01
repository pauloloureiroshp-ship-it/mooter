/**
 * publicacao.mjs — a frota ve mesmo este device? Medido, nao presumido.
 *
 * PORQUE EXISTE.
 *
 * O `beacon-publisher.mjs` publica de 10 em 10 minutos e guarda a hora da
 * ultima publicacao numa VARIAVEL DE MODULO (`moo-runner.mjs:431`). Isso morre
 * com o processo, e vive dentro do processo do LOOP — o painel corre noutro. O
 * cockpit nunca teve como responder a pergunta mais simples da frota: «o meu
 * beacon chegou a sair desta maquina?»
 *
 * O sinal facil seria ler `MOO_PUBLICAR_BEACON` do ambiente. Seria falso: essa
 * variavel e do processo do loop, e le-la aqui responderia sobre o processo
 * errado — e responderia sobre a INTENCAO, nao sobre o resultado. Um flag
 * ligado com o vault sem remoto publica exactamente zero beacons.
 *
 * O que se mede em vez disso e o que o git sabe: quando foi o ultimo COMMIT que
 * tocou o beacon deste device, se a copia em disco ja divergiu desse commit, e
 * se esse commit chegou ao REMOTO. Tres perguntas ao git, zero rede, zero LLM,
 * e todas sobre factos.
 *
 * A terceira entrou depois das outras duas, porque sem ela o modulo respondia a
 * pergunta errada com muita confianca: commitado e publicado nao sao a mesma
 * coisa, e um push recusado deixava o payload a dizer «esta publicado» numa
 * maquina que a frota nao via. (`@{u}..HEAD` compara com a referencia de
 * seguimento local, que so e tao fresca quanto o ultimo `fetch` — por isso a
 * resposta e sobre o que ESTA MAQUINA sabe do remoto, e nao uma sondagem a
 * rede, que este modulo nao faz.)
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/** O caminho do beacon dentro do vault. A mesma string que o runner publica. */
export function caminhoDoBeacon(device) {
  return `50-fleet/${device}.json`;
}

const nd = (porque) => ({
  transporte: null, remoto: null, ultima_publicacao: null,
  por_publicar: null, por_empurrar: null, ficheiro: null, porque,
});

/**
 * @returns {{transporte: 'vault-git'|'local'|null, remoto: boolean|null,
 *            ultima_publicacao: string|null, por_publicar: boolean|null,
 *            ficheiro: string|null, porque: string}}
 *   `ultima_publicacao` = ISO do ultimo commit que tocou o beacon. `null` quer
 *   dizer «nunca foi publicado», que e diferente de «nao sei» so porque o
 *   `porque` o diz por extenso.
 */
export function estadoDaPublicacao({
  vaultPath = null,
  device = null,
  runImpl = null,
  existsImpl = fs.existsSync,
} = {}) {
  if (!vaultPath) return nd('sem vault montado nesta maquina — o beacon nao sai do disco');
  if (!device) return nd('sem nome de device — nao ha beacon para procurar');
  const rel = caminhoDoBeacon(device);
  if (!existsImpl(path.join(vaultPath, '.git'))) {
    return {
      transporte: 'local', remoto: false, ultima_publicacao: null, por_publicar: null,
      por_empurrar: null, ficheiro: rel,
      porque: 'o vault nao e um repositorio git — o beacon vale o que este disco valer',
    };
  }
  const run = runImpl || ((args) => execFileSync('git', args, {
    cwd: vaultPath, encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'],
  }));

  let remoto = null;
  try { remoto = Boolean(String(run(['remote'])).trim()); } catch { remoto = null; }

  let ultima = null;
  try {
    // `--` para o caminho nunca ser lido como uma ref. Vazio = nunca commitado.
    const saida = String(run(['log', '-1', '--format=%cI', '--', rel])).trim();
    ultima = saida || null;
  } catch {
    return {
      transporte: 'vault-git', remoto, ultima_publicacao: null, por_publicar: null,
      por_empurrar: null, ficheiro: rel,
      porque: 'o git do vault nao respondeu — a publicacao nao foi medida',
    };
  }

  let porPublicar = null;
  try {
    // `diff HEAD` do caminho: vazio = o que esta em disco e o que esta commitado.
    porPublicar = String(run(['diff', '--name-only', 'HEAD', '--', rel])).trim().length > 0;
  } catch { porPublicar = null; }

  /**
   * COMMITADO NAO E PUBLICADO — e chamar-lhe publicado era a mentira que este
   * modulo existe para nao contar. Apanhado em revisao antes de sair: as duas
   * perguntas acima comparam o disco com o HEAD **local**, e o HEAD local pode
   * estar a dez commits do remoto (offline, credencial expirada, push
   * recusado). O `remoto` so diz que ha um remoto CONFIGURADO. Sem esta
   * terceira pergunta, o payload afirmava «o beacon em disco e o que esta
   * publicado» numa maquina que nenhuma outra consegue ver.
   *
   * `null` quando nao ha ramo a seguir (`@{u}` rebenta) ou o git nao responde:
   * nao-saber continua a nao se arredondar para «esta la».
   */
  let porEmpurrar = null;
  try {
    const n = String(run(['rev-list', '--count', '@{u}..HEAD', '--', rel])).trim();
    porEmpurrar = Number.isFinite(Number(n)) ? Number(n) > 0 : null;
  } catch { porEmpurrar = null; }

  const porque = !remoto
    ? 'o vault nao tem remoto — o commit fica nesta maquina e mais nenhuma o ve'
    : (ultima === null
      ? 'o beacon deste device nunca foi commitado no vault'
      : (porPublicar
        ? 'ha alteracoes ao beacon por publicar desde o ultimo commit'
        : (porEmpurrar === true
          ? 'o beacon esta commitado mas o commit ainda nao foi empurrado — a frota nao o ve'
          : (porEmpurrar === false
            ? 'o beacon em disco e o que esta no remoto'
            : 'o beacon em disco e o que esta commitado; se o commit chegou ao remoto nao foi medido'))));

  return {
    transporte: 'vault-git', remoto, ultima_publicacao: ultima,
    por_publicar: porPublicar, por_empurrar: porEmpurrar, ficheiro: rel, porque,
  };
}
