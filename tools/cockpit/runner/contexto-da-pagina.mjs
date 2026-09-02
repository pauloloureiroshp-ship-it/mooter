/**
 * contexto-da-pagina.mjs — o Moo passa a ver a pagina que o dono esta a ver.
 *
 * ── O DEFEITO ───────────────────────────────────────────────────────────────
 *
 * A doca do Ledger mandava `{mensagem}` e nada mais. O sistema do `assist.mjs`
 * diz, com todas as letras: «You can only see what is quoted to you in the
 * question.» Era verdade, e por isso a pergunta obvia — «quantas citacoes
 * conferidas ha nesta janela?» — so tinha duas respostas possiveis: `n/d`, ou
 * um numero inventado. O snapshot estava a QUATRO variaveis de distancia, no
 * `S` da propria pagina.
 *
 * ── PORQUE O CLIENTE MANDA OS DADOS, E PORQUE ISSO NAO E UMA PORTA ──────────
 *
 * A alternativa era o servidor reconstruir o snapshot ao receber a pergunta.
 * Recusada: a pagina foi renderizada de um snapshot com data, e um snapshot
 * novo daria numeros diferentes dos que o dono tem a frente. A resposta
 * deixaria de ser sobre a pagina — que e a coisa toda que se pede aqui.
 *
 * Mandar dados do cliente para dentro de um prompt e, em geral, uma porta de
 * injeccao. Aqui nao e, e a razao e estrutural e nao uma promessa:
 *
 *   · o endpoint aceita um objecto TIPADO, nunca texto livre;
 *   · cada campo esta numa lista fechada (`CAMPOS`) com um tipo declarado;
 *   · numeros passam por `Number()` — o que nao for numero e DESCARTADO, nao
 *     coagido;
 *   · textos sao cortados a 64 caracteres e perdem newlines, crases e o par
 *     `{}`, que sao as tres formas de fingir uma nova seccao de prompt;
 *   · quem monta a frase e o SERVIDOR. O cliente nunca escolhe uma palavra.
 *
 * O que sobra que o cliente controla e o VALOR de um numero numa lista fixa —
 * e mentir sobre o proprio painel, na propria maquina, para o proprio modelo
 * local, nao e uma escalada de privilegio: e o dono a enganar-se a si proprio,
 * que ja podia fazer editando o HTML.
 *
 * PURO: sem fs, sem relogio, sem rede.
 */

/**
 * Os campos que o Moo pode ver. Lista FECHADA — um campo novo entra aqui, com
 * uma frase em ingles que diz o que ele e. A frase importa: o modelo responde
 * com as palavras que lhe dermos, e «cited_verified» nao e uma palavra.
 */
export const CAMPOS = Object.freeze([
  { k: 'device', t: 'texto', diz: 'device this page belongs to' },
  { k: 'generated_at', t: 'texto', diz: 'when this snapshot was taken (UTC)' },
  { k: 'owner_tz', t: 'texto', diz: 'owner timezone' },
  { k: 'window_lines', t: 'numero', diz: 'lines in the ledger on disk' },
  { k: 'window_receipts', t: 'numero', diz: 'receipts in this window' },
  { k: 'cited_verified', t: 'numero', diz: 'verified citations in this window (receipts whose cited line was checked and exists)' },
  { k: 'refuted', t: 'numero', diz: 'refuted receipts in this window (the cited line does not exist)' },
  { k: 'uncited', t: 'numero', diz: 'receipts in this window with no citation' },
  { k: 'no_finding', t: 'numero', diz: 'rounds in this window that found nothing' },
  { k: 'inconclusive', t: 'numero', diz: 'receipts in this window with no verdict this build understands' },
  { k: 'triage_total', t: 'numero', diz: 'findings that reached triage' },
  { k: 'triage_pending', t: 'numero', diz: 'findings still waiting for the owner' },
  { k: 'triage_accepted', t: 'numero', diz: 'findings the owner accepted' },
  { k: 'triage_issues', t: 'numero', diz: 'findings the owner turned into issues' },
  { k: 'triage_dismissed', t: 'numero', diz: 'findings the owner dismissed' },
  { k: 'night_rounds', t: 'numero', diz: 'OVERNIGHT ONLY, a subset of the window: rounds run between 00:00 and 08:00 owner time' },
  { k: 'night_cited', t: 'numero', diz: 'OVERNIGHT ONLY, a subset of the window: verified citations between 00:00 and 08:00 owner time' },
  { k: 'night_tokens_out', t: 'numero', diz: 'OVERNIGHT ONLY: output tokens spent between 00:00 and 08:00 owner time, all local' },
  { k: 'night_usd', t: 'numero', diz: 'US dollars the loop spent (structurally 0: local engine only)' },
  { k: 'prs_abertos', t: 'numero', diz: 'open pull requests on GitHub' },
  { k: 'ci_idade_s', t: 'numero', diz: 'seconds since the CI/PR block was measured' },
  { k: 'fleet_devices', t: 'numero', diz: 'devices in the fleet' },
  { k: 'connector', t: 'texto', diz: 'connector version this checkout ships' },
]);

const PORCHAVE = new Map(CAMPOS.map((c) => [c.k, c]));

/** Quanto texto um campo de texto pode trazer. Um rotulo, nunca um paragrafo. */
export const MAX_TEXTO = 64;

/**
 * Limpa um texto que vai entrar num prompt.
 *
 * Newline, crase e chaveta sao as tres formas baratas de fingir que comeca
 * uma seccao nova. Nao se escapam — apagam-se: nenhum valor legitimo desta
 * lista (um nome de device, uma versao, uma data ISO) precisa de nenhum deles.
 */
export function limparTexto(v) {
  return String(v)
    .replace(/[\r\n\u2028\u2029\t]+/g, ' ')
    .replace(/[`{}]/g, '')
    .trim()
    .slice(0, MAX_TEXTO);
}

/**
 * Do que o cliente mandou para o que o servidor aceita.
 *
 * @returns {{valores: Object, descartados: string[]}}
 */
export function normalizar(bruto) {
  const valores = {}; const descartados = [];
  if (!bruto || typeof bruto !== 'object' || Array.isArray(bruto)) {
    return { valores, descartados: ['o corpo não trazia um objecto de página'] };
  }
  for (const [k, v] of Object.entries(bruto)) {
    const campo = PORCHAVE.get(k);
    if (!campo) { descartados.push(`${k} (não está na lista)`); continue; }
    if (v === null || v === undefined) continue;   // ausente é ausente, não é zero
    if (campo.t === 'numero') {
      const n = Number(v);
      // ⚠️ NÃO coagir. `Number('')` é 0 e `Number(true)` é 1: aceitar isso
      // punha um zero inventado no prompt, que é a única coisa que este
      // sistema não pode fazer.
      if (typeof v !== 'number' || !Number.isFinite(n)) { descartados.push(`${k} (não é um número)`); continue; }
      valores[k] = n;
    } else {
      if (typeof v !== 'string') { descartados.push(`${k} (não é texto)`); continue; }
      const limpo = limparTexto(v);
      if (limpo) valores[k] = limpo;
    }
  }
  return { valores, descartados };
}

/**
 * O bloco que vai para o prompt. Escrito pelo SERVIDOR, campo a campo.
 *
 * A ultima linha e a que faz a diferenca entre um assistente util e uma
 * fabrica de numeros: sem ela, uma pergunta sobre uma coisa que nao esta na
 * lista tem uma resposta plausivel e errada a espera.
 */
export function blocoDaPagina(valores) {
  const linhas = [];
  for (const c of CAMPOS) {
    if (!Object.prototype.hasOwnProperty.call(valores, c.k)) continue;
    linhas.push(`- ${c.diz}: ${valores[c.k]}`);
  }
  if (!linhas.length) return null;
  return [
    '',
    'SNAPSHOT OF THE PAGE THE OWNER IS LOOKING AT.',
    'This is the complete list of what you can see. There is nothing else.',
    'Lines marked OVERNIGHT ONLY are a subset. A question about "this window" is NOT about them.',
    '',
    ...linhas,
    '',
    'If the question asks for anything that is NOT one of the lines above, answer exactly "n/d"',
    'and say which measurement would be needed. Never estimate, never derive a number that is not listed.',
    '',
  ].join('\n');
}

/** Quantos campos a pagina conseguiu mandar, dos que existem. */
export function cobertura(valores) {
  return { tem: Object.keys(valores).length, de: CAMPOS.length };
}
