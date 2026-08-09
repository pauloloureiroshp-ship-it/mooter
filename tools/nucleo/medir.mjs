#!/usr/bin/env node
/**
 * medir.mjs — corre (candidato x corpus) contra Ollama local e grava a cadeia.
 *
 *   node tools/nucleo/prereg.mjs                       # 1. pregar o corpus
 *   node tools/nucleo/medir.mjs \                      # 2. medir
 *     --candidatos qwen2.5:3b,qwen2.5-coder:7b \
 *     --skill responde-so-o-valor@qwen2.5:3b \
 *     --out .mooter/medicoes/ledger.jsonl
 *
 * Custo: $0 (GPU do dono). Nenhuma chamada cloud, nenhuma quota consumida.
 *
 * O passo 1 nao e opcional: sem pre-registo para o corpus_sha exacto, isto
 * recusa correr. E o portao anti-cherry-pick.
 *
 * O que este runner NAO faz, de proposito:
 *   - seed: nao envia nenhuma. Gravar uma seed que nunca foi verificada seria
 *     registar uma garantia por medir. Fica `seed: "n/d"`.
 *   - determinismo: nunca foi medido (uma corrida por par). Fica `"n/d"`.
 *   - sandbox: `packages/spawn-orchestrator/src/sandbox/detect.ts:52` devolve
 *     `available:false` fora de linux/darwin. Fica `sandbox: "n/d"`.
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  carregarCorpus, avaliar, selar, escreverLedger, carregarPrefixo, guardarSaida,
  CLASSES_CANDIDATO, DOUTRINA_CONTEUDO_IMPORTADO, NUCLEO_VERSAO, SCHEMA,
} from './nucleo.mjs';
import { lerPrereg } from './prereg.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

/**
 * Skills disponiveis. Cada uma e conteudo tratado como DADO: um prefixo
 * concatenado no prompt do candidato medido, com teto de tokens imposto por
 * carregarPrefixo(). Nunca system prompt do host, nunca codigo executado.
 * Ver DOUTRINA_CONTEUDO_IMPORTADO em nucleo.mjs.
 */
const SKILLS = {
  'responde-so-o-valor': {
    prefixo: 'Responde apenas com o valor pedido. Sem explicacao, sem preambulo, sem markdown.\n\n',
  },
};

const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const TIMEOUT_MS = Number(process.env.NUCLEO_TIMEOUT_MS || 120000);

/**
 * Config de amostragem. Vai para dentro do `ambiente` de cada registo: e ela que
 * determina o resultado, portanto omiti-la da cadeia seria esconder metade da
 * causa. `num_predict` tambem serve para detectar truncagem: tokens_out igual ao
 * tecto significa resposta cortada, e uma resposta cortada que na mesma "acerta"
 * merece ser vista com desconfianca.
 */
const AMOSTRAGEM = { temperature: 0, num_predict: 256 };

function args(argv) {
  const o = { candidatos: [], skills: [], out: null, corpus: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--candidatos') o.candidatos = String(argv[++i] || '').split(',').filter(Boolean);
    else if (a === '--skill') o.skills.push(String(argv[++i] || ''));
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--corpus') o.corpus = argv[++i];
  }
  return o;
}

async function chamarOllama(model, prompt) {
  const inicio = Date.now();
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${OLLAMA}/api/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt, stream: false, options: AMOSTRAGEM }),
      signal: ac.signal,
    });
    if (!r.ok) return { erro: `HTTP ${r.status}`, latencia_ms: Date.now() - inicio };
    const j = await r.json();
    return {
      texto: j.response ?? '',
      // Contagens reais devolvidas pelo motor — nunca estimadas por caracteres.
      tokens_in: Number.isFinite(j.prompt_eval_count) ? j.prompt_eval_count : null,
      tokens_out: Number.isFinite(j.eval_count) ? j.eval_count : null,
      latencia_ms: Date.now() - inicio,
    };
  } catch (e) {
    return { erro: e.name === 'AbortError' ? `timeout ${TIMEOUT_MS}ms` : e.message, latencia_ms: Date.now() - inicio };
  } finally {
    clearTimeout(t);
  }
}

export function montarCandidatos(o) {
  const candidatos = [];
  for (const m of o.candidatos) {
    candidatos.push({ id: m, classe_candidato: 'modelo', host_model: m, skill_sha: null, prefixo: '' });
  }
  for (const spec of o.skills) {
    const [nome, host] = spec.split('@');
    const skill = SKILLS[nome];
    if (!skill) throw new Error(`skill desconhecida: ${nome} (conhecidas: ${Object.keys(SKILLS).join(', ')})`);
    if (!host) throw new Error(`skill ${nome} sem host: usa ${nome}@<modelo>`);
    const p = carregarPrefixo(skill.prefixo); // faz cumprir o teto de tokens
    candidatos.push({
      id: `skill:${nome}@${host}`, classe_candidato: 'skill_prefixo',
      host_model: host, skill_sha: p.sha, prefixo: p.texto, prefixo_tokens: p.tokens_aprox,
    });
  }
  for (const c of candidatos) {
    const classe = CLASSES_CANDIDATO[c.classe_candidato];
    if (!classe || !classe.suportada) {
      throw new Error(`classe de candidato nao suportada: ${c.classe_candidato} — ${classe?.o_que_e ?? 'desconhecida'}`);
    }
  }
  if (candidatos.length < 2) throw new Error('preciso de >=2 candidatos para haver o que comparar');
  return candidatos;
}

async function main() {
  const o = args(process.argv.slice(2));
  const corpus = carregarCorpus(o.corpus || path.join(AQUI, 'corpus.json'));

  // Portao anti-cherry-pick: sem pre-registo para ESTE sha, nao corre.
  const prereg = lerPrereg(corpus.corpus_sha);
  if (!prereg) {
    throw new Error(
      `SEM PRE-REGISTO para corpus_sha ${corpus.corpus_sha.slice(0, 12)}.\n` +
      '  O corpus prega-se ANTES de se saber quem corre contra ele.\n' +
      '  Corre: node tools/nucleo/prereg.mjs',
    );
  }

  const candidatos = montarCandidatos(o);
  const saida = o.out || path.join(os.homedir(), '.mooter', 'medicoes', 'ledger.jsonl');

  const ambiente = {
    corpus_sha: corpus.corpus_sha,
    prereg_em: prereg.registado_em,
    // A corrida declara os seus candidatos. Sem isto, apagar um candidato
    // inteiro do ledger era invisivel — o pre-registo (de proposito) nao os
    // prega, portanto nao havia contra o que comparar.
    candidatos: candidatos.map((c) => c.id).sort(),
    nucleo_versao: NUCLEO_VERSAO,
    transporte: `ollama ${OLLAMA}`,
    amostragem: AMOSTRAGEM,
    sandbox: DOUTRINA_CONTEUDO_IMPORTADO.classe_1_prompt_do_candidato.sandbox,
    host: `${os.platform()} ${os.arch()}`,
  };

  const registos = [];
  let seq = 0;
  let prev = null;

  for (const c of candidatos) {
    for (const tarefa of corpus.tarefas) {
      const r = await chamarOllama(c.host_model, c.prefixo + tarefa.prompt);
      const veredito = r.erro
        ? { sucesso: null, motivo: `execucao falhou: ${r.erro}` }
        : avaliar(tarefa.verificacao, r.texto);

      const registo = selar({
        seq: seq++,
        schema: SCHEMA,
        candidato_id: c.id,
        classe_candidato: c.classe_candidato,
        host_model: c.host_model,
        skill_sha: c.skill_sha,
        tarefa_id: tarefa.id,
        categoria: tarefa.categoria,
        dificuldade: tarefa.dificuldade,
        tier: tarefa.tier,
        sucesso: veredito.sucesso,
        motivo: veredito.motivo,
        // A saida fica na cadeia para que `sucesso` seja RE-DERIVAVEL: qualquer
        // pessoa recorre o grader sobre ela e tem de obter o mesmo veredito (C8).
        ...guardarSaida(r.texto ?? ''),
        truncado: r.tokens_out != null && r.tokens_out >= AMOSTRAGEM.num_predict,
        tokens_in: r.tokens_in ?? null,
        tokens_out: r.tokens_out ?? null,
        latencia_ms: r.latencia_ms,
        custo_usd: 0,
        seed: 'n/d',
        determinismo: 'n/d',
        ambiente,
        timestamp: new Date().toISOString(),
        prev_hash: prev,
      });
      prev = registo.record_hash;
      registos.push(registo);
      const marca = registo.sucesso === true ? 'ok  ' : registo.sucesso === false ? 'FALHA' : 'n/d ';
      process.stdout.write(`${marca} ${c.id} · ${tarefa.id} (${tarefa.dificuldade}) · ${registo.latencia_ms}ms\n`);
    }
  }

  escreverLedger(saida, registos);
  process.stdout.write(`\n${registos.length} registos · ${saida}\ncorpus_sha ${corpus.corpus_sha.slice(0, 12)} · pre-registado ${prereg.registado_em}\n`);
}

if (process.argv[1]?.endsWith('medir.mjs')) {
  main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
}
