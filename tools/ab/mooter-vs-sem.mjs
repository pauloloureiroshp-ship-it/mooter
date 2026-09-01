#!/usr/bin/env node
/**
 * mooter-vs-sem.mjs — o A/B que faltava: Mooter contra não-Mooter, medido.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE ESTE FICHEIRO EXISTE
 *
 * A 2026-09-01 o dono perguntou «quais foram as métricas do teste Mooter vs
 * sem Mooter?» e a resposta honesta foi: **não houve teste**. Não havia braço A,
 * não havia braço B, não havia comparação. O argumento de venda estava, nas
 * palavras do próprio handoff de PRIME-0, em «confia em mim».
 *
 * O vault tem a decisão que isto respeita (2026-08-24): **«parar de publicar
 * poupança até haver tokens medidos»**. Este ficheiro é a forma de a levantar —
 * não por decreto, por medição.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE MEDE, E PORQUE NÃO É SÓ CUSTO
 *
 * Um router barato que erra é pior do que caro que acerta: manda trabalho
 * difícil para um modelo que não o aguenta, e o custo reaparece na re-execução.
 * Por isso a métrica-mãe aqui é **precisão contra um gold standard**, e o custo
 * só conta ao lado dela.
 *
 * O dataset é `tools/router/gold-labels.json` — 84 prompts com `expected_tier`
 * escrito por humano, versionado no repo desde 2026-06-08. Não foi feito para
 * este teste; é anterior a ele, o que é precisamente o que o torna utilizável
 * (um gold escrito depois da hipótese não é gold, é decoração).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TRÊS BRAÇOS
 *
 *   A1 · SEM ROUTER      — o mundo do utilizador sem Mooter: não há
 *                          classificação, todo o trabalho vai para o tier caro.
 *                          Precisão contra o gold: por construção, acerta só nos
 *                          prompts que REALMENTE eram T3. Custo: o do tier caro,
 *                          84 vezes.
 *   A2 · ROUTER POR LLM  — o que a concorrência faz: um modelo lê o prompt e diz
 *                          o tier. Mede-se com um LLM local para o custo em $ não
 *                          poluir a comparação de PRECISÃO; o custo em nuvem é
 *                          calculado à parte, a preço de tabela, e declarado como
 *                          equivalente — nunca como despesa.
 *   B  · MOOTER          — `classify.js`, determinístico, regex, zero rede,
 *                          zero tokens. É o ficheiro FROZEN do repo: este
 *                          harness importa-o, nunca lhe toca.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * REGRAS DE HONESTIDADE (as mesmas do resto do repo)
 *
 *   · número não medido = `n/d`. Nunca estimado, nunca extrapolado sem dizer.
 *   · o custo em nuvem é «equivalente a preço de tabela», não despesa.
 *   · o gold é anterior ao teste e não é tocado.
 *   · o resultado é o que sair. Este ficheiro não sabe quem devia ganhar.
 *
 * Uso:
 *   node tools/ab/mooter-vs-sem.mjs                    # os três braços
 *   node tools/ab/mooter-vs-sem.mjs --json             # para o recibo
 *   node tools/ab/mooter-vs-sem.mjs --modelo qwen2.5-coder:14b
 *   node tools/ab/mooter-vs-sem.mjs --n 20             # amostra menor
 */

'use strict';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const AQUI = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(AQUI, '..', '..');

const GOLD = path.join(RAIZ, 'tools', 'router', 'gold-labels.json');
const VALIDATION = path.join(RAIZ, 'tools', 'router', 'validation-set.json');

/**
 * O HOLDOUT — e porque ele existe.
 *
 * O `gold-labels.json` é de 2026-04-11 e o `classify.js` foi tocado até
 * 2026-06-09: há dois meses em que alguém pôde olhar para os falhados do gold e
 * ajustar padrões à mão. O pipeline de afinação (`backtest.js`,
 * `update-router.js`) NÃO lê o gold — verificado, 0 ocorrências — mas isso não
 * exclui a afinação humana.
 *
 * Por isso o número que se publica é o do `validation-set.json`, que tem uma
 * secção **adversarial** escrita para partir o classificador. Medido a
 * 2026-09-01: gold 96,4%, holdout 84,3%. **Publica-se o segundo.** A diferença
 * de 12 pontos é a medida do que a afinação valeu — e escondê-la seria vender o
 * número do treino como se fosse o do teste.
 */
export function holdout() {
  const v = JSON.parse(fs.readFileSync(VALIDATION, 'utf8'));
  const out = [];
  for (const sec of ['canonical', 'adversarial', 'historical']) {
    for (const [i, a] of (v[sec] || []).entries()) {
      // `coautorada`: este rótulo foi escrito no MESMO commit que mexeu no
      // classify.js? `mooter_review_1`/`_2` são os nomes dos commits 4b6e4548 e
      // bc4f84f1, e os dois tocam `tools/router/classify.js`. Marcá-las é o que
      // permite publicar o número que não as inclui — sem isto, «o corte que
      // ninguém afinou» é uma frase que o próprio ficheiro desmente.
      out.push({
        id: `${sec}-${String(i + 1).padStart(2, '0')}`,
        prompt: a.prompt, expected_tier: a.expected_tier, seccao: sec,
        confidence_source: a.confidence_source || null,
        coautorada: /^mooter_review/.test(a.confidence_source || ''),
      });
    }
  }
  return out;
}

/**
 * Preços de tabela, do SSOT do repo. NUNCA escritos à mão aqui: a skill
 * `pricing-correto-2026` é explícita em que todas as fontes deferem a ela, e um
 * preço copiado é a segunda verdade que já custou uma sessão a este projecto.
 */
function precos() {
  try {
    const p = require(path.join(RAIZ, 'tools', 'router', 'pricing.js'));
    return { ok: true, PRICES: p.PRICES || p.default || p };
  } catch (err) {
    return { ok: false, porque: `sem pricing.js: ${(err && err.message) || 'erro'}`, PRICES: null };
  }
}

/** Preço por milhão, para um modelo. `null` quando o SSOT não o tem. */
function precoDe(PRICES, modelo) {
  if (!PRICES) return null;
  const p = PRICES[modelo] || PRICES[String(modelo).toLowerCase()];
  if (!p) return null;
  const inp = p.input ?? p.in ?? p.prompt ?? null;
  const out = p.output ?? p.out ?? p.completion ?? null;
  return inp == null || out == null ? null : { input: inp, output: out };
}

function custoUsd(preco, tokensIn, tokensOut) {
  if (!preco) return null;
  return (tokensIn / 1e6) * preco.input + (tokensOut / 1e6) * preco.output;
}

// ─────────────────────────────────────────────────────────────────────────────
// Braço B · MOOTER — classify.js, determinístico
// ─────────────────────────────────────────────────────────────────────────────

export function bracoMooter(amostras) {
  const { classify } = require(path.join(RAIZ, 'tools', 'router', 'classify.js'));
  const linhas = [];
  const t0 = process.hrtime.bigint();
  for (const a of amostras) {
    const t = process.hrtime.bigint();
    let tier = null, erro = null;
    try { tier = classify(a.prompt).tier; }
    catch (e) { erro = (e && e.message) || 'erro'; }
    linhas.push({
      id: a.id, esperado: a.expected_tier, obtido: tier, erro,
      ms: Number(process.hrtime.bigint() - t) / 1e6,
      tokens_in: 0, tokens_out: 0,
      // sem isto, `precisao_limpa` era igual a `precisao_total` e o corte limpo
      // nao existia — a marca morria no braco em vez de chegar a contabilidade
      coautorada: !!a.coautorada,
    });
  }
  return {
    braco: 'B · MOOTER (classify.js local)',
    linhas,
    ms_total: Number(process.hrtime.bigint() - t0) / 1e6,
    // Zero medido, não zero assumido: o classify não abre socket nenhum.
    tokens_in: 0, tokens_out: 0, rede: false, modelo: 'nenhum (regex determinística)',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Braço A1 · SEM ROUTER — tudo para o tier caro
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Não há chamada nenhuma: o mundo sem router não classifica, despacha.
 * A «precisão» dele é a fracção de prompts que REALMENTE eram do tier caro —
 * e é isso que torna a comparação justa: ele não erra por ignorância, erra por
 * não perguntar.
 */
export function bracoSemRouter(amostras, { tierFixo = 'T3' } = {}) {
  const linhas = amostras.map((a) => ({
    id: a.id, esperado: a.expected_tier, obtido: tierFixo, erro: null,
    ms: 0, tokens_in: 0, tokens_out: 0,
    coautorada: !!a.coautorada,
  }));
  return {
    braco: `A1 · SEM ROUTER (tudo em ${tierFixo})`,
    linhas, ms_total: 0, tokens_in: 0, tokens_out: 0, rede: false,
    modelo: `${tierFixo} sempre`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Braço A2 · ROUTER POR LLM — o que a concorrência faz
// ─────────────────────────────────────────────────────────────────────────────

const PROMPT_JUIZ = (p) => `Classifica esta tarefa de programação num de quatro níveis e responde SÓ com o rótulo.

T0 = trivial, mecânico, um ficheiro, sem risco (renomear, formatar, mover)
T1 = pequeno, texto ou explicação curta (mensagem de commit, docstring, regex)
T2 = raciocínio (investigar bug, comparar abordagens, plano técnico)
T3 = arquitectura, multi-ficheiro, produção, segredos, CI, migrações

CONVENÇÕES deste repositório, que os rótulos usam (não as adivinhes — estão aqui):
- risco alto força T3: deploy, push, merge, release, migrações, segredos, .env, CI
- pedido explícito de mais cuidado ("pensa bem", "é crítico", "think hard",
  "preciso do teu melhor") sobe um nível
- nomear um modelo (@opus, @haiku, "usa o sonnet") fixa o nível desse modelo
- mexer em mais de 3 ficheiros, ou decidir arquitectura, é T3

Tarefa: ${p}

Responde só: T0, T1, T2 ou T3.`;

const RE_TIER = /\bT[0-3]\b/;

export async function bracoLlm(amostras, { modelo, callImpl, timeoutMs = 120000 } = {}) {
  const { callOllama } = require(path.join(RAIZ, 'tools', 'router', 'providers', 'ollama-api.js'));
  const call = callImpl || callOllama;
  const linhas = [];
  let tIn = 0, tOut = 0;
  const t0 = process.hrtime.bigint();

  for (const a of amostras) {
    const t = process.hrtime.bigint();
    let tier = null, erro = null, ti = 0, to = 0;
    try {
      const r = await call(PROMPT_JUIZ(a.prompt), {
        model: modelo, timeoutMs, system: 'Responde só com T0, T1, T2 ou T3.',
        temperature: 0,
        sessionId: 'ab-harness',
      });
      if (!r) {
        erro = 'resposta nula';
      } else {
        ti = Number(r.tokensIn || 0); to = Number(r.tokensOut || 0);
        const m = RE_TIER.exec(String(r.text || ''));
        // Sem rótulo reconhecível é `null`, NÃO um palpite. Um juiz que não
        // responde não pode ser contado como tendo acertado nem errado.
        tier = m ? m[0] : null;
        if (!m) erro = `sem rótulo na resposta: ${JSON.stringify(String(r.text || '').slice(0, 60))}`;
      }
    } catch (e) { erro = (e && e.message) || 'erro'; }
    tIn += ti; tOut += to;
    linhas.push({ id: a.id, esperado: a.expected_tier, obtido: tier, erro, ms: Number(process.hrtime.bigint() - t) / 1e6, tokens_in: ti, tokens_out: to, coautorada: !!a.coautorada });
  }

  return {
    braco: `A2 · ROUTER POR LLM (${modelo})`,
    linhas, ms_total: Number(process.hrtime.bigint() - t0) / 1e6,
    tokens_in: tIn, tokens_out: tOut, rede: true, modelo,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contabilidade
// ─────────────────────────────────────────────────────────────────────────────

export function contabilizar(r) {
  const total = r.linhas.length;
  const respondidas = r.linhas.filter((l) => l.obtido != null).length;
  const certas = r.linhas.filter((l) => l.obtido === l.esperado).length;
  const semResposta = total - respondidas;

  // A precisão declara-se sobre as RESPONDIDAS, e o denominador vai ao lado —
  // é a G12 («declara o denominador ao lado do valor»). Sobre o total seria
  // castigar o silêncio como se fosse erro; só sobre as respondidas seria
  // premiar quem se cala. Publicam-se as duas.
  const precisao_respondidas = respondidas ? certas / respondidas : null;
  const precisao_total = total ? certas / total : null;

  const ms = r.linhas.map((l) => l.ms).sort((a, b) => a - b);
  const p50 = ms.length ? ms[Math.floor(ms.length * 0.5)] : null;
  const p95 = ms.length ? ms[Math.floor(ms.length * 0.95)] : null;

  // Onde erra importa: mandar T3 para T0 (subestimar) é o erro caro — trabalho
  // difícil num motor fraco. Sobrestimar só gasta dinheiro.
  const ORD = { T0: 0, T1: 1, T2: 2, T3: 3 };
  let sub = 0, sobre = 0;
  for (const l of r.linhas) {
    if (l.obtido == null || l.obtido === l.esperado) continue;
    const a = ORD[l.obtido], b = ORD[l.esperado];
    if (a == null || b == null) continue;
    if (a < b) sub++; else sobre++;
  }

  // O número que se publica é o LIMPO. O sujo fica ao lado, e a diferença
  // entre os dois é a medida exacta do quanto o gabarito me favorecia.
  const limpas = r.linhas.filter((l) => !l.coautorada);
  const limpasCertas = limpas.filter((l) => l.obtido === l.esperado).length;
  const coa = r.linhas.filter((l) => l.coautorada);

  return {
    ...r,
    total, respondidas, certas, sem_resposta: semResposta,
    precisao_respondidas, precisao_total,
    n_limpas: limpas.length,
    certas_limpas: limpasCertas,
    precisao_limpa: limpas.length ? limpasCertas / limpas.length : null,
    n_coautoradas: coa.length,
    certas_coautoradas: coa.filter((l) => l.obtido === l.esperado).length,
    subestimou: sub, sobrestimou: sobre,
    ms_p50: p50, ms_p95: p95,
  };
}

/** Custo equivalente a preço de tabela. `n/d` quando o SSOT não tem o preço. */
export function custoEquivalente(res, { PRICES, modeloNuvem = 'claude-opus-5' }) {
  const pr = precoDe(PRICES, res.modelo);
  const medido = pr ? custoUsd(pr, res.tokens_in, res.tokens_out) : null;

  // «E se isto corresse na nuvem?» — só se calcula quando há tokens medidos.
  const prNuvem = precoDe(PRICES, modeloNuvem);
  const seNuvem = (prNuvem && (res.tokens_in || res.tokens_out))
    ? custoUsd(prNuvem, res.tokens_in, res.tokens_out) : null;

  return {
    usd_medido: res.tokens_in === 0 && res.tokens_out === 0 ? 0 : medido,
    usd_medido_porque: (res.tokens_in === 0 && res.tokens_out === 0)
      ? 'zero tokens — não houve chamada a modelo nenhum'
      : (medido == null ? `sem preço para «${res.modelo}» no SSOT — n/d` : null),
    usd_se_nuvem: seNuvem,
    usd_se_nuvem_modelo: modeloNuvem,
    usd_se_nuvem_porque: seNuvem == null
      ? 'sem tokens medidos ou sem preço no SSOT — n/d, nunca estimado'
      : `equivalente a preço de tabela de ${modeloNuvem} — NÃO é despesa`,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Render
// ─────────────────────────────────────────────────────────────────────────────

const pct = (x) => (x == null ? 'n/d' : `${(x * 100).toFixed(1)}%`);
const usd = (x) => (x == null ? 'n/d' : `$${x.toFixed(4)}`);
const ms = (x) => (x == null ? 'n/d' : `${x.toFixed(1)}ms`);

export function imprimir(resultados, meta) {
  const L = [];
  L.push('');
  L.push('  A/B · MOOTER vs SEM MOOTER — tokens medidos, gold anterior ao teste');
  L.push('  ' + '─'.repeat(72));
  L.push(`  dataset   ${meta.n} de ${meta.total_gold} amostras · ${meta.dataset}`);
  if (meta.coautoradas) {
    L.push(`  excluídas ${meta.coautoradas} co-autoradas com o classify.js (rótulo e afinação no mesmo commit)`);
  }
  L.push(`  corrido   ${meta.ts}`);
  L.push('');
  L.push('  BRAÇO                             LIMPA  TODAS   SUB SOBRE   TOKENS     p50');
  for (const r of resultados) {
    const nome = r.braco.padEnd(34).slice(0, 34);
    L.push(`  ${nome} ${pct(r.precisao_limpa).padStart(6)} ${pct(r.precisao_total).padStart(6)} ${String(r.subestimou).padStart(5)} ${String(r.sobrestimou).padStart(7)} ${String(r.tokens_in + r.tokens_out).padStart(9)} ${ms(r.ms_p50).padStart(8)}`);
  }
  L.push('');
  L.push('  CUSTO');
  for (const r of resultados) {
    L.push(`    ${r.braco}`);
    L.push(`      medido: ${usd(r.custo.usd_medido)}${r.custo.usd_medido_porque ? '  (' + r.custo.usd_medido_porque + ')' : ''}`);
    if (r.custo.usd_se_nuvem != null) {
      L.push(`      se corresse em ${r.custo.usd_se_nuvem_modelo}: ${usd(r.custo.usd_se_nuvem)} — ${r.custo.usd_se_nuvem_porque}`);
    }
  }
  L.push('');
  L.push('  SEM RESPOSTA (nem certo nem errado — contado à parte, nunca como acerto)');
  for (const r of resultados) L.push(`    ${r.braco.padEnd(34).slice(0, 34)} ${r.sem_resposta}`);
  L.push('');
  return L.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

export async function correr(opts = {}) {
  const gold = opts.holdout ? holdout() : JSON.parse(fs.readFileSync(GOLD, 'utf8'));
  const amostras = opts.n ? gold.slice(0, opts.n) : gold;
  const { PRICES, ok: temPrecos, porque: semPrecos } = precos();
  const modelo = opts.modelo || 'qwen2.5-coder:14b';

  const b = contabilizar(bracoMooter(amostras));
  const a1 = contabilizar(bracoSemRouter(amostras));
  const a2 = contabilizar(await bracoLlm(amostras, { modelo, callImpl: opts.callImpl }));

  const resultados = [a1, a2, b].map((r) => ({ ...r, custo: custoEquivalente(r, { PRICES }) }));

  return {
    ts: new Date().toISOString(),
    n: amostras.length,
    total_gold: gold.length,
    // Derivada, nunca cravada: o `--holdout` lê OUTRO ficheiro, e a linha de
    // proveniência de um recibo é a única que não pode estar errada.
    dataset: opts.holdout
      ? 'tools/router/validation-set.json (2026-04-15)'
      : 'tools/router/gold-labels.json (2026-04-11)',
    coautoradas: amostras.filter((a) => a.coautorada).length,
    precos_ssot: temPrecos ? 'tools/router/pricing.js' : `n/d (${semPrecos})`,
    resultados,
  };
}

/**
 * N corridas do mesmo ensaio, com a mediana derivada — nunca escrita à mão.
 *
 * Existe porque a peça pública dizia «mediana de 6 corridas» e o repositório
 * guardava uma. Um número cuja única fonte é a mensagem de um commit não é
 * auditável, e auditabilidade é literalmente o que o produto vende.
 */
export async function correrVarias(opts = {}, n = 1) {
  const corridas = [];
  for (let i = 0; i < n; i++) corridas.push(await correr(opts));

  const mediana = (xs) => {
    const v = xs.filter((x) => x != null).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  };

  const bracos = corridas[0].resultados.map((r) => r.braco);
  const resumo = bracos.map((braco, i) => {
    const lim = corridas.map((c) => c.resultados[i].precisao_limpa);
    const tot = corridas.map((c) => c.resultados[i].precisao_total);
    return {
      braco,
      corridas: n,
      precisao_limpa_mediana: mediana(lim),
      precisao_limpa_min: Math.min(...lim.filter((x) => x != null)),
      precisao_limpa_max: Math.max(...lim.filter((x) => x != null)),
      precisao_limpa_por_corrida: lim,
      precisao_total_mediana: mediana(tot),
      identico_em_todas: new Set(lim.map((x) => (x == null ? 'n/d' : x.toFixed(6)))).size === 1,
    };
  });

  return { ts: corridas[0].ts, corridas: n, dataset: corridas[0].dataset,
    coautoradas: corridas[0].coautoradas, resumo, detalhe: corridas };
}

const ESTE = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(ESTE)) {
  const argv = process.argv.slice(2);
  const iM = argv.indexOf('--modelo');
  const iN = argv.indexOf('--n');
  const iC = argv.indexOf('--corridas');
  const vezes = iC >= 0 ? Math.max(1, Number(argv[iC + 1]) || 1) : 1;
  const op = {
    modelo: iM >= 0 ? argv[iM + 1] : undefined,
    n: iN >= 0 ? Number(argv[iN + 1]) : undefined,
    holdout: argv.includes('--holdout'),
  };
  (vezes > 1 ? correrVarias(op, vezes) : correr(op)).then((r) => {
    if (argv.includes('--json')) { console.log(JSON.stringify(r, null, 2)); process.exit(0); }
    if (r.resumo) {
      console.log('');
      console.log(`  ${r.corridas} corridas · ${r.dataset} · ${r.coautoradas} co-autoradas excluídas`);
      console.log('  ' + '─'.repeat(72));
      for (const b of r.resumo) {
        const f = (x) => (x == null ? 'n/d' : `${(x * 100).toFixed(1)}%`);
        console.log(`  ${b.braco.padEnd(34).slice(0, 34)} mediana ${f(b.precisao_limpa_mediana).padStart(6)}` +
          `  faixa ${f(b.precisao_limpa_min)}–${f(b.precisao_limpa_max)}` +
          (b.identico_em_todas ? '  (idêntico nas ' + b.corridas + ')' : ''));
      }
      console.log('');
      process.exit(0);
    }
    console.log(imprimir(r.resultados, r));
    process.exit(0);
  }).catch((e) => {
    console.error(`ab falhou: ${(e && e.message) || e}`);
    process.exit(1);
  });
}
