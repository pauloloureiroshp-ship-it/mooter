/**
 * fleet-beacon.mjs — how devices see each other without listening on the LAN.
 *
 * The obvious design is to bind the F10 endpoint to 0.0.0.0 and have each panel
 * poll the others. That throws away the loopback guarantee this runner was just
 * hardened around: a control endpoint reachable from the network is a remote
 * kill-switch, and no amount of Origin checking fixes a listening socket on a
 * shared wifi.
 *
 * So devices never talk to each other. Each one WRITES a small beacon into a
 * directory both machines already share (the vault, or a local folder when the
 * vault is not mounted), and each panel READS whatever beacons it finds.
 *
 * The honest consequence, which the payload states rather than hides: a beacon
 * is only as fresh as whatever syncs that directory. If the vault syncs by git,
 * "the 4090 is working" means "the 4090 was working as of its last push". The
 * cockpit therefore renders cross-device rows with their own age and its own
 * word for it — never the same green as the device you are standing at.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
/**
 * A assinatura do canal. Ate 2026-08-21 este ficheiro escrevia e lia beacons em
 * claro: qualquer processo com escrita em `50-fleet/` inventava um device ou
 * reescrevia o custo de outra maquina, e o painel acreditava. Ver
 * `tools/router/assinatura.js` para o porque completo.
 */
const assinatura = require('../../router/assinatura.js');

/** Beyond this a beacon says nothing useful about right now. */
export const BEACON_FRESH_S = 120;
export const BEACON_STALE_S = 1800;
const MAX_BEACONS = 24;

/**
 * The ONE place this machine gets its name.
 *
 * It used to be derived in three: the launcher from the hostname, the loop from
 * `MOOTER_DEVICE || 'mac-mini'`, the endpoint from its own `'mac-mini'` default.
 * The result showed up live — the mac wrote a beacon as `mac-mini-de-paulo` and
 * its own cockpit failed to recognise it as itself, listing the local machine
 * as if it were a remote one. Identity derived in more than one place is
 * identity that will diverge.
 */
export function deviceName() {
  return safeDeviceName(
    process.env.MOOTER_DEVICE || os.hostname().replace(/\.local$/i, ''),
  );
}

/** Filenames are device names, so they must not be able to escape the folder. */
export function safeDeviceName(name) {
  const clean = String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/^[.-]+/, '')
    .slice(0, 48);
  return clean || 'device-sem-nome';
}

/**
 * Where beacons live. The vault is preferred because it is the channel that
 * already crosses machines; the local fallback keeps a single-device setup
 * working without pretending it has a fleet.
 */
export function beaconDir({ vaultPath = process.env.VAULT_PATH, home = os.homedir(),
                            existsImpl = fs.existsSync } = {}) {
  const vault = vaultPath || (home ? path.join(home, 'paulo-vault') : null);
  if (vault && existsImpl(vault)) {
    return { dir: path.join(vault, '50-fleet'), transporte: 'vault', partilhado: true };
  }
  return { dir: path.join(home || '.', '.mooter', 'fleet'), transporte: 'local', partilhado: false };
}

/** Writes this device's beacon. Never throws — a beacon is telemetry, not work. */
export function writeBeacon(state, {
  dir, writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync,
  chaveImpl = assinatura.chaveDoDono, assinarImpl = assinatura.assinado,
  // Ed25519: o par deste device, o registo de publicas, e como assinar com ele.
  deviceKeyImpl = assinatura.chaveDoDevice, registoImpl = assinatura.lerRegisto,
  assinarEdImpl = assinatura.assinadoEd,
} = {}) {
  const device = safeDeviceName(state && state.device);
  try {
    mkdirImpl(dir, { recursive: true });
    const beacon = {
      device,
      ts: new Date().toISOString(),
      plataforma: os.platform(),
      running: Boolean(state && state.running),
      pilar_atual: (state && state.pilar_atual) ?? null,
      modelo: (state && state.modelo_atual) ?? null,
      // `buildFleetState` ja calculava `engine`, mas o beacon montava um
      // objecto de chaves fixas onde ele nao constava: a correccao de
      // "deixar de jurar motor vivo" morria antes de chegar ao disco, e a
      // frota via um device em apagao como se estivesse a trabalhar.
      engine: (state && state.engine) ?? null,
      // Pelo mesmo motivo do `engine` tres linhas acima: sem viajar no beacon, a
      // distincao entre "em pausa" e "morto" existia so na maquina que pausou, e
      // a frota via um device obediente como um device rebentado.
      pausa: (state && state.pausa) ?? null,
      // A deriva de codigo tem de viajar pela mesma razao que a pausa: um device
      // a correr codigo de ha tres dias e invisivel de fora, e foi assim que
      // isto aconteceu tres vezes seguidas sem ninguem dar por ela.
      codigo: (state && state.projeto && state.projeto.codigo) ?? null,
      gpu_pct: state && state.gpu ? state.gpu.util_pct : null,
      gpu_fonte: state && state.gpu ? state.gpu.fonte : 'n/d',
      vram_gb: state && state.gpu ? state.gpu.vram_inuse_gb : null,
      recibos: state && state.recibos
        ? { total: state.recibos.total, citacao_ok: state.recibos.citacao_ok,
            refutado: state.recibos.refutado, vazias_seguidas: state.recibos.vazias_seguidas }
        : null,
      // `recibos.total` e a contagem da JANELA lida, nao o tamanho do ledger.
      // Sem isto, a frota mostrava 5000 para um device com 6569 recibos, e
      // chamava-lhe total. O calculo ja existia em fleet-state; faltava viajar.
      ledger: state && state.ledger ? state.ledger : null,
      // Quantos achados esperam decisao neste device. E o que permite ver o
      // gargalo da frota — sem isto, todos os devices parecem igualmente uteis.
      triagem: state && state.triagem
        ? { achados: state.triagem.achados, por_triar: state.triagem.por_triar }
        : null,
      // Um device que CEDEU a maquina nao esta avariado. Sem este campo, uma
      // reserva activa era indistinguivel de um loop morto.
      reserva: state && state.reserva ? state.reserva : null,
      branch: state && state.projeto ? state.projeto.repo_branch : null,
      /**
       * A versao do conector DESTE device: a instalada no Claude Desktop e a
       * que o checkout traz. Dois FACTOS, sem juizo — quem julga e `naTuaMao`.
       *
       * PORQUE viaja (medido 2026-08-21): `verConector()` (self-check.mjs:258)
       * ja lia a versao instalada, mas so corria LOCALMENTE, no `/saude.json`
       * do proprio device. O painel do PC nao tinha como saber que o Mac corria
       * 1.33.0 contra 1.49.3 no repo — dezasseis versoes de diferenca, e o unico
       * sitio onde isso aparecia era num painel que so o Mac abre. Um alerta que
       * so se ve na maquina avariada nao e um alerta: e um diario.
       */
      conector: state && state.conector
        ? { instalado: state.conector.instalado ?? null, repo: state.conector.repo ?? null }
        : null,
      usd: 0,
    };
    // Assina, se houver chave. Um beacon SEM chave continua a ser escrito e
    // di-lo (`assinado:false`) — deixar de publicar por nao haver vault seria
    // apagar o proprio device do painel para o proteger de um ataque que ainda
    // nao ha. O que NAO se faz e escrever um beacon a fingir que esta assinado.
    let payload = beacon;
    let assinado = false;
    let alg = null;
    let porque = null;

    /**
     * Ed25519 SO depois de inscrito, nunca antes.
     *
     * A ordem importa e e a unica que nao parte nada: enquanto a publica deste
     * device nao estiver no registo, ninguem la fora a tem para verificar —
     * passar a assinar com ela cedo demais so troca "verificado" por
     * "nao-inscrito" em todos os paineis. Assim o dono inscreve primeiro (um
     * commit no vault), o device ve-se la, e SO ENTAO muda de algoritmo. Ate la
     * o HMAC continua exactamente como estava.
     */
    const meu = deviceKeyImpl();
    const reg = registoImpl();
    const inscrito = meu && meu.pub && reg && reg.devices && reg.devices[device]
      && reg.devices[device].pub === meu.pub;

    if (inscrito) {
      try {
        payload = assinarEdImpl(beacon, { privada: meu.privada, pub: meu.pub });
        assinado = true;
        alg = assinatura.ALG_ED;
      } catch (err) {
        porque = String(err && err.message).slice(0, 120);
      }
    }

    const k = assinado ? null : chaveImpl();
    if (!assinado) {
      porque = porque || (k && k.erro ? k.erro : 'sem chave do dono neste device');
      if (k && k.chave) {
        try {
          payload = assinarImpl(beacon, { chave: k.chave });
          assinado = true;
          alg = assinatura.ALG_TAG;
          porque = null;
        } catch (err) {
          porque = String(err && err.message).slice(0, 120);
        }
      }
    }
    writeImpl(path.join(dir, `${device}.json`), JSON.stringify(payload, null, 2));
    return {
      ok: true,
      device,
      assinado,
      alg,
      inscrito: Boolean(inscrito),
      // `partilhado:false` quer dizer chave por-device: assina, mas nao prova
      // frota nenhuma — so prova que ninguem mexeu no ficheiro desta maquina.
      // Com Ed25519 a pergunta deixa de fazer sentido: quem prova e o registo.
      chave_partilhada: inscrito ? true : Boolean(k && k.partilhado && k.chave),
      porque_nao_assinado: assinado ? null : porque,
    };
  } catch (err) {
    return { ok: false, erro: String(err && err.message).slice(0, 120) };
  }
}

/**
 * O que espera pela MAO DO DONO, device a device.
 *
 * O painel ja mostrava alertas — mas so os DESTA maquina (`/saude.json` corre
 * `autoVerificar` local). Um dono com dois computadores tem de abrir os dois
 * paineis para descobrir que um deles esta desactualizado, e e por isso que o
 * Mac ficou em 1.33.0 enquanto o repo ia em 1.49.3: ninguem estava sentado a
 * frente dele quando o alerta apareceu.
 *
 * Devolve UMA entrada por device que precisa de accao, cada uma com o comando
 * exacto. Nao inventa: se o beacon nao trouxer as versoes, o device sai com
 * `estado:'n/d'` e o motivo, nunca com "esta bem".
 *
 * @param {Array} frota  o que `readBeacons` devolveu
 * @param {{rejeitados?: Array}} extra  beacons recusados, que tambem pedem a mao
 */
export function naTuaMao(frota, { rejeitados = [] } = {}) {
  const itens = [];

  for (const d of frota || []) {
    const c = d && d.conector;
    if (!c || !c.instalado || !c.repo) {
      // Um device que nao declara versao NAO e um device em dia.
      itens.push({
        id: 'conector', device: d.device, estado: 'n/d',
        titulo: `conector: versao desconhecida em ${d.device}`,
        porque: !c
          ? 'este beacon e de uma versao anterior a que publica a versao do conector'
          : 'o beacon nao traz a versao instalada ou a do repo',
        accao: null, comando: null,
      });
      continue;
    }
    if (c.instalado === c.repo) continue;   // em dia: nao ocupa a lista
    itens.push({
      id: 'conector', device: d.device, estado: 'mau',
      titulo: `conector desatualizado em ${d.device}: ${c.instalado} instalado ≠ ${c.repo} no repo`,
      porque: 'as ferramentas MCP correm codigo de outra versao — o que ves no painel e o que a skill faz podem discordar',
      // O CTA de um clique. `verConector` ja escrevia uma frase parecida, mas
      // so para a maquina local; aqui ela ganha o NOME do device, que e o que
      // torna a instrucao accionavel quando ha mais do que um computador.
      accao: `instalar o .mcpb da v${c.repo} no Claude Desktop de ${d.device}`,
      comando: `open packages/mooter-bridge/dist/mooter-${c.repo}.mcpb`,
      passos: [
        `no ${d.device}: git pull na raiz do repo`,
        `abrir packages/mooter-bridge/dist/mooter-${c.repo}.mcpb (duplo clique)`,
        'reabrir o Claude Desktop — 10 s',
      ],
    });
  }

  // Um beacon recusado tambem e trabalho para o dono: ou alguem lhe mexeu no
  // vault, ou uma maquina esta a assinar com outra chave. Calar isto seria
  // exactamente o silencio que a Onda 1a foi feita para acabar.
  for (const r of rejeitados || []) {
    itens.push({
      id: 'beacon-recusado', device: r.device, estado: 'mau',
      titulo: `beacon recusado de ${r.device}: ${r.codigo}`,
      porque: r.motivo,
      accao: r.codigo === 'adulterado'
        ? 'confirmar quem escreve em 50-fleet/ e se as duas maquinas partilham a mesma chave do dono'
        : 'ver o recibo em rejeitados[] antes de confiar neste device',
      comando: null,
    });
  }

  return itens;
}

/**
 * Age of a beacon, in the same three-state vocabulary the local device uses —
 * but computed against the beacon's own timestamp, so a device that stopped
 * syncing goes dark instead of freezing green.
 */
export function beaconFreshness(ts, nowMs) {
  const t = ts ? Date.parse(ts) : NaN;
  if (!Number.isFinite(t)) return { estado: 'morto', idade_s: null, motivo: 'sem timestamp' };
  const raw = Math.round((nowMs - t) / 1000);
  if (raw < -5) return { estado: 'morto', idade_s: null, motivo: 'beacon datado no futuro' };
  const age = Math.max(0, raw);
  if (age <= BEACON_FRESH_S) return { estado: 'vivo', idade_s: age, motivo: null };
  if (age <= BEACON_STALE_S) return { estado: 'stale', idade_s: age, motivo: `sem sinal ha ${age}s` };
  return { estado: 'morto', idade_s: age, motivo: `sem sinal ha ${age}s` };
}

/**
 * Reads every beacon in the directory.
 *
 * @returns {{frota: Array, transporte: string, partilhado: boolean, aviso: string|null}}
 */
export function readBeacons({
  dir, transporte = 'local', partilhado = false, selfDevice = null, now = Date.now(),
  readdirImpl = fs.readdirSync, readImpl = fs.readFileSync,
  chaveImpl = assinatura.chaveDoDono, verificarImpl = assinatura.verificar,
  // O registo de chaves PUBLICAS: quem julga um beacon Ed25519.
  registoImpl = assinatura.lerRegisto,
  /**
   * Beacons lidos do REMOTO do vault (`origin/<branch>:50-fleet/*.json`), por
   * nome de ficheiro — ver `fleet-remoto.mjs`. Sao uma camada POR CIMA do
   * disco: se o remoto tiver um beacon mais novo do que o ficheiro local, vale
   * o remoto. Assim a frescura de outro device deixa de esperar pelo `pull`
   * deste lado — so pelo `fetch`, que nao toca na arvore nem no indice.
   *
   * Nao ha atalho de confianca: o que vem do remoto passa pela MESMA
   * verificacao de assinatura que o que vem do disco, mais abaixo.
   */
  remotos = null,
} = {}) {
  let names = [];
  try {
    names = readdirImpl(dir).filter((n) => n.endsWith('.json'));
    // Um device que ainda nao chegou a este disco (nunca houve `pull`) existe
    // na mesma: entra pelo nome que o remoto conhece.
    if (remotos) {
      for (const n of Object.keys(remotos)) if (n.endsWith('.json') && !names.includes(n)) names.push(n);
    }
    names = names.slice(0, MAX_BEACONS);
  } catch {
    return {
      frota: [], rejeitados: [], transporte, partilhado,
      aviso: partilhado
        ? 'pasta de beacons ilegivel — a frota nao pode ser mostrada'
        : 'sem vault montado — so este device escreve aqui, a frota nao e partilhada',
    };
  }

  const k = chaveImpl();
  const chave = k && k.chave ? k.chave : null;
  const registo = registoImpl();

  const frota = [];
  /**
   * Os beacons que foram RECUSADOS, e porque. Esta lista e o recibo: um beacon
   * descartado em silencio e indistinguivel de um device que nunca existiu, e
   * era exactamente assim que uma forja passava despercebida.
   */
  const rejeitados = [];
  for (const name of names) {
    let b = null;
    try {
      b = JSON.parse(String(readImpl(path.join(dir, name), 'utf8')));
    } catch {
      b = null; // a corrupt beacon is one missing device, never a broken payload
    }
    if (!b || typeof b !== 'object' || !b.device) b = null;

    /**
     * O proprio device NUNCA se le do remoto: o que ele acabou de escrever no
     * disco e a verdade mais fresca que existe sobre ele, e o remoto so pode
     * estar atrasado. Dos OUTROS, ganha o `ts` mais novo — e em empate ganha o
     * disco, porque foi o que este device ja aceitou.
     */
    const eSelf = safeDeviceName(name.replace(/\.json$/, '')) === safeDeviceName(selfDevice);
    const r = !eSelf && remotos ? remotos[name] : null;
    let via = 'disco';
    if (r && typeof r === 'object' && r.device) {
      const tsLocal = b && typeof b.ts === 'string' ? Date.parse(b.ts) : NaN;
      const tsRemoto = typeof r.ts === 'string' ? Date.parse(r.ts) : NaN;
      if (!b || (Number.isFinite(tsRemoto) && !(tsLocal >= tsRemoto))) { b = r; via = 'remoto'; }
    }
    if (!b || typeof b !== 'object' || !b.device) continue;

    /**
     * A verificacao, e a unica linha de julgamento deste modulo:
     *
     *   assinado e valido  -> entra, com `autenticidade.ok = true`
     *   assinado e FALHA   -> **NAO ENTRA**, e deixa recibo em `rejeitados`
     *   nao assinado       -> entra, marcado `n/d`
     *
     * A terceira linha e deliberada e nao e um buraco: um beacon que nunca foi
     * assinado nao e uma forja, e um beacon velho — de uma versao anterior a
     * esta, ou de um device sem chave. Recusa-los todos apagaria a frota do
     * painel no dia do upgrade. O que se recusa e quem AFIRMA uma assinatura e
     * nao a consegue provar: isso nao e atraso, e mentira.
     */
    const temSig = Boolean(b.sig);
    // `device` e o nome do FICHEIRO, nunca o campo `device` de dentro: e assim
    // que o registo indexa as publicas, e e o que impede um beacon assinado por
    // uma maquina de tomar o lugar de outra.
    const v = temSig
      ? verificarImpl(b, { chave, agora: now, registo, device: safeDeviceName(name.replace(/\.json$/, '')) })
      : { ok: false, codigo: 'nao-assinado', motivo: 'beacon sem assinatura (device por actualizar)' };

    if (temSig && !v.ok) {
      rejeitados.push({
        ficheiro: name,
        device: safeDeviceName(b.device),
        codigo: v.codigo,
        motivo: v.motivo,
        ts: typeof b.ts === 'string' ? b.ts : null,
      });
      continue;
    }
    // `{...b}` copiava TODAS as chaves de TODOS os ficheiros `.json` desta
    // pasta para o `/fleet.json` servido por HTTP. A escrita (writeBeacon)
    // monta um objecto de chaves NOMEADAS de proposito — uma allowlist — e a
    // leitura deitava essa disciplina fora. Qualquer ficheiro que alguem
    // largasse em `50-fleet/` era publicado inteiro.
    //
    // O nome do FICHEIRO e a identidade, nao o campo `device` la dentro: um
    // beacon podia dizer que era outra maquina e roubar-lhe o lugar de `self`.
    const doFicheiro = safeDeviceName(name.replace(/\.json$/, ''));
    frota.push({
      device: safeDeviceName(b.device),
      ts: typeof b.ts === 'string' ? b.ts : null,
      plataforma: typeof b.plataforma === 'string' ? b.plataforma : null,
      running: Boolean(b.running),
      pilar_atual: typeof b.pilar_atual === 'string' ? b.pilar_atual : null,
      modelo: typeof b.modelo === 'string' ? b.modelo : null,
      engine: typeof b.engine === 'string' ? b.engine : null,
      gpu_pct: typeof b.gpu_pct === 'number' ? b.gpu_pct : null,
      gpu_fonte: typeof b.gpu_fonte === 'string' ? b.gpu_fonte : null,
      vram_gb: typeof b.vram_gb === 'number' ? b.vram_gb : null,
      recibos: b.recibos && typeof b.recibos === 'object' ? b.recibos : null,
      ledger: b.ledger && typeof b.ledger === 'object' ? b.ledger : null,
      triagem: b.triagem && typeof b.triagem === 'object' ? b.triagem : null,
      reserva: b.reserva && typeof b.reserva === 'object' ? b.reserva : null,
      pausa: b.pausa && typeof b.pausa === 'object' ? b.pausa : null,
      codigo: b.codigo && typeof b.codigo === 'object' ? b.codigo : null,
      branch: typeof b.branch === 'string' ? b.branch : null,
      conector: b.conector && typeof b.conector === 'object'
        ? {
          instalado: typeof b.conector.instalado === 'string' ? b.conector.instalado : null,
          repo: typeof b.conector.repo === 'string' ? b.conector.repo : null,
        }
        : null,
      usd: typeof b.usd === 'number' ? b.usd : 0,
      self: doFicheiro === safeDeviceName(selfDevice),
      // De onde veio ESTE beacon. Sem isto, um device fresco pelo remoto e um
      // device fresco pelo disco sao indistinguiveis no painel — e quando a
      // frescura discorda entre dois cockpits, e a primeira coisa a perguntar.
      via,
      frescura: beaconFreshness(b.ts, now),
      // Nunca `true` por omissao: um beacon so e autentico se a assinatura
      // bateu contra a chave do dono, e o painel tem de os poder distinguir.
      autenticidade: {
        ok: v.ok === true,
        codigo: v.codigo,
        motivo: v.motivo || null,
        /**
         * O que ANCORA esta verificacao — porque nem toda a verificacao prova o
         * mesmo. `registo`: a publica veio de um ficheiro que o dono commitou.
         * `chave-partilhada`: o segredo simetrico que atravessou as maquinas a
         * mao. `chave-local`: a chave so existe aqui, portanto isto prova que
         * o ficheiro nao foi mexido e NADA sobre a sua origem.
         */
        ancora: v.ok !== true ? null
          : (v.alg === assinatura.ALG_ED ? 'registo' : (k.partilhado ? 'chave-partilhada' : 'chave-local')),
      },
    });
  }
  frota.sort((a, b) => (a.self === b.self ? String(a.device).localeCompare(b.device) : a.self ? -1 : 1));

  const semChave = !chave;
  /**
   * A frota esta PROVADA?
   *
   * Ate 2026-08-24 isto era `Boolean(chave && k.partilhado)`, e o `partilhado`
   * so queria dizer "o ficheiro da chave esta debaixo do vault". Nao queria
   * dizer partilhada: a `.owner.key` cai no `*.key` do `.gitignore` do vault,
   * portanto NUNCA viajou entre maquinas — cada device gerou a sua. O painel
   * afirmava `prova_frota: true` com duas chaves diferentes e um dos devices a
   * ser recusado, que e exactamente a especie de afirmacao que este modulo
   * existe para nao fazer.
   *
   * A prova agora e medida, nao presumida: e precisa de DOIS devices distintos
   * verificados — um device sozinho a verificar-se a si proprio nao prova frota
   * nenhuma, prova um solitario.
   */
  /**
   * Verificados NAO chega: uma chave que so existe nesta maquina verifica o
   * ficheiro e nao diz nada sobre a origem dele. Contam para prova de frota os
   * devices cuja verificacao esta ancorada em algo que atravessa maquinas — o
   * registo de publicas, ou a chave partilhada da Fase 1.
   */
  const verificados = new Set(frota.filter((d) => d.autenticidade && d.autenticidade.ok).map((d) => d.device));
  const provados = new Set(frota
    .filter((d) => d.autenticidade && d.autenticidade.ok && d.autenticidade.ancora !== 'chave-local')
    .map((d) => d.device));
  const porEnrolar = rejeitados.filter((r) => r.codigo === 'chave-diferente').map((r) => r.device);
  const porInscrever = rejeitados.filter((r) => r.codigo === 'nao-inscrito').map((r) => r.device);
  // Dois devices, ambos ancorados fora desta maquina. Ate 2026-08-24 isto era
  // `Boolean(chave && k.partilhado)` — presumia a partilha em vez de a medir.
  const provaFrota = provados.size >= 2;

  const porqueSemProva = () => {
    if (semChave) return k && k.erro ? k.erro : 'sem chave do dono: nenhuma assinatura pode ser verificada';
    if (porInscrever.length) {
      return `${porInscrever.length} device(s) por inscrever no registo (${porInscrever.join(', ')}): o dono ainda nao autorizou a chave publica deles`;
    }
    if (porEnrolar.length) {
      return `${porEnrolar.length} device(s) assinam com outra chave (${porEnrolar.join(', ')}): a chave do dono nao esta partilhada entre as maquinas`;
    }
    // Antes de falar de contagem, falar de ALCANCE: uma chave que so existe
    // nesta maquina verifica a integridade do ficheiro, nao a origem dele. E a
    // causa mais informativa das duas, por isso vem primeiro.
    if (verificados.size > provados.size) return 'chave local: verifica integridade do ficheiro, nao a origem';
    if (!k.partilhado && !registo.existe) return 'chave local: verifica integridade do ficheiro, nao a origem';
    if (provados.size <= 1) return 'so um device verifica: uma maquina sozinha nao prova frota';
    return null;
  };

  return {
    frota,
    rejeitados,
    transporte,
    partilhado,
    // Uma chave por-device verifica que ninguem mexeu no ficheiro; NAO prova
    // que o beacon veio do dono. Dizer "frota autenticada" com uma chave local
    // seria a especie de afirmacao que este projecto se recusa a fazer.
    autenticacao: {
      // Onde a chave VIVE, que e um facto. Se ela e partilhada ou nao, quem
      // responde e `prova_frota` — e responde com o que mediu.
      chave: semChave ? 'n/d' : (k.partilhado ? 'no vault' : 'local (por-device)'),
      // O kid DESTA maquina, para se poder comparar a olho com o dos beacons.
      kid: chave ? assinatura.kidDaChave(chave) : null,
      devices_verificados: verificados.size,
      devices_por_enrolar: porEnrolar,
      devices_por_inscrever: porInscrever,
      // O registo de publicas existe? E o unico caminho que nao obriga a mover
      // um segredo entre maquinas.
      registo: registo.caminho
        ? { caminho: registo.caminho, existe: registo.existe, devices: Object.keys(registo.devices).length, erro: registo.erro }
        : null,
      prova_frota: provaFrota,
      porque: provaFrota ? null : porqueSemProva(),
      // Dizer que a chave nao esta partilhada sem dizer COMO se partilha deixa
      // o dono a olhar para um diagnostico correcto e inaccionavel. O comando
      // existe desde a Fase 1; o que faltava era o painel apontar para ele.
      resolver: porInscrever.length
        ? 'inscreve esses devices: la, `npm run frota:chave -- --inscrever` mostra a publica; aqui, acrescenta-a ao registo e commita-a no vault'
        : (porEnrolar.length
          ? 'leva a chave do dono a mao para esse device: `npm run frota:chave -- --exportar <destino fora de qualquer repo>` aqui, `--importar <ficheiro>` la'
          : null),
    },
    // Stated, not implied: without a shared directory the "fleet" is one machine.
    aviso: partilhado
      ? (remotos
        ? 'a frescura de outros devices vale o que o fetch do vault valer'
        : 'a frescura de outros devices vale o que o sync do vault valer')
      : 'sem vault montado — so este device escreve aqui, a frota nao e partilhada',
  };
}
