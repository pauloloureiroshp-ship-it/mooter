'use strict';

/**
 * sinal-valor.js — a única pergunta que separa "eles gostaram" de "eles pagam".
 *
 * PORQUÊ:
 * O produto tem 0 clientes e 0 receita, e a nota de "produto para o mundo" é 4/10. A causa não é
 * falta de funcionalidades — é que ninguém de fora respondeu nunca à pergunta que interessa. Sem
 * isto, "tração" é uma palavra sem denominador.
 *
 * O QUE ISTO É:
 * Um caderninho local. Guarda respostas em `~/.mooter/sinal-valor.jsonl`, uma por linha,
 * append-only. Calcula o agregado a partir do que lá está e **nunca** extrapola.
 *
 * O QUE ISTO NÃO É, e é deliberado:
 * - **Não transmite nada.** Não há `http` neste ficheiro. O manifest promete que o conector não
 *   envia telemetria automática; um recolector de opiniões que ligasse para casa tornaria essa
 *   frase falsa.
 * - **Não infere intenção.** Ninguém "provavelmente pagaria". Ou respondeu, ou é `n/d`.
 * - **Não conta o autor.** Uma resposta com `origem:"autor"` fica registada mas sai FORA do
 *   agregado público: o Paulo a dizer que pagaria pelo Mooter não é sinal de mercado. Amigos
 *   contam, mas separados dos estranhos — é sinal mais macio, e o agregado di-lo.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const MOOTER_DIR = path.join(os.homedir(), '.mooter');
const FICHEIRO = path.join(MOOTER_DIR, 'sinal-valor.jsonl');

/** As duas perguntas. Curtas de propósito: uma pergunta longa não é respondida. */
const PERGUNTAS = {
  outra_vez: 'Usarias isto outra vez amanhã?',
  pagarias: 'Pagarias $19/mês por isto, hoje, como está?',
};

const ORIGENS = ['autor', 'amigo', 'estranho'];

/**
 * Regista uma resposta. `usaria` e `pagaria` são true/false/null (null = não respondeu).
 * Devolve o que gravou, ou o motivo de não ter conseguido — nunca lança.
 */
function registar(resposta, opts) {
  const o = opts || {};
  const ficheiro = o.ficheiro || FICHEIRO;
  const r = resposta || {};
  if (!ORIGENS.includes(r.origem)) {
    return { ok: false, porque: 'origem tem de ser uma de: ' + ORIGENS.join(', ') + ' — sem isso o agregado não sabe separar sinal macio de sinal duro' };
  }
  const linha = {
    ts: o.agora || new Date().toISOString(),
    origem: r.origem,
    usaria: r.usaria === true ? true : r.usaria === false ? false : null,
    pagaria: r.pagaria === true ? true : r.pagaria === false ? false : null,
    preco_mensal_usd: typeof r.preco_mensal_usd === 'number' ? r.preco_mensal_usd : null,
    // Texto livre, do próprio. Nunca reescrito, nunca resumido por um modelo.
    comentario: typeof r.comentario === 'string' && r.comentario.trim() ? r.comentario.trim().slice(0, 1000) : null,
    // Sem nome, sem email, sem identificador de pessoa. Se o Paulo quiser saber quem disse o quê,
    // isso vive no caderno dele, não aqui.
    instalacao: r.instalacao === true,
  };
  try {
    fs.mkdirSync(path.dirname(ficheiro), { recursive: true });
    fs.appendFileSync(ficheiro, JSON.stringify(linha) + '\n', 'utf8');
    return { ok: true, gravado: linha, ficheiro };
  } catch (e) {
    return { ok: false, porque: 'não consegui escrever em ' + ficheiro + ': ' + ((e && e.code) || (e && e.message) || String(e)) };
  }
}

function lerTodas(ficheiro) {
  const f = ficheiro || FICHEIRO;
  let txt = null;
  try { txt = fs.readFileSync(f, 'utf8'); }
  catch (erro) {
    // Um ficheiro que nunca existiu significa mesmo zero respostas. Qualquer
    // outra falha é medição desconhecida, não uma colecção vazia.
    return erro && erro.code === 'ENOENT' ? [] : null;
  }
  const out = [];
  for (const l of txt.split(/\r?\n/)) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* linha corrompida — saltada, nunca inventada */ }
  }
  return out;
}

/**
 * O agregado. **Zero respostas ⇒ `n/d`, nunca 0%.** A diferença importa: 0% diz "perguntámos e
 * ninguém quer"; `n/d` diz "nunca perguntámos" — e hoje a verdade é a segunda.
 */
function agregado(opts) {
  const o = opts || {};
  const todas = lerTodas(o.ficheiro);
  if (todas === null) {
    const desconhecida = {
      valor: null,
      porque: 'n/d — não consegui ler o registo de respostas',
      denominador: null,
    };
    // Fazer `.filter()` sobre o neutro antigo fabricava todas estas contagens a
    // zero. A receita real continua zero: não depende deste ficheiro de sinais.
    return {
      total_respostas: null,
      do_autor: null,
      de_amigos: null,
      de_estranhos: null,
      usaria_outra_vez: { ...desconhecida },
      pagaria: { ...desconhecida },
      pagaria_estranhos: { ...desconhecida },
      disposicao_a_pagar_declarada: null,
      receita_real_usd: 0,
      receita_nota: 'receita REAL é 0 e não se confunde com disposição declarada — ninguém pagou nada até hoje',
      perguntas: PERGUNTAS,
      resumo: '🐮 sinal de valor: n/d — não consegui ler o registo de respostas.',
    };
  }
  const externas = todas.filter((r) => r.origem !== 'autor');
  const estranhos = todas.filter((r) => r.origem === 'estranho');
  const amigos = todas.filter((r) => r.origem === 'amigo');

  const taxa = (lista, campo) => {
    const respondidas = lista.filter((r) => r[campo] === true || r[campo] === false);
    if (!respondidas.length) {
      return { valor: null, porque: 'n/d — ' + (lista.length ? lista.length + ' resposta(s) registada(s), nenhuma respondeu a esta pergunta' : 'ninguém respondeu ainda') , denominador: 0 };
    }
    const sim = respondidas.filter((r) => r[campo] === true).length;
    return {
      valor: Number(((sim / respondidas.length) * 100).toFixed(1)),
      porque: sim + ' de ' + respondidas.length + ' respostas',
      denominador: respondidas.length,
    };
  };

  const pagantes = todas.filter((r) => r.pagaria === true && r.origem !== 'autor').length;

  return {
    total_respostas: todas.length,
    do_autor: todas.length - externas.length,
    de_amigos: amigos.length,
    de_estranhos: estranhos.length,
    // O agregado público EXCLUI o autor. É a única forma de o número significar alguma coisa.
    usaria_outra_vez: taxa(externas, 'usaria'),
    pagaria: taxa(externas, 'pagaria'),
    // Sinal duro: só estranhos. Amigos dizem sim por educação.
    pagaria_estranhos: taxa(estranhos, 'pagaria'),
    // Isto é o número que decide se há negócio. Não é uma taxa: é uma contagem.
    disposicao_a_pagar_declarada: pagantes,
    receita_real_usd: 0,
    receita_nota: 'receita REAL é 0 e não se confunde com disposição declarada — ninguém pagou nada até hoje',
    perguntas: PERGUNTAS,
    resumo: todas.length === 0
      ? '🐮 sinal de valor: n/d — 0 pessoas responderam. Não é 0%, é "nunca perguntámos".'
      : '🐮 sinal de valor: ' + externas.length + ' resposta(s) de fora ('
        + estranhos.length + ' estranho(s), ' + amigos.length + ' amigo(s)) · '
        + 'pagaria: ' + (taxa(externas, 'pagaria').valor === null ? 'n/d' : taxa(externas, 'pagaria').valor + '%')
        + ' · receita real: $0',
  };
}

/**
 * O convite a fazer a pergunta, para o fim do welcome board. Só aparece a quem JÁ trabalhou —
 * perguntar "pagarias?" a quem ainda não viu nada é pedir um palpite, não um sinal.
 */
function convite(jaTrabalhou) {
  if (!jaTrabalhou) return null;
  return 'Uma pergunta honesta, e fica só nesta máquina: ' + PERGUNTAS.outra_vez
    + ' E ' + PERGUNTAS.pagarias + ' Responde com `node sinal-valor.js` — ou diz que não, que é informação igualmente útil.';
}

module.exports = { registar, agregado, lerTodas, convite, PERGUNTAS, ORIGENS, FICHEIRO };

// CLI mínima: `node sinal-valor.js` mostra o agregado; com argumentos, regista.
if (require.main === module) {
  const args = process.argv.slice(2);
  if (!args.length) { console.log(agregado().resumo); process.exit(0); }
  const [origem, usaria, pagaria, ...resto] = args;
  const r = registar({
    origem,
    usaria: usaria === 'sim' ? true : usaria === 'nao' ? false : null,
    pagaria: pagaria === 'sim' ? true : pagaria === 'nao' ? false : null,
    comentario: resto.join(' ') || null,
    instalacao: true,
  });
  console.log(r.ok ? '🐮 registado · ' + agregado().resumo : '🔴 ' + r.porque);
  console.log('uso: node sinal-valor.js <autor|amigo|estranho> <sim|nao|-> <sim|nao|-> [comentário]');
}
