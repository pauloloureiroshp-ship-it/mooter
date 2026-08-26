/**
 * produtor-semgrep.mjs — o braço A do A/B, como produtor da fila.
 *
 * ── PORQUE É QUE ISTO PASSA PELO WSL ────────────────────────────────────────
 * Não é preferência: **o semgrep não corre em Windows nativo** (facto medido, e
 * registado na §9 do pré-registo). A máquina do dono é Windows 11. Logo o único
 * percurso que existe é Node(Windows) → `wsl.exe` → semgrep(Ubuntu). Medido a
 * 2026-08-26 nesta máquina: `semgrep 1.174.0` em `/home/paulo/.local/bin/semgrep`,
 * WSL 2.6.3.0. O pré-registo diz que o percurso INTEGRADO Node→WSL era `n/d` até
 * a F1 o medir; este ficheiro é essa medição.
 *
 * ── PORQUE É QUE A PROVA DE REDE DESTE PRODUTOR É DIFERENTE DAS OUTRAS ──────
 * A sonda de sockets do `rede-zero.mjs` lê a tabela do **Windows** por PID. O
 * processo que ela veria é o `wsl.exe`; o semgrep vive dentro da VM do WSL e os
 * seus sockets NÃO estão nessa tabela. Sondar o `wsl.exe` daria zero por
 * CEGUEIRA — e um zero cego é pior do que um `n/d`, porque parece uma medição.
 *
 * Por isso este adaptador traz a sua própria prova, e é mais forte do que a
 * sonda: corre o semgrep dentro de `unshare -rn`, um espaço de nomes de rede
 * sem interfaces. Verificado nesta máquina a 2026-08-26 — lá dentro
 * `ip -o link show` mostra apenas `lo` em estado DOWN, `curl https://semgrep.dev`
 * devolve `Could not resolve host`, e `/mnt/c` continua legível. Não é
 * observação (que pode falhar uma ligação curta): é construção — não há rota
 * para haver chamada. É declarado ao auditor como `estado: 'bloqueado'`.
 *
 * Se o `unshare -rn` não estiver disponível (kernel sem user namespaces sem
 * privilégio), o produtor NÃO corre em modo cego: corre à mesma e declara
 * `n/d` com a saída exacta do erro, o que empurra `rede_zero` para `null`.
 *
 * ── O DEFEITO MEDIDO QUE ESTE FICHEIRO CORRIGE ─────────────────────────────
 * Com `--config <ficheiro.yaml>` local, o semgrep prefixa o `check_id` com o
 * CAMINHO do ficheiro de regras. Medido a 2026-08-26 sobre `hono/src`:
 *
 *   mnt.c.Users.PAULOL1.AppData.…scratchpad.onda.regras-semgrep.javascript.lang.security.audit.unknown-value-with-script-tag.unknown-value-with-script-tag
 *
 * A `rule` entra no hash de identidade de `apontamentoDoDetector`. Sem
 * normalização, mover a pasta das regras (ou correr noutra máquina) daria uma
 * chave nova a CADA apontamento e ressuscitaria tudo o que já tivesse sido
 * triado. `normalizarCheckId` corta esse prefixo — a identidade passa a ser a
 * regra, não o sítio onde o ficheiro estava nesse dia.
 */

import { MSG_MAX } from './ancora.mjs';
import { posix, spawnVivo } from './produtores.mjs';

/** `C:/x/y` → `/mnt/c/x/y`. Só isto; o resto do caminho passa como está. */
export function paraWsl(p) {
  const s = posix(p);
  const m = /^([A-Za-z]):\/(.*)$/.exec(s);
  return m ? `/mnt/${m[1].toLowerCase()}/${m[2]}` : s;
}

/** Aspas simples para bash, incluindo o caso do apóstrofo no caminho. */
export function citar(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/**
 * Corta do `check_id` o prefixo que o semgrep herda do caminho do ficheiro de
 * regras. Duas estratégias, pela ordem: o prefixo exacto derivado do directório
 * (é o que acontece), e — se a derivação falhar — o corte no último segmento com
 * o nome da pasta das regras.
 */
export function normalizarCheckId(checkId, dirRegras) {
  const id = String(checkId || '');
  if (!dirRegras) return id;
  const dir = paraWsl(dirRegras);
  const pontilhado = dir.replace(/^\/+/, '').replace(/~/g, '').replace(/\//g, '.');
  if (pontilhado && id.startsWith(`${pontilhado}.`)) return id.slice(pontilhado.length + 1);
  const base = dir.split('/').filter(Boolean).pop();
  if (base) {
    const marca = `${base.replace(/~/g, '')}.`;
    const i = id.lastIndexOf(marca);
    if (i !== -1) return id.slice(i + marca.length);
  }
  return id;
}

/** Uma frase só, sem quebras, e do tamanho que o juiz chega mesmo a ler. */
export function enunciado(msg) {
  return String(msg || '').replace(/\s+/g, ' ').trim().slice(0, MSG_MAX);
}

/**
 * Traduz a saída `--json` do semgrep para o esquema `{file,line,rule,msg}`.
 * Campos confirmados numa corrida real a 2026-08-26 (312 ficheiros de `hono/src`,
 * 90 regras, 28,7 s, 1 achado): `results[].check_id`, `.path` (relativo ao cwd),
 * `.start.line`, `.extra.message`.
 */
export function traduzir(json, { dirRegras = null } = {}) {
  const results = (json && Array.isArray(json.results)) ? json.results : [];
  const brutos = [];
  for (const r of results) {
    const linha = r && r.start && Number(r.start.line);
    if (!Number.isInteger(linha) || linha < 1) continue;
    brutos.push({
      file: posix(r.path),
      line: linha,
      rule: `semgrep/${normalizarCheckId(r.check_id, dirRegras)}`,
      msg: enunciado(r.extra && r.extra.message),
    });
  }
  return brutos;
}

/**
 * O comando que corre lá dentro. Montado como string porque atravessa
 * `wsl.exe -- bash -lc`, e o `unshare` tem de envolver o semgrep e não o bash.
 */
export function comandoWsl({ raiz, dirRegras, alvo = '.', usarUnshare = true }) {
  const cd = `cd ${citar(paraWsl(raiz))}`;
  const configs = ['p-javascript', 'p-typescript', 'p-security-audit', 'p-nodejs']
    .map((n) => `--config ${citar(`${paraWsl(dirRegras)}/${n}.yaml`)}`)
    .join(' ');
  // `--metrics=off` e `--disable-version-check` não são a prova (a prova é o
  // namespace); estão aqui para que o semgrep não gaste segundos a tentar e a
  // falhar contra uma rede que não existe.
  const sg = `semgrep scan --metrics=off --disable-version-check --no-git-ignore --json ${configs} ${citar(alvo)}`;
  return `${cd} && ${usarUnshare ? `unshare -rn ${sg}` : sg}`;
}

/**
 * @param {object} opts
 * @param {string} opts.dirRegras  pasta com os 4 yaml vendorizados de §2.1
 * @param {string} [opts.alvo]     subcaminho dentro da raiz (default: tudo)
 */
export function produtorSemgrep({ dirRegras, alvo = '.', spawnImpl = spawnVivo, wsl = 'wsl.exe' } = {}) {
  return {
    id: 'semgrep',
    origem: 'semgrep',
    async correr({ raiz, ambiente, declararFilhoMedido }) {
      if (!dirRegras) throw new Error('semgrep sem --regras: o conjunto vendorizado de §2.1 é obrigatório e não se descarrega durante a corrida');

      // Primeiro pergunta-se ao WSL se o namespace de rede está disponível SEM
      // privilégio. A resposta decide se a prova é `bloqueado` ou `n/d` — nunca
      // se assume que está.
      const teste = await correrWsl(spawnImpl, wsl, `unshare -rn true && echo SIM`, ambiente);
      const temUnshare = teste.rc === 0 && /SIM/.test(teste.out);

      const cmd = comandoWsl({ raiz, dirRegras, alvo, usarUnshare: temUnshare });
      const t0 = Date.now();
      const r = await correrWsl(spawnImpl, wsl, cmd, ambiente);
      const ms = Date.now() - t0;

      declararFilhoMedido({
        cmd: `wsl.exe semgrep${temUnshare ? ' (unshare -rn)' : ''}`,
        args: [cmd],
        estado: temUnshare ? 'bloqueado' : 'n/d',
        porque: temUnshare
          ? 'correu num espaço de nomes de rede sem interfaces (unshare -rn): não há rota para haver chamada'
          : `unshare -rn indisponível neste WSL, e a tabela de sockets do Windows não vê para dentro da VM — rc=${teste.rc} · ${teste.err.slice(0, 200)}`,
      });

      let json;
      try { json = JSON.parse(r.out); }
      catch { throw new Error(`semgrep não devolveu JSON (rc=${r.rc}): ${r.err.slice(0, 300) || r.out.slice(0, 300)}`); }

      return {
        brutos: traduzir(json, { dirRegras }),
        meta: {
          versao: json.version ?? null,
          ficheiros_varridos: (json.paths && Array.isArray(json.paths.scanned)) ? json.paths.scanned.length : null,
          erros_do_semgrep: Array.isArray(json.errors) ? json.errors.length : null,
          rede: temUnshare ? 'bloqueada-por-namespace' : 'n/d',
          ms_wsl: ms,
        },
      };
    },
  };
}

function correrWsl(spawnImpl, wsl, comando, ambiente) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let p;
    try {
      p = spawnImpl(wsl, ['--', 'bash', '-lc', comando], { env: ambiente, windowsHide: true });
    } catch (e) { resolve({ rc: -1, out: '', err: String(e && e.message) }); return; }
    p.stdout.on('data', (d) => { out += String(d); });
    p.stderr.on('data', (d) => { err += String(d); });
    p.on('error', (e) => resolve({ rc: -1, out, err: err + String(e && e.message) }));
    p.on('close', (rc) => resolve({ rc, out, err }));
  });
}
