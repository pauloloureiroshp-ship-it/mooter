'use strict';
/**
 * oraculo.js — o verificador determinístico que fecha o loop sem juiz-LLM.
 *
 * ── PORQUÊ EXISTE ─────────────────────────────────────────────────────────────
 *
 * Auditoria E2E de 2026-08-01, dois factos medidos que se somam:
 *
 *   1. `tools/router/feedback-collector.js` escreve `followup_quality` (1/0) em
 *      `decisions.log` e `auto-feedback.js` consome-o como reward do learner.
 *      Contagem real de eventos no ficheiro: **0**. Ninguém nunca correu
 *      `/mooter-good` nem `/mooter-bad`. O loop de qualidade foi construído e o
 *      botão nunca foi carregado.
 *   2. `moo-verify` existia só como SKILL — um prompt para um agente. Não havia
 *      nada que um processo pudesse chamar.
 *
 * Resultado: o Mooter não tinha sinal de qualidade nenhum a entrar no learner, e
 * a única métrica directa dependia de um gesto humano que ninguém faz.
 *
 * ── PORQUÊ UM ORÁCULO E NÃO UM JUIZ ───────────────────────────────────────────
 *
 * A literatura de 2026 sobre auto-melhoria é explícita: ancorar o loop a uma
 * **superfície de especificação e a um oráculo de regressão**, não a um objectivo
 * de optimização — é isso que evita o goodharting (o agente optimiza a métrica e
 * degrada o produto em dimensões não medidas). Um LLM-como-juiz tem viés
 * auto-preferencial e custa tokens. Um comando de shell não tem opinião.
 *
 * ── A REGRA: «não piora», nunca «passa» ───────────────────────────────────────
 *
 * O repo já decidiu isto na Wave J: *«o gate é 'a suite não piora', não 'a suite
 * passa'»*. Um oráculo que exigisse verde absoluto marcaria vermelho todos os
 * jobs num repo com uma falha crónica (o `ondaA.test.js` é exactamente isso) e o
 * sinal ficaria inútil em duas horas.
 *
 * Por isso mede-se ANTES e DEPOIS, e só se atribui culpa ao job quando o
 * delta é dele. Se já estava vermelho, o job não fica marcado — regista-se que a
 * base estava vermelha e o veredicto é `n/d`. Nunca se inventa atribuição.
 *
 * ── O QUE NUNCA FAZ ───────────────────────────────────────────────────────────
 *
 * · Não chama nenhum modelo. Custo = 0, sempre.
 * · Não inventa checks. Se o projecto não declara nenhum, devolve `n/d` com o
 *   motivo — nunca «verde» por ausência de prova.
 * · Não corre nada fora da worktree que lhe é dada.
 * · Não escreve no repositório.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

/** Tecto duro por check. Um oráculo lento deixa de ser corrido — e aí não vale nada. */
const TIMEOUT_MS_DEFAULT = 120000;

/**
 * Que verificações é que este projecto declara?
 *
 * Ordem deliberada: o que o projecto DIZ que é o seu teste vem primeiro
 * (`package.json.scripts.test`), porque é a especificação do dono. Só depois se
 * infere. Nunca se inventa um comando que o projecto não declarou.
 */
function detectarChecks(worktree, opts = {}) {
  const readFile = opts.readFile || ((p) => fs.readFileSync(p, 'utf8'));
  const exists = opts.exists || ((p) => fs.existsSync(p));
  const listar = opts.listar || ((dir) => { try { return fs.readdirSync(dir); } catch { return []; } });

  const checks = [];
  const pkgPath = path.join(worktree, 'package.json');
  let pkg = null;
  if (exists(pkgPath)) {
    try { pkg = JSON.parse(readFile(pkgPath)); } catch { pkg = null; }
  }
  const scripts = (pkg && pkg.scripts) || {};

  // 1. O que o dono declarou como teste.
  if (typeof scripts.test === 'string' && scripts.test.trim()
    && !/no test specified/i.test(scripts.test)) {
    checks.push({ id: 'test', bin: 'npm', args: ['test', '--silent'], fonte: 'package.json scripts.test' });
  }
  // 2. Verificações baratas e determinísticas, se declaradas.
  for (const [id, nome] of [['typecheck', 'typecheck'], ['lint', 'lint'], ['build', 'build']]) {
    if (typeof scripts[nome] === 'string' && scripts[nome].trim()) {
      checks.push({ id, bin: 'npm', args: ['run', nome, '--silent'], fonte: 'package.json scripts.' + nome });
    }
  }
  // 3. Inferência mínima: node:test nativo, só se não houver script de teste declarado.
  if (!checks.some((c) => c.id === 'test')) {
    const temTestes = listar(worktree).some((f) => /\.test\.(?:js|mjs|cjs)$/.test(f));
    if (temTestes) {
      checks.push({ id: 'node-test', bin: 'node', args: ['--test'], fonte: 'ficheiros *.test.js na raiz da worktree' });
    }
  }
  return checks;
}

/**
 * ⚠️ APANHADO NA VALIDAÇÃO DO PRÓPRIO ORÁCULO, 2026-08-01 (G11 do MEO_GAUNTLET).
 *
 * A primeira versão corria `execFileSync('npm', …)`. Em Windows o executável é
 * `npm.cmd`, e `execFileSync` sem `shell` não resolve `.cmd` — devolve ENOENT.
 * Medido contra `packages/router`: o oráculo dizia **«vermelho, 1 de 1 falhou»**
 * em **4 ms**, quando `npm test --silent` no mesmo directório passa.
 *
 * Um oráculo assim escreveria `followup_quality: 0` numa suite verde — isto é,
 * envenenaria o learner com exactamente o tipo de sinal falso que ele existe
 * para impedir. E teria passado nos 12 testes, porque todos usam um corredor
 * falso: os duplos não sabem o que é um `.cmd`.
 *
 * Duas correcções, e a segunda é a que interessa:
 *   1. `npm` → `npm.cmd` em win32.
 *   2. «não conseguiu ARRANCAR» deixa de ser «falhou». ENOENT/EACCES são n/d —
 *      ausência de medição, não medição negativa. Só um processo que correu e
 *      saiu diferente de zero conta como vermelho.
 */
const WIN = process.platform === 'win32';
const NAO_ARRANCOU = new Set(['ENOENT', 'EACCES', 'EPERM', 'ENOTDIR', 'EINVAL']);

/**
 * `npm` em Windows é `npm.cmd`, e desde o CVE-2024-27980 o Node recusa lançar
 * `.cmd`/`.bat` sem `shell:true` — devolve EINVAL. Medido nesta máquina:
 * `execFileSync('npm', …)` → ENOENT; `execFileSync('npm.cmd', …)` → EINVAL.
 *
 * Só se liga o shell no caso que o exige, e os argumentos são literais fixos
 * definidos em `detectarChecks` (`['test','--silent']`, `['run',<allowlist>,
 * '--silent']`). Nada vindo do utilizador ou de um modelo chega a esta linha,
 * portanto o shell não abre superfície de injecção.
 */
function invocacao(bin, args) {
  // Com `shell:true`, passar `args` em separado emite DEP0190 (não são escapados,
  // só concatenados). Como os argumentos aqui são literais fixos, a forma correcta
  // é entregar UMA string já montada e deixar `args` vazio — sem concatenação
  // implícita e sem aviso.
  if (WIN && bin === 'npm') return { bin: ['npm.cmd'].concat(args).join(' '), args: [], shell: true };
  return { bin, args, shell: false };
}

/** Corre um check. Devolve sempre um objecto — nunca lança. */
function correrCheck(check, worktree, timeoutMs, run) {
  const t0 = Date.now();
  const inv = invocacao(check.bin, check.args);
  try {
    run(inv.bin, inv.args,
      { cwd: worktree, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, shell: inv.shell });
    return { id: check.id, fonte: check.fonte, passou: true, correu: true, duracao_ms: Date.now() - t0, porque: null };
  } catch (err) {
    const timedOut = err && (err.killed || err.signal === 'SIGTERM');
    const naoArrancou = err && NAO_ARRANCOU.has(err.code);
    if (naoArrancou) {
      return {
        id: check.id,
        fonte: check.fonte,
        passou: null,
        correu: false,
        duracao_ms: Date.now() - t0,
        porque: 'n/d — o comando não chegou a arrancar (' + err.code + '): '
          + 'não é uma verificação falhada, é uma verificação que não aconteceu',
      };
    }
    return {
      id: check.id,
      fonte: check.fonte,
      passou: false,
      correu: true,
      duracao_ms: Date.now() - t0,
      porque: timedOut ? ('excedeu ' + timeoutMs + ' ms') : ('saiu ' + (err && err.status != null ? err.status : 'erro')),
    };
  }
}

/**
 * Fotografia do estado verificável da worktree. $0, sem modelo.
 *
 * @returns {{veredicto:'verde'|'vermelho'|'n/d', checks:Array, porque:string, custo_usd:0}}
 */
function medir(worktree, opts = {}) {
  const run = opts.run || execFileSync;
  const timeoutMs = Number(opts.timeoutMs) > 0 ? Number(opts.timeoutMs) : TIMEOUT_MS_DEFAULT;
  const checks = opts.checks || detectarChecks(worktree, opts);

  if (!checks.length) {
    return {
      veredicto: 'n/d',
      checks: [],
      custo_usd: 0,
      porque: 'o projecto não declara nenhuma verificação (sem scripts.test/typecheck/lint/build '
        + 'e sem *.test.js na raiz) — ausência de prova não é prova de verde',
    };
  }
  const resultados = checks.map((c) => correrCheck(c, worktree, timeoutMs, run));
  const falhados = resultados.filter((r) => r.passou === false);
  const naoCorreram = resultados.filter((r) => r.correu === false);
  const passaram = resultados.filter((r) => r.passou === true);

  // Nenhum check chegou a correr ⇒ não há medição nenhuma. n/d, nunca vermelho.
  if (!passaram.length && !falhados.length) {
    return {
      veredicto: 'n/d',
      checks: resultados,
      custo_usd: 0,
      porque: 'n/d — nenhuma das ' + resultados.length + ' verificação(ões) chegou a arrancar ('
        + naoCorreram.map((r) => r.id).join(', ') + '); sem medição não há veredicto',
    };
  }
  const sufixoNd = naoCorreram.length
    ? ' · ' + naoCorreram.length + ' não arrancou (' + naoCorreram.map((r) => r.id).join(', ') + ')'
    : '';
  return {
    veredicto: falhados.length ? 'vermelho' : 'verde',
    checks: resultados,
    custo_usd: 0,
    porque: (falhados.length
      ? falhados.length + ' de ' + (falhados.length + passaram.length) + ' verificação(ões) medida(s) falhou: '
        + falhados.map((r) => r.id + ' (' + r.porque + ')').join(', ')
      : passaram.length + ' verificação(ões) passou') + sufixoNd,
  };
}

/**
 * Compara antes/depois e decide se ESTE job é responsável.
 *
 * A regra é «não piora», não «passa» — ver cabeçalho. Só há culpa quando o
 * conjunto de checks falhados CRESCE. Uma base já vermelha nunca é imputada ao
 * job, e nunca se devolve um veredicto que os dados não sustentem.
 *
 * @returns {{veredicto:'verde'|'regressao'|'n/d', followup_quality:0|1|null, porque:string, novos_falhados:string[]}}
 */
function comparar(antes, depois) {
  if (!antes || !depois || antes.veredicto === 'n/d' || depois.veredicto === 'n/d') {
    return {
      veredicto: 'n/d',
      followup_quality: null,
      novos_falhados: [],
      porque: 'n/d — sem verificações declaradas de um dos lados; nada a comparar, e um n/d honesto '
        + 'vale mais do que um verde sem prova',
    };
  }
  /**
   * `c.passou === false`, nunca `!c.passou` — a diferença é o defeito nº1 deste
   * ficheiro a repetir-se um nível acima. `correrCheck` já distingue os três
   * estados (`true` passou · `false` correu e saiu != 0 · `null` não arrancou) e
   * `medir()` respeita-os; era o `comparar()` que os colapsava. Com `!c.passou`,
   * um check que passou ANTES e que DEPOIS não chega a arrancar (ENOENT/EACCES,
   * PATH mexido, npm em falta) entra em `falhDepois` sem estar em `falhAntes` —
   * conta como «novo vermelho» e escreve `followup_quality: 0` por causa do
   * ambiente da máquina, não do trabalho do agente. Ausência de medição não é
   * medição negativa (oraculo.js:110-113); aqui é onde isso se cumpre.
   */
  const falhAntes = new Set((antes.checks || []).filter((c) => c.passou === false).map((c) => c.id));
  const falhDepois = (depois.checks || []).filter((c) => c.passou === false).map((c) => c.id);
  const novos = falhDepois.filter((id) => !falhAntes.has(id));

  if (novos.length) {
    return {
      veredicto: 'regressao',
      followup_quality: 0,
      novos_falhados: novos,
      porque: 'o job partiu ' + novos.length + ' verificação(ões) que passava(m) antes: ' + novos.join(', '),
    };
  }
  if (falhAntes.size) {
    return {
      veredicto: 'verde',
      followup_quality: 1,
      novos_falhados: [],
      porque: 'não piorou — ' + falhAntes.size + ' falha(s) já existia(m) antes do job e não lhe são imputadas',
    };
  }
  return {
    veredicto: 'verde',
    followup_quality: 1,
    novos_falhados: [],
    porque: 'todas as verificações declaradas passam, e passavam antes',
  };
}

/**
 * O evento de qualidade que o learner já sabe ler.
 *
 * Mesma forma que `tools/router/feedback-collector.js:98-107` escreve quando um
 * humano corre `/mooter-good` — para `auto-feedback.js` não haver diferença entre
 * um polegar humano e um oráculo. A diferença fica declarada em `fonte`: quem
 * ler o ficheiro tem de conseguir separar opinião de medição.
 */
function eventoDeQualidade(veredictoComparado, contexto = {}) {
  if (!veredictoComparado || veredictoComparado.followup_quality == null) return null;
  return {
    ts: contexto.ts || new Date().toISOString(),
    event: 'quality_feedback',
    session_id: contexto.session_id || 'oraculo',
    tier: contexto.tier || 'unknown',
    task_category: contexto.task_category || 'unknown',
    followup_quality: veredictoComparado.followup_quality,
    fonte: 'oraculo-determinista',
    porque: veredictoComparado.porque,
    job_id: contexto.job_id || null,
    custo_usd: 0,
  };
}

/**
 * Compõe o veredicto da REGRESSÃO com o da ENTREGA — a regra que decide se um
 * «não entregou nada» chega a virar sinal.
 *
 * Vive aqui, e não inline no `seamless.js`, porque é doutrina do oráculo e tem
 * de ser exercitável pela suite no MESMO caminho que o conector corre — não
 * numa cópia. (D13, 2026-08-01: com o oráculo ligado por omissão, esta regra
 * passou a estar no caminho de todos os jobs de escrita.)
 *
 * «Não partiu nada» não é «fez alguma coisa»: um job cujas escritas foram todas
 * negadas responde «✓ concluído», não regride nada, e levaria `1`. Por isso a
 * entrega manda quando HOUVE medição.
 *
 * Mas o inverso mata o sinal todo: quando `comparar()` devolveu `n/d`
 * (`followup_quality: null` — a worktree não declara verificações nenhumas, que
 * é o caso da raiz deste repo), o caminho honesto nunca escreve. Se a entrega
 * pudesse escrever à mesma, o `0` seria o ÚNICO valor que aquela worktree
 * conseguiria produzir: castigo possível, recompensa impossível, por omissão.
 * Sem medição, silêncio.
 *
 * @returns o veredicto a usar — o original, ou um `nao_entregou` quando a
 *          entrega o desmente E havia medição para desmentir.
 */
function comporEntrega(veredictoComparado, entrega) {
  if (!veredictoComparado) return veredictoComparado;
  if (!entrega || entrega.entregou !== false) return veredictoComparado;
  if (veredictoComparado.followup_quality == null) return veredictoComparado;
  return {
    veredicto: 'nao_entregou',
    followup_quality: 0,
    novos_falhados: [],
    porque: entrega.porque,
  };
}

/**
 * ── O BURACO QUE ESTE ORÁCULO SOZINHO NÃO TAPA ────────────────────────────────
 *
 * Medido em 2026-08-01, contra esta própria implementação, minutos depois de ela
 * passar 15 testes e uma prova E2E:
 *
 *   · despachou-se um job `cc` de ESCRITA com allowedTools a incluir Write
 *   · as escritas foram NEGADAS por permissões — 20 `tool_result` com
 *     `is_error:true`, todos a dizer «permissions to write to …»
 *   · o agente respondeu «✓ Tarefa concluída. Adicionei multiplica(a,b)…»
 *   · o conector gravou `done · exit 0`
 *   · e o oráculo escreveu `followup_quality: 1` — CORRECTAMENTE, porque nada
 *     regrediu. Nada regrediu porque nada aconteceu.
 *
 * Um oráculo de REGRESSÃO responde «partiste alguma coisa?». Não responde
 * «fizeste alguma coisa?». Optimizar só o primeiro premeia quem não faz nada —
 * é o goodharting clássico, e apareceu à primeira tentativa.
 *
 * `impressao()` é a outra metade: uma impressão digital barata do estado da
 * worktree. Se um job de escrita a deixa IDÊNTICA, não entregou — e um verde
 * nessas condições é um verde comprado.
 *
 * Usa git porque é determinístico, já está lá, e não custa nada. Sem git,
 * devolve n/d — nunca um palpite.
 */
function impressao(worktree, opts = {}) {
  const run = opts.run || execFileSync;
  try {
    const head = String(run('git', ['-C', worktree, 'rev-parse', 'HEAD'],
      { encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true })).trim();
    const sujo = String(run('git', ['-C', worktree, 'status', '--porcelain', '-uall'],
      { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    // O conteúdo importa, não só os nomes: reescrever um ficheiro com texto novo
    // não muda `git status` se ele já estivesse modificado.
    const diff = String(run('git', ['-C', worktree, 'diff', 'HEAD'],
      { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }));
    /**
     * ⚠️ SEGUNDA FALHA DESTA MESMA FUNÇÃO, medida em 2026-08-01.
     *
     * A v1 da impressão incluía TUDO o que `git status -uall` mostra. Mas o
     * próprio conector escreve dentro da worktree enquanto o job corre —
     * `.mooter/`, `_handoff/`, `.claude/`. Resultado: a chave mudava sempre e
     * `entregouAlgo()` respondia «entregou» a 100% dos jobs — incluindo aquele
     * cujas 20 escritas foram NEGADAS por permissões e que respondeu
     * «Tarefa concluída» sem ter tocado num ficheiro.
     *
     * O guard anti-goodharting foi neutralizado pelo ruído das próprias
     * ferramentas. Um detector que dispara sempre vale o mesmo que um que nunca
     * dispara. Só conta o que o AGENTE mexeu, não o que o andaime deixou cair.
     */
    const RUIDO_DA_FERRAMENTA = /^(?:\.mooter|_handoff|\.claude|node_modules)[/\\]/;
    const linhasUteis = sujo.split('\n')
      .map((l) => ({ linha: l, caminho: l.slice(3).trim() }))
      .filter((x) => x.caminho && !RUIDO_DA_FERRAMENTA.test(x.caminho));
    const naoSeguidos = linhasUteis.filter((x) => x.linha.startsWith('??')).map((x) => x.caminho);
    const hashNaoSeguidos = naoSeguidos.map((f) => {
      try { return f + ':' + fs.statSync(path.join(worktree, f)).size; } catch { return f + ':n/d'; }
    }).join('|');
    return {
      disponivel: true,
      chave: head + ' ' + linhasUteis.map((x) => x.linha).join('|') + ' ' + diff + ' ' + hashNaoSeguidos,
      ignorados_como_ruido: sujo.split('\n').filter(Boolean).length - linhasUteis.length,
      porque: null,
    };
  } catch (e) {
    return { disponivel: false, chave: null, porque: 'n/d — não consegui ler o estado git (' + (e && e.code || 'erro') + ')' };
  }
}

/**
 * Um job de escrita que não mudou nada não entregou.
 *
 * @returns {{entregou:boolean|null, porque:string}}
 */
function entregouAlgo(antes, depois) {
  if (!antes || !depois || !antes.disponivel || !depois.disponivel) {
    return { entregou: null, porque: 'n/d — sem impressão de estado dos dois lados; não se afirma nem se nega entrega' };
  }
  if (antes.chave === depois.chave) {
    return {
      entregou: false,
      porque: 'o job de escrita deixou a worktree BYTE-A-BYTE igual — não escreveu nada, '
        + 'independentemente do que o texto final diga',
    };
  }
  return { entregou: true, porque: 'a worktree mudou entre o início e o fim do job' };
}

module.exports = {
  detectarChecks, medir, comparar, eventoDeQualidade, comporEntrega, impressao, entregouAlgo, TIMEOUT_MS_DEFAULT,
};
