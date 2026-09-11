#!/usr/bin/env node
// @ts-check
/**
 * julgar.mjs — J1 (Codex) e J2 (Sonnet 5) pontuam as respostas as cegas.
 *
 *   node _handoff/matriz-12-2026-09-10/julgar.mjs [--so=ID] [--juiz=J1|J2]
 *
 * Familias diferentes de proposito: J1 corre em OpenAI e J2 em Anthropic, por
 * isso nenhum dos dois esta a julgar-se a si proprio nos bracos A/B/C (todos
 * Anthropic) nem no D (OpenAI). Nao ha juiz que nao tenha conflito nenhum: J2 e
 * da mesma familia de 3 dos 5 candidatos, e isso fica escrito no verdict.md
 * como limitacao — nao se corrige com um terceiro modelo, corrige-se com o J3
 * humano.
 *
 * A ordem em que cada juiz ve as respostas vem do sorteio semeado pelo sha do
 * pre-registo: reproduzivel por qualquer pessoa, escolhida por ninguem.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chamarClaude } from './lib/claude-call.mjs';
import { chamarCodex } from './lib/codex-call.mjs';
import { baralhar } from './lib/cego.mjs';
import { montarPromptDeJuiz, extrairJson, total, maximo, CRITERIOS } from './lib/rubrica.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ARENA = path.join(os.tmpdir(), 'matriz12-arena');
const RESULTS = path.join(AQUI, 'results');
const JUIZES = path.join(AQUI, 'juizes');
fs.mkdirSync(JUIZES, { recursive: true });

const argv = process.argv.slice(2);
const SO = (argv.find((a) => a.startsWith('--so=')) || '').slice(5) || null;
const SO_JUIZ = (argv.find((a) => a.startsWith('--juiz=')) || '').slice(7) || null;

const prereg = JSON.parse(fs.readFileSync(path.join(AQUI, 'protocol.json'), 'utf8'));
const SEMENTE = prereg.semente_do_sorteio;
if (!SEMENTE) { console.error('protocol.json sem semente_do_sorteio'); process.exit(2); }
const prompts = JSON.parse(fs.readFileSync(path.join(AQUI, 'prompts.json'), 'utf8')).prompts;

const JUIZ = {
  J1: { motor: 'codex', modelo: 'gpt-6-astra', familia: 'OpenAI' },
  J2: { motor: 'claude', modelo: 'claude-sonnet-5', familia: 'Anthropic' },
};

function perguntar(juiz, prompt) {
  if (JUIZ[juiz].motor === 'codex') {
    const r = chamarCodex({ prompt, cwd: ARENA, model: JUIZ[juiz].modelo, effort: 'medium' });
    return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out, ms: r.decorrido_ms };
  }
  const r = chamarClaude({ prompt, model: JUIZ[juiz].modelo, cwd: ARENA, timeoutMs: 300000 });
  return { texto: r.texto, ok: r.ok, motivo: r.motivo, tokens_in: r.tokens_in, tokens_out: r.tokens_out, cache_creation: r.cache_creation, cache_read: r.cache_read, ms: r.decorrido_ms };
}

const alvo = SO ? prompts.filter((p) => p.id === SO) : prompts;
for (const p of alvo) {
  const fRes = path.join(RESULTS, `${p.id}.json`);
  if (!fs.existsSync(fRes)) { console.log(`- ${p.id}: sem resultados — saltado`); continue; }
  const res = JSON.parse(fs.readFileSync(fRes, 'utf8'));

  const comTexto = Object.entries(res.bracos)
    .filter(([, v]) => v && typeof v.texto === 'string' && v.texto.trim().length > 0)
    .map(([k]) => k);
  if (comTexto.length < 2) { console.log(`- ${p.id}: menos de 2 respostas com texto — nada a julgar`); continue; }

  const { rotulos, chave } = baralhar(comTexto, SEMENTE, p.id);
  const respostas = comTexto.map((b) => ({ rotulo: rotulos[b], texto: res.bracos[b].texto }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo));
  const promptDeJuiz = montarPromptDeJuiz({ pedido: p.texto, ehDeRisco: !!p.risco, respostas });

  const dest = path.join(JUIZES, `${p.id}.json`);
  const jaFeito = fs.existsSync(dest) ? JSON.parse(fs.readFileSync(dest, 'utf8')) : { id: p.id, chave, notas: {} };

  for (const juiz of ['J1', 'J2']) {
    if (SO_JUIZ && juiz !== SO_JUIZ) continue;
    if (jaFeito.notas[juiz]) { console.log(`- ${p.id} ${juiz}: ja existe — saltado`); continue; }
    process.stdout.write(`  ${p.id} ${juiz}…`);
    const r = perguntar(juiz, promptDeJuiz);
    const j = extrairJson(r.texto);
    const notas = {};
    if (j) {
      for (const [rotulo, v] of Object.entries(j)) {
        const braco = chave[rotulo];
        if (!braco) continue;
        const n = {};
        for (const c of CRITERIOS) n[c.chave] = Number(v[c.chave]);
        notas[braco] = { rotulo, ...n, porque: v.porque || null, total: total(n, !!p.risco), maximo: maximo(!!p.risco) };
      }
    }
    jaFeito.notas[juiz] = {
      motor: JUIZ[juiz], ok: r.ok && Object.keys(notas).length === comTexto.length,
      motivo: r.motivo || (j ? (Object.keys(notas).length === comTexto.length ? null : 'juiz nao pontuou todos os rotulos') : 'resposta do juiz nao trazia JSON'),
      notas, bruto: r.texto, custo_tokens: { in: r.tokens_in, out: r.tokens_out, cache_write: r.cache_creation || 0, cache_read: r.cache_read || 0 }, ms: r.ms,
    };
    fs.writeFileSync(dest, JSON.stringify(jaFeito, null, 1) + '\n');
    console.log(` ${jaFeito.notas[juiz].ok ? 'ok' : 'FALHOU: ' + jaFeito.notas[juiz].motivo}`);
  }
  fs.writeFileSync(path.join(JUIZES, `${p.id}.prompt-de-juiz.txt`), promptDeJuiz);
}
console.log('notas em ' + JUIZES);
