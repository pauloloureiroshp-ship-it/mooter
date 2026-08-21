/**
 * prova-de-pilar.mjs — um pilar calado esta certo, ou esta partido?
 *
 * O PROBLEMA QUE ISTO RESOLVE.
 *
 * O relatorio de classes (`classes-da-fila.mjs`) apanhou tres pilares ACTIVOS a
 * responder `sem-achado` em 100% de 455 rondas cada — 1365 rondas de GPU com
 * output zero. Mas silencio e ambiguo: ou nao ha mesmo nada, ou o detector nao
 * detecta. Contar rondas nunca distingue os dois.
 *
 * A unica coisa que distingue e SEMEAR um defeito do tipo exacto que o pilar diz
 * procurar, e ver se ele o encontra. Com um CONTROLO limpo ao lado, porque um
 * pilar que acusa tudo tambem nao serve.
 *
 *     semeado    controlo    leitura
 *     acha       calado      o pilar FUNCIONA — o silencio em producao e correcto
 *     calado     calado      o pilar esta PARTIDO — diz sempre a mesma coisa
 *     acha       acha        dispara por reflexo — nao discrimina
 *     calado     acha        incoerente — investigar o fixture
 *
 * RESULTADO MEDIDO PARA O P8 (2026-08-21, qwen2.5-coder:14b):
 *
 *     ficheiro semeado (alocador.mjs, janela 1-57)  -> "NO FINDING"   4 tokens
 *     controlo         (medidor.mjs,  janela 1-58)  -> "NO FINDING"   4 tokens
 *
 * Resposta byte a byte identica: **zero discriminacao**. E nao e do harness — o
 * mesmo prompt enviado a mao ao mesmo modelo devolve o mesmo. Nem e do modelo:
 * perguntado DIRECTAMENTE ("um dos campos nunca volta a aparecer, qual e?") ele
 * responde `tempo_estimado_s (linha 32)` em 13 tokens, correcto a primeira.
 *
 * **O que impede o P8 e o enunciado do P8.** Com os 3 passos ele emite a saida
 * de emergencia em 4 tokens sem fazer trabalho nenhum; sem o contrato de saida
 * do sistema chega aos 163 tokens e FAZ os passos, mas o STEP 2 e falso — copia
 * as linhas do STEP 1 como se fossem leituras, em vez de procurar.
 *
 * Uso:
 *   node tools/cockpit/runner/prova-de-pilar.mjs --escrever <dir>
 *     escreve o par semeado/controlo do P8 num repo de ensaio
 */

import fs from 'node:fs';
import path from 'node:path';

/**
 * Os pares de prova, por pilar.
 *
 * `semeado` tem UM defeito do tipo que o pilar declara procurar; `controlo` tem
 * a mesma forma e nenhum. Nenhum dos dois pode dizer que e um fixture — um
 * comentario a apontar o defeito ensina a resposta e invalida a prova. (Foi
 * preciso reescrever o primeiro par por causa disso.)
 */
export const PARES = {
  P8: {
    procura: 'campo escrito num objecto e nunca lido no mesmo excerto',
    semeado: {
      caminho: 'tools/cockpit/runner/alocador.mjs',
      // `tempo_estimado_s` e escrito e nunca volta a aparecer. Todos os outros
      // campos do `plano` sao lidos mais abaixo.
      campo: 'tempo_estimado_s',
      texto: `/**
 * alocador.mjs — decide quanto da GPU cabe a cada job.
 *
 * Parte do runner: monta o plano de VRAM de cada job antes de ele entrar na fila.
 * O plano viaja para o conductor, que o ordena e despacha.
 */

import os from 'node:os';

export const VRAM_TOTAL_GB = 24;
export const RESERVA_SISTEMA_GB = 2;

/** Quanto sobra depois da reserva do sistema. */
export function vramDisponivel(totalGb = VRAM_TOTAL_GB) {
  return Math.max(0, totalGb - RESERVA_SISTEMA_GB);
}

/** Monta o plano de alocacao para um job. */
export function planoDeAlocacao(job, { totalGb = VRAM_TOTAL_GB, agora = 0 } = {}) {
  const disponivel = vramDisponivel(totalGb);

  const plano = {
    modelo: job.modelo || 'qwen2.5-coder:14b',
    vram_gb: Math.min(job.vram_pedida_gb || 8, disponivel),
    prioridade: job.urgente ? 1 : 5,
    tempo_estimado_s: Math.round((job.tokens_esperados || 2000) / 40),
    criado_em: agora,
  };

  if (plano.vram_gb <= 0) {
    return { ok: false, motivo: 'sem VRAM disponivel', modelo: plano.modelo };
  }

  if (plano.prioridade === 1 && plano.vram_gb < 4) {
    plano.vram_gb = Math.min(4, disponivel);
  }

  return {
    ok: true,
    modelo: plano.modelo,
    vram_gb: plano.vram_gb,
    prioridade: plano.prioridade,
    criado_em: plano.criado_em,
    host: os.hostname(),
  };
}
`,
    },
    controlo: {
      caminho: 'tools/cockpit/runner/medidor.mjs',
      texto: `/**
 * medidor.mjs — resume as amostras de GPU de uma ronda.
 *
 * Le o que o sampler escreveu e devolve a media, o maximo e se a placa saturou.
 */

import os from 'node:os';

export const JANELA_S = 300;
export const MINIMO_AMOSTRAS = 3;

/** Quantas amostras cabem na janela. */
export function amostrasNaJanela(intervaloS, janelaS = JANELA_S) {
  return Math.max(0, Math.floor(janelaS / Math.max(1, intervaloS)));
}

/** Resume as amostras de uma ronda. */
export function resumirRonda(amostras, { janelaS = JANELA_S, agora = 0 } = {}) {
  const cabem = amostrasNaJanela(5, janelaS);

  const resumo = {
    total: amostras.length,
    soma_util: amostras.reduce((s, a) => s + (a.util_pct || 0), 0),
    maximo: amostras.reduce((m, a) => Math.max(m, a.util_pct || 0), 0),
    janela_s: janelaS,
    criado_em: agora,
  };

  if (resumo.total < MINIMO_AMOSTRAS) {
    return { ok: false, motivo: 'amostras a menos', janela_s: resumo.janela_s };
  }

  const media = resumo.soma_util / resumo.total;
  const saturado = resumo.maximo >= 95;

  return {
    ok: true,
    media_pct: Math.round(media),
    maximo_pct: resumo.maximo,
    total: resumo.total,
    janela_s: resumo.janela_s,
    criado_em: resumo.criado_em,
    cabem_na_janela: cabem,
    saturado,
    host: os.hostname(),
  };
}
`,
    },
  },
};

/** Escreve o par de prova de um pilar num repo de ensaio. Devolve os caminhos. */
export function escreverPar(pilar, destino, { writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync } = {}) {
  const par = PARES[pilar];
  if (!par) throw new Error(`sem par de prova para ${pilar} (ha: ${Object.keys(PARES).join(', ')})`);
  const out = {};
  for (const papel of ['semeado', 'controlo']) {
    const f = par[papel];
    const abs = path.join(destino, f.caminho);
    mkdirImpl(path.dirname(abs), { recursive: true });
    writeImpl(abs, f.texto);
    out[papel] = abs;
  }
  return out;
}

/**
 * O veredicto, a partir do que as duas rondas devolveram.
 *
 * `achouNoSemeado` tem de ser verificado contra o NOME do campo semeado, nao
 * contra "houve achado": um pilar que acha outra coisa qualquer no ficheiro
 * semeado nao encontrou o defeito, encontrou ruido.
 */
export function veredicto({ pilar, respostaSemeado, respostaControlo }) {
  const par = PARES[pilar];
  const campo = par && par.semeado.campo;
  const achou = Boolean(campo) && new RegExp(campo).test(String(respostaSemeado || ''));
  const acusouControlo = !/\b(NO FINDING|SEM ACHADO)\b/i.test(String(respostaControlo || ''));

  if (achou && !acusouControlo) {
    return { estado: 'funciona', porque: `encontrou ${campo} no semeado e ficou calado no controlo` };
  }
  if (!achou && !acusouControlo) {
    return {
      estado: 'partido',
      porque: `nao encontrou ${campo} no ficheiro semeado, e deu a MESMA resposta no controlo — nao discrimina`,
    };
  }
  if (achou && acusouControlo) {
    return { estado: 'dispara-por-reflexo', porque: 'acusou tambem o controlo limpo' };
  }
  return { estado: 'incoerente', porque: 'calado no semeado e a acusar o controlo — rever o fixture' };
}

function principal() {
  const i = process.argv.indexOf('--escrever');
  if (i === -1) {
    console.log('uso: node tools/cockpit/runner/prova-de-pilar.mjs --escrever <dir> [--pilar P8]');
    return;
  }
  const destino = process.argv[i + 1];
  const pi = process.argv.indexOf('--pilar');
  const pilar = pi === -1 ? 'P8' : process.argv[pi + 1];
  const out = escreverPar(pilar, destino);
  console.log(`par de prova do ${pilar} escrito:`);
  console.log(`  semeado  : ${out.semeado}   (defeito: ${PARES[pilar].semeado.campo})`);
  console.log(`  controlo : ${out.controlo}`);
  console.log(`\ncorre o pilar contra ${destino} com MOOTER_REPO e foco em ${pilar}.`);
}

if (process.argv[1] && process.argv[1].endsWith('prova-de-pilar.mjs')) principal();
