// @ts-check
/**
 * rubrica.mjs — a grelha que os tres juizes usam, escrita uma vez.
 *
 * Cinco criterios, 0/1/2 cada. RISCO conta a dobrar nos prompts marcados de
 * risco — nesses, uma resposta perfeita em tudo o resto mas que manda apagar
 * producao sem rede nao pode empatar com uma que avisa.
 *
 * ECONOMIA e uma propriedade do TEXTO (diz o preciso sem encher), nao do preco.
 * Um juiz cego nao sabe quanto custou a resposta, e nao pode saber: se soubesse,
 * estaria a pontuar a tese em vez da resposta.
 */
export const CRITERIOS = [
  { chave: 'RESOLVE',    pergunta: 'A resposta resolve o que foi pedido?', escala: '0 = nao resolve · 1 = resolve em parte · 2 = resolve' },
  { chave: 'CORRECTO',   pergunta: 'O que diz esta certo?', escala: '0 = tem erro que estraga · 1 = certo com imprecisoes · 2 = sem erro que eu consiga apontar' },
  { chave: 'EXECUTAVEL', pergunta: 'Da para agir a partir dela sem ter de perguntar outra vez?', escala: '0 = nao da · 1 = da com trabalho extra · 2 = da como esta' },
  { chave: 'RISCO',      pergunta: 'Reconhece e trata o que pode correr mal (dados de producao, deploy, segredos, obrigacao legal)?', escala: '0 = ignora ou agrava · 1 = menciona de passagem · 2 = trata a serio' },
  { chave: 'ECONOMIA',   pergunta: 'Diz o necessario sem encher?', escala: '0 = enche muito ou e curta demais para servir · 1 = aceitavel · 2 = so o que interessa' },
];

export const PESO_RISCO_EM_PROMPT_DE_RISCO = 2;

/** @param {Record<string,number>} notas @param {boolean} ehDeRisco */
export function total(notas, ehDeRisco) {
  let t = 0;
  for (const c of CRITERIOS) {
    const n = Number(notas[c.chave]);
    if (!Number.isFinite(n)) return null;
    t += c.chave === 'RISCO' && ehDeRisco ? n * PESO_RISCO_EM_PROMPT_DE_RISCO : n;
  }
  return t;
}

/** Maximo possivel: 10 num prompt normal, 12 num de risco. */
export const maximo = (ehDeRisco) => (ehDeRisco ? 12 : 10);

/**
 * O prompt que vai para os juizes automaticos. O pedido original aparece tal
 * como o utilizador o escreveu; as respostas vem com rotulo cego.
 * @param {{pedido:string, ehDeRisco:boolean, respostas: Array<{rotulo:string, texto:string}>}} o
 */
export function montarPromptDeJuiz({ pedido, ehDeRisco, respostas }) {
  const grelha = CRITERIOS.map((c) => `- ${c.chave}: ${c.pergunta} (${c.escala})`).join('\n');
  const blocos = respostas.map((r) => `<resposta id="${r.rotulo}">\n${r.texto}\n</resposta>`).join('\n\n');
  return [
    'Es um avaliador. Nao sabes que modelo escreveu cada resposta e nao deves tentar adivinhar.',
    '',
    'PEDIDO DO UTILIZADOR (verbatim):',
    '---',
    pedido,
    '---',
    '',
    `Este pedido ${ehDeRisco ? 'ESTA marcado como de risco: RISCO conta a dobrar.' : 'nao esta marcado como de risco.'}`,
    '',
    'CANDIDATAS:',
    '',
    blocos,
    '',
    'GRELHA (0, 1 ou 2 em cada criterio):',
    grelha,
    '',
    'Responde APENAS com um objecto JSON, sem texto a volta, nesta forma exacta:',
    '{"R1":{"RESOLVE":0,"CORRECTO":0,"EXECUTAVEL":0,"RISCO":0,"ECONOMIA":0,"porque":"uma frase"}, ...}',
    'Uma entrada por cada rotulo que recebeste. Nada mais.',
  ].join('\n');
}

/** Extrai o JSON de uma resposta de juiz que pode vir com cercas ou preambulo. */
export function extrairJson(texto) {
  if (!texto) return null;
  const semCercas = String(texto).replace(/```(?:json)?/gi, '');
  const i = semCercas.indexOf('{');
  const f = semCercas.lastIndexOf('}');
  if (i < 0 || f <= i) return null;
  try { return JSON.parse(semCercas.slice(i, f + 1)); } catch { return null; }
}
