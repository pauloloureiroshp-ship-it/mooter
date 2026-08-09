#!/usr/bin/env node
/**
 * medir.mjs — corre (candidato x corpus) contra Ollama local e grava a cadeia.
 *
 *   node tools/nucleo/medir.mjs \
 *     --candidatos qwen2.5:3b,qwen2.5-coder:7b \
 *     --skill responde-so-o-valor@qwen2.5:3b \
 *     --out .mooter/medicoes/ledger.jsonl
 *
 * Custo: $0 (GPU do dono). Nenhuma chamada cloud, nenhuma quota consumida.
 *
 * O que este runner NAO faz, de proposito:
 *   - seed: nao envia nenhuma. Gravar uma seed que nunca foi verificada seria
 *     registar uma garantia por medir. Fica `seed: "n/d"`.
 *   - determinismo: nunca foi medido (uma corrida por par). Fica `"n/d"`.
 *   - sandbox: `packages/spawn-orchestrator/src/sandbox/detect.ts:52` devolve
 *     `available:false` fora de linux/darwin. Fica `sandbox: "n/d"` no ambiente.
 */

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  carregarCorpus, avaliar, selar, escreverLedger,
  shaDaSkill, NUCLEO_VERSAO, SCHEMA,
} from './nucleo.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const SKILLS = {
  'responde-so-o-valor': {
    // Conteudo importado tratado como DADO: e um prefixo de prompt medido,
    // nunca codigo executado nem system prompt privilegiado.
    prefixo: 'Responde apenas com o valor pedido. Sem explicacao, sem preambulo, sem markdown.\n\n',
  },
};

const OLLAMA = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const TIMEOUT_MS = Number(process.env.NUCLEO_TIMEOUT_MS || 120000);

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
      body: JSON.stringify({
        model, prompt, stream: false,
        options: { temperature: 0, num_predict: 256 },
      }),
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

async function main() {
  const o = args(process.argv.slice(2));
  const corpus = carregarCorpus(o.corpus || path.join(AQUI, 'corpus.json'));
  const saida = o.out || path.join(os.homedir(), '.mooter', 'medicoes', 'ledger.jsonl');

  const candidatos = [];
  for (const m of o.candidatos) {
    candidatos.push({ id: m, tipo: 'modelo', host_model: m, skill_sha: null, prefixo: '' });
  }
  for (const spec of o.skills) {
    const [nome, host] = spec.split('@');
    const skill = SKILLS[nome];
    if (!skill) throw new Error(`skill desconhecida: ${nome} (conhecidas: ${Object.keys(SKILLS).join(', ')})`);
    if (!host) throw new Error(`skill ${nome} sem host: usa ${nome}@<modelo>`);
    candidatos.push({
      id: `skill:${nome}@${host}`, tipo: 'skill', host_model: host,
      skill_sha: shaDaSkill(skill.prefixo), prefixo: skill.prefixo,
    });
  }
  if (candidatos.length < 2) throw new Error('preciso de >=2 candidatos para haver o que comparar');

  const ambiente = {
    corpus_sha: corpus.corpus_sha,
    nucleo_versao: NUCLEO_VERSAO,
    transporte: `ollama ${OLLAMA}`,
    sandbox: 'n/d',
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
        tipo: c.tipo,
        host_model: c.host_model,
        skill_sha: c.skill_sha,
        tarefa_id: tarefa.id,
        categoria: tarefa.categoria,
        tier: tarefa.tier,
        sucesso: veredito.sucesso,
        motivo: veredito.motivo,
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
      process.stdout.write(`${marca} ${c.id} · ${tarefa.id} · ${registo.latencia_ms}ms\n`);
    }
  }

  escreverLedger(saida, registos);
  process.stdout.write(`\n${registos.length} registos · ${saida}\ncorpus_sha ${corpus.corpus_sha.slice(0, 12)}\n`);
}

main().catch((e) => { process.stderr.write(`${e.message}\n`); process.exit(1); });
