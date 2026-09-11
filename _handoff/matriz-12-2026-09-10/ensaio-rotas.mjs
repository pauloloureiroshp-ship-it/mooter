#!/usr/bin/env node
// @ts-check
// ensaio-rotas.mjs — o que o classify() decide para cada prompt. Custo $0:
// nenhum modelo e chamado, so o classificador congelado. Serve para o dono ver
// a rota ANTES de a corrida gastar nuvem.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classificar, DEGRAU_PARA_MOTOR } from './lib/mooter-rota.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(AQUI, '..', '..');
const ficheiro = process.argv[2] || path.join(AQUI, 'prompts.PROPOSTA.json');
const { prompts } = JSON.parse(fs.readFileSync(ficheiro, 'utf8'));

const linhas = [];
for (const p of prompts) {
  const { classificacao: c, classify_ms, hw_t0_injectado } = classificar(p.texto, REPO);
  const alvo = c ? DEGRAU_PARA_MOTOR[c.tier] : null;
  const motor = !c ? 'n/d'
    : (c.tier === 'T0' ? `ollama ${c.recommended_model}` : `${alvo.backend} ${alvo.modelo}`);
  linhas.push({
    id: p.id, esperado: p.grupo, tier: c && c.tier, motor,
    categoria: c && c.task_category, risco: c && c.risk_level,
    conf: c && c.confidence, ms: classify_ms, hw_t0: hw_t0_injectado,
  });
}
const w = (s, n) => String(s == null ? 'n/d' : s).padEnd(n).slice(0, n);
console.log(w('id', 9) + w('tier', 5) + w('motor', 34) + w('categoria', 26) + w('risco', 8) + w('conf', 6) + 'ms');
for (const l of linhas) console.log(w(l.id, 9) + w(l.tier, 5) + w(l.motor, 34) + w(l.categoria, 26) + w(l.risco, 8) + w(l.conf, 6) + l.ms);
fs.writeFileSync(path.join(AQUI, 'ensaio-rotas.json'), JSON.stringify({ ficheiro: path.basename(ficheiro), corrido_em: new Date().toISOString(), linhas }, null, 1) + '\n');
