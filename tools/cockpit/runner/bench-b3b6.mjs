/**
 * bench-b3b6.mjs — B3 (tool-calling) e B6 (fidelidade JSON), $0, só Ollama local.
 *
 * Porque existe: o `runRound` mede B1/B2/B4/B5 mas NÃO exercita ferramentas nem
 * saída estruturada. Sem B3 e B6 o portão de promoção do mapa §3 nunca fecha —
 * com modelo nenhum. Isto não é uma lacuna do Granite: é do instrumento.
 *
 * B3: K=5 tarefas × 5 repetições = 25 chamadas por modelo. A 5.ª tarefa é de
 *     IRRELEVÂNCIA: a resposta certa é NÃO chamar ferramenta nenhuma. É o eixo
 *     que separa um tool-caller de um modelo que chama sempre.
 * B6: 10 pedidos com JSON Schema. Conta parse-ok, schema-ok e enum-ok em separado
 *     — "devolveu JSON" e "devolveu o JSON pedido" são coisas diferentes.
 */
const ENDPOINT = 'http://127.0.0.1:11434';
const TIMEOUT_MS = 90_000;

const TOOLS = [
  { type: 'function', function: { name: 'ler_ficheiro', description: 'Lê um ficheiro do repositório e devolve o conteúdo.',
      parameters: { type: 'object', properties: { caminho: { type: 'string', description: 'caminho relativo à raiz' } }, required: ['caminho'] } } },
  { type: 'function', function: { name: 'procurar', description: 'Procura um padrão de texto dentro de uma pasta.',
      parameters: { type: 'object', properties: { padrao: { type: 'string' }, pasta: { type: 'string' } }, required: ['padrao', 'pasta'] } } },
  { type: 'function', function: { name: 'correr_testes', description: 'Corre a suite de testes de um alvo.',
      parameters: { type: 'object', properties: { alvo: { type: 'string' } }, required: ['alvo'] } } },
  { type: 'function', function: { name: 'git_estado', description: 'Devolve o estado do git do repositório.',
      parameters: { type: 'object', properties: {}, required: [] } } },
];

/** K=5 tarefas. A última é de irrelevância: acertar = NÃO chamar ferramenta. */
const TAREFAS = [
  { id: 'ler',      pedido: 'Preciso de ver o conteúdo de tools/router/pricing.js. Trata disso.', espera: 'ler_ficheiro',  args: ['caminho'] },
  { id: 'procurar', pedido: 'Onde é que a string OLLAMA_CONTEXT_LENGTH aparece dentro da pasta tools? Trata disso.', espera: 'procurar', args: ['padrao', 'pasta'] },
  { id: 'testes',   pedido: 'Corre a suite de testes do alvo tools/router e diz-me o resultado.', espera: 'correr_testes', args: ['alvo'] },
  { id: 'git',      pedido: 'Diz-me como está o git deste repositório neste momento.', espera: 'git_estado', args: [] },
  { id: 'irrelevante', pedido: 'Em duas frases, explica o que é a atenção de janela deslizante num transformer.', espera: null, args: [] },
];

const SCHEMA = {
  type: 'object',
  properties: {
    veredicto: { type: 'string', enum: ['aceite', 'rejeitado', 'inconclusivo'] },
    ficheiro: { type: 'string' },
    linha: { type: 'integer' },
    porque: { type: 'string' },
  },
  required: ['veredicto', 'ficheiro', 'linha', 'porque'],
};

async function chamar(body, { fetchImpl = fetch, endpoint = ENDPOINT, timeoutMs = TIMEOUT_MS } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${endpoint}/api/chat`, {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ stream: false, ...body }),
    });
    if (!res.ok) return { erro: `http ${res.status}` };
    return await res.json();
  } catch (e) {
    return { erro: String((e && e.message) || e).slice(0, 80) };
  } finally { clearTimeout(t); }
}

/** B3 — 25 chamadas por modelo. Devolve o detalhe, nunca só a nota. */
export async function b3({ model, reps = 5, log = () => {}, fetchImpl, endpoint, timeoutMs } = {}) {
  const io = { fetchImpl, endpoint, timeoutMs };
  const det = [];
  for (const tarefa of TAREFAS) {
    for (let r = 0; r < reps; r++) {
      const t0 = Date.now();
      const out = await chamar({ model, tools: TOOLS, messages: [{ role: 'user', content: tarefa.pedido }] }, io);
      const calls = (out && out.message && out.message.tool_calls) || [];
      let ok = false, porque = '';
      if (out.erro) { porque = out.erro; }
      else if (tarefa.espera === null) {
        ok = calls.length === 0;
        porque = ok ? 'nao chamou (certo)' : `chamou ${calls[0]?.function?.name} sem necessidade`;
      } else if (calls.length === 0) { porque = 'nao chamou ferramenta nenhuma'; }
      else {
        const f = calls[0].function || {};
        if (f.name !== tarefa.espera) { porque = `chamou ${f.name}, esperado ${tarefa.espera}`; }
        else {
          let a = f.arguments;
          if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = null; } }
          const faltam = tarefa.args.filter((k) => !a || a[k] === undefined || a[k] === '');
          ok = faltam.length === 0;
          porque = ok ? 'ok' : `faltam args: ${faltam.join(',')}`;
        }
      }
      det.push({ tarefa: tarefa.id, rep: r, ok, porque, ms: Date.now() - t0 });
      log(`    B3 ${model} ${tarefa.id}#${r} ${ok ? '✅' : '❌'} ${porque}`);
    }
  }
  const n = det.length, acertos = det.filter((d) => d.ok).length;
  const porTarefa = {};
  for (const t of TAREFAS) {
    const s = det.filter((d) => d.tarefa === t.id);
    porTarefa[t.id] = `${s.filter((d) => d.ok).length}/${s.length}`;
  }
  return { n, acertos, pct: n ? Math.round((acertos / n) * 1000) / 10 : null, porTarefa, det };
}

/** B6 — parse, schema e enum contados em separado. */
export async function b6({ model, reps = 10, log = () => {}, fetchImpl, endpoint, timeoutMs } = {}) {
  const io = { fetchImpl, endpoint, timeoutMs };
  const det = [];
  for (let r = 0; r < reps; r++) {
    const out = await chamar({
      model, format: SCHEMA,
      messages: [{ role: 'user', content: 'Julga este achado e responde SÓ com o JSON pedido: «a função lerConfig() em tools/router/paths.js linha 42 lê o ficheiro sem try/catch».' }],
    }, io);
    const txt = (out && out.message && out.message.content) || '';
    let parse = false, schema = false, enumOk = false, porque = out.erro || '';
    if (!out.erro) {
      let j = null;
      try { j = JSON.parse(txt); parse = true; } catch { porque = 'nao faz parse'; }
      if (j && typeof j === 'object') {
        const faltam = SCHEMA.required.filter((k) => j[k] === undefined);
        const tipoOk = typeof j.linha === 'number' && typeof j.veredicto === 'string';
        schema = faltam.length === 0 && tipoOk;
        if (!schema) porque = faltam.length ? `faltam: ${faltam.join(',')}` : 'tipo errado (linha nao e inteiro?)';
        enumOk = SCHEMA.properties.veredicto.enum.includes(j.veredicto);
        if (schema && !enumOk) porque = `veredicto fora do enum: ${JSON.stringify(j.veredicto).slice(0, 40)}`;
      }
    }
    det.push({ rep: r, parse, schema, enum: enumOk, porque });
    log(`    B6 ${model} #${r} parse=${parse ? '✅' : '❌'} schema=${schema ? '✅' : '❌'} enum=${enumOk ? '✅' : '❌'} ${porque}`);
  }
  const n = det.length;
  const p = (k) => (n ? Math.round((det.filter((d) => d[k]).length / n) * 1000) / 10 : null);
  return { n, parse_pct: p('parse'), schema_pct: p('schema'), enum_pct: p('enum'), det };
}

export const B3_TAREFAS = TAREFAS.map((t) => t.id);
export { TOOLS, TAREFAS, SCHEMA };
