#!/usr/bin/env node
// @ts-check
/**
 * congelar.mjs — escreve o pre-registo. Uma vez, antes da primeira chamada.
 *
 *   node _handoff/matriz-12-2026-09-10/congelar.mjs
 *
 * Recusa-se a correr se protocol.json ja existir: um pre-registo que se pode
 * reescrever nao e um pre-registo. As previsoes sao as do MP, verbatim — nao as
 * escrevo eu, copio-as.
 *
 * A semente do sorteio dos juizes e o sha256 do prompts.json. O MP pede "semente
 * = sha do pre-registo", mas o pre-registo contem a semente: seria circular. O
 * prompts.json e o objecto que o pre-registo congela e existe antes dele, por
 * isso serve o mesmo fim — qualquer pessoa reproduz o sorteio, ninguem o
 * escolheu depois de ver as respostas.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const dest = path.join(AQUI, 'protocol.json');
if (fs.existsSync(dest)) {
  console.error('protocol.json ja existe. Um pre-registo escreve-se uma vez; apaga-o a mao se souberes o que estas a fazer.');
  process.exit(2);
}
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const fPrompts = path.join(AQUI, 'prompts.json');
if (!fs.existsSync(fPrompts)) { console.error('falta prompts.json (o definitivo, nao a PROPOSTA)'); process.exit(2); }
const prompts = JSON.parse(fs.readFileSync(fPrompts, 'utf8')).prompts;
const shaPrompts = sha(fPrompts);
const git = (...a) => (spawnSync('git', a, { encoding: 'utf8', cwd: REPO }).stdout || '').trim();

const protocolo = {
  _schema: 'matriz-12/prereg/1',
  mp: 'MP · MATRIZ 12 — Mooter vs a escolha real do utilizador · 2026-09-10',
  congelado_em: new Date().toISOString(),
  owner_tz: 'America/Sao_Paulo',
  head: git('rev-parse', 'HEAD'),

  prompts_sha256: shaPrompts,
  prompts_n: prompts.length,
  semente_do_sorteio: shaPrompts,

  congelados: {
    'tools/router/classify.js': sha(path.join(REPO, 'tools/router/classify.js')),
    'tools/router/patterns.js': sha(path.join(REPO, 'tools/router/patterns.js')),
  },

  bracos: {
    A: 'Opus 5 (claude-opus-5) — a escolha real do utilizador. PRIMARIO.',
    B: 'Mooter — o degrau que o classify() decide, executado: T0 -> Ollama via router-execute --pin-provider=ollama (tecto 2048 tokens), T1 -> Haiku 4.5, T2 -> Sonnet 5, T3 -> Opus 5.',
    B2: 'igual ao B, mas com o degrau T0 forcado a qwen3:30b. Coluna extra pedida pelo dono (o probe real recomenda qwen2.5-coder:14b). So corre nos T0.',
    C: 'Haiku 4.5 — o adversario barato. SECUNDARIO, declarado.',
    D: 'GPT via Codex CLI (gpt-6-astra, effort medium) — AGENTE COM HARNESS, nao modelo nu. n/d se ficar sem creditos.',
  },

  isolamento: 'todos os bracos de nuvem correm sem settings de user/projecto, sem MCP, sem ferramentas e num cwd vazio. Sem isto o braco A levava o router-hint do Mooter dentro do proprio prompt — e a matriz media o Mooter contra o Mooter.',

  juizes: {
    J1: 'Codex (OpenAI) — familia diferente do J2',
    J2: 'Sonnet 5 (Anthropic)',
    J3: 'humano (Paulo), folha vazia, chave selada com o sha do PACOTE-CEGO.md',
    rubrica: 'RESOLVE · CORRECTO · EXECUTAVEL · RISCO · ECONOMIA, 0/1/2 cada; RISCO a dobrar nos prompts de risco. Maximo 10, ou 12 nos de risco.',
    conflito_declarado: 'o J2 e da mesma familia de 3 dos 5 candidatos (A, B, C). Nao ha juiz sem conflito nenhum; e para isso que existe o J3.',
  },

  previsoes_do_mp_verbatim: {
    ganha_em_custo_com_qualidade_equivalente_ate_1_ponto: ['DATA-1', 'LEGAL-1', 'MKT-2', 'DEV-2', 'LEGAL-3', 'MKT-3'],
    empata_mesmo_modelo: ['DATA-4', 'OPS-4', 'P5'],
    perde: ['MKT-4', 'DATA-3', 'OPS-3'],
    regra_de_paragem: 'se der 12/12 vitorias, o instrumento esta partido: parar e investigar, nao publicar.',
  },

  o_que_ja_se_sabia_antes_de_correr: [
    'O ensaio de rotas (custo $0, so o classify congelado) correu ANTES desta corrida e ja mostrou onde cada prompt cai. Fica escrito aqui para ninguem poder dizer depois que a previsao foi ajustada: as previsoes acima sao as do MP, copiadas, e NAO foram tocadas depois do ensaio.',
    'O ensaio contradiz a rota que o MP supunha em dois sitios: LEGAL-3 e MKT-3 estavam marcados como "degrau do meio (T2)" e o classify manda-os para T0. Isso nao muda a previsao de resultado — muda a razao pela qual ela pode falhar.',
    'O arbiter de Haiku, que existe exactamente para os prompts ambiguos, esta INERTE nesta maquina: arbiter.js e um no-op sem ANTHROPIC_API_KEY, e esta maquina nao tem essa chave (usa OAuth de subscricao). Numa maquina com chave, os prompts de confianca < 0.75 ou categoria ambiguous_* teriam passado por ele e a rota poderia ser outra.',
  ],

  regras: [
    'R1 n/d nunca inventado',
    'R2 sha do classificador intacto (verificado antes da primeira chamada; a corrida para se falhar)',
    'R3 uma corrida — um resultado que ja existe em results/ nao se regrava',
    'R4 as perdas ficam escritas',
    'R5 o adversario corre em motor diferente do autor',
    'R6 sem push sem OK do dono',
    'R7 preco de lista datado e citado; custo da resposta separado do custo faturado',
    'R8 nenhuma percentagem de poupanca, nenhum dolar apresentado como poupado: os dois motores de nuvem correm por subscricao',
  ],
};

fs.writeFileSync(dest, JSON.stringify(protocolo, null, 1) + '\n');
console.log(`pre-registo escrito: ${dest}`);
console.log(`prompts.json sha256 = ${shaPrompts}`);
console.log(`semente do sorteio  = ${shaPrompts.slice(0, 16)}…`);
