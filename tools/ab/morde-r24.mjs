#!/usr/bin/env node
/**
 * morde-r24.mjs — a prova de que os testes do EXECUTOR do R-24 servem.
 *
 * Uso: node tools/ab/morde-r24.mjs   (exit 0 sse TODOS os defeitos forem apanhados)
 *
 * Gémeo do `morde-use-ab.mjs`, que faz o mesmo ao controlador congelado. A
 * razão de existir é a mesma, e já custou caro várias vezes neste repositório:
 * uma guarda sem teste de mordida não é uma guarda. Um teste que nunca viu o
 * defeito que diz apanhar é decoração verde.
 *
 * Cada defeito abaixo é uma reescrita mínima do executor — o tipo de
 * simplificação que alguém faria de boa-fé — e nomeia o teste que TEM de o
 * apanhar. Se escapar, ou se for apanhado pelo teste ERRADO, sai com 1.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ALVO = path.join(AQUI, 'correr-r24.mjs');
const SUITE = path.join(AQUI, 'correr-r24.test.mjs');

const DEFEITOS = [
  {
    nome: 'o teste de aceitação vem do PAI',
    porque: 'o teste do pai passa sempre no pai — todas as tarefas ficavam inválidas, ou pior, triviais',
    de: "const r = spawnImpl('git', ['show', `${commit}:${testFile}`], {",
    para: "const r = spawnImpl('git', ['show', `${'pai456'}:${testFile}`], {",
    apanhado_por: 'MORDE: o teste de aceitação vem do commit-FILHO',
  },
  {
    nome: 'sem verificação de que o teste falha no pai',
    porque: 'um snapshot podre dá «ON venceu em 0 s» sem ninguém ter feito trabalho nenhum',
    de: "  if (antes.aceite) {\n    return { ok: false, motivo: 'teste_ja_passa_no_pai', sha_teste: shaTeste };\n  }",
    para: '',
    apanhado_por: 'MORDE: se o teste já passa no pai, a tarefa é inválida',
  },
  {
    nome: 'corrida inválida vale o tecto',
    porque: 'transforma uma falha de infra-estrutura num ponto para o braço adversário',
    de: '  if (res.invalido) return null;',
    para: '  if (res.invalido) return tectoS;',
    apanhado_por: 'MORDE: um braço inválido vale null, nunca o tecto',
  },
  {
    nome: 'guardas sem verificação de congelamento',
    porque: 'o manifest podia ser editado a meio das 23 horas e ninguém saberia',
    de: "  const c = verificarCongelamento(prereg, { readImpl: fsImpl.readFileSync });\n  if (!c.ok) return",
    para: "  const c = { ok: true, falhas: [] };\n  if (!c.ok) return",
    apanhado_por: 'MORDE: as guardas recusam se o congelamento cair',
  },
  {
    nome: 'congelamento verificado só no arranque',
    porque: 'validar uma vez e correr 23 horas é validar nada; a janela fica aberta o tempo todo',
    de: "    const g2 = guardas(prereg, { fsImpl, envImpl });\n    if (!g2.ok) { err(`PÁRA a meio: ${g2.motivo}`); return 2; }",
    para: '',
    apanhado_por: 'MORDE: --correr revalida o congelamento a CADA tarefa',
  },
  {
    nome: 'sem dedup de retoma',
    porque: 'repetir um braço é escolher qual das duas medições conta',
    de: "  return new Set(linhas.filter((l) => l.tipo === 'braco').map((l) => chave(l.task_id, l.braco)));",
    para: '  return new Set();',
    apanhado_por: 'MORDE: um braço já no ledger não repete',
  },
  {
    nome: 'aceitação corre na raiz do snapshot',
    porque: 'o teste corria no sítio errado e falhava nos DOIS braços — ruído com aspecto de dados',
    de: '    cwd: path.join(destino, tarefa.acceptance_cwd), comando, args, tectoS, spawnImpl,',
    para: '    cwd: destino, comando, args, tectoS, spawnImpl,',
    apanhado_por: 'MORDE: o teste de aceitação corre em acceptance_cwd, não na raiz',
  },
  {
    nome: 'o cd sobrevive ao parsing',
    porque: 'o primeiro token passaria a ser `cd`, e o comando de aceitação nunca correria',
    de: "  const i = cmd.indexOf('&&');\n  const resto = (i >= 0 ? cmd.slice(i + 2) : cmd).trim();",
    para: '  const resto = cmd.trim();',
    apanhado_por: 'MORDE: dividirComando nunca deixa passar o cd',
  },
  {
    nome: 'snapshot com .git dentro',
    porque: 'com o .git, o braço ON faz `git log --all` e lê o commit-filho: a solução, servida',
    de: "  const ar = spawnImpl('git', ['archive', '--format=tar', parent], {",
    para: "  const ar = spawnImpl('git', ['clone', '--no-checkout', '.', destino], {",
    apanhado_por: 'MORDE: o snapshot vem de git archive e nunca traz .git',
  },
  {
    nome: 'o braço ON também leva --setting-sources',
    porque: 'se os dois braços desligarem o hook, a experiência mede a diferença entre nada e nada',
    de: "    braco, prompt: tarefa.prompt, cwd: destino,",
    para: "    braco: 'OFF', prompt: tarefa.prompt, cwd: destino,",
    apanhado_por: 'MORDE: o braço OFF leva --setting-sources e o ON não',
  },
  {
    nome: 'o controlo prepara a partir do pai',
    porque: 'um controlo que mede a mesma coisa que o instrumento concorda com ele por construcao',
    de: '    repo, parent: tarefa.commit, destino, acceptanceCwd: tarefa.acceptance_cwd, spawnImpl, fsImpl,',
    para: '    repo, parent: tarefa.parent, destino, acceptanceCwd: tarefa.acceptance_cwd, spawnImpl, fsImpl,',
    apanhado_por: 'MORDE: o controlo prepara a partir do FILHO, não do pai',
  },
  {
    nome: 'o controlo aceita um teste que falha no filho',
    porque: 'um teste que não passa no filho torna a vitória do braço ON impossível — mede o ambiente, não o Mooter',
    de: "  if (!r.aceite) return { ok: false, motivo: `teste_nao_passa_no_filho:status=${r.status}` };",
    para: '',
    apanhado_por: 'MORDE: o controlo exige PASSAR, e reprova quando falha',
  },
];

function correrSuite() {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', SUITE], {
    encoding: 'utf8', cwd: path.join(AQUI, '..', '..'),
  });
  const saida = `${r.stdout}\n${r.stderr}`;
  const falhas = [...saida.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
  return { verde: r.status === 0, falhas, saida };
}

const original = fs.readFileSync(ALVO, 'utf8');
let escapou = 0;

console.log('morde-r24 · o defeito plantado no executor tem de ser apanhado\n');

const base = correrSuite();
if (!base.verde) {
  console.error('A suite JÁ está vermelha antes de plantar nada. Corrige isso primeiro.');
  console.error(base.falhas.join('\n'));
  process.exit(1);
}
console.log('  linha de base: suite verde\n');

try {
  for (const d of DEFEITOS) {
    if (!original.includes(d.de)) {
      console.log(`  ⚠ ${d.nome}: âncora não encontrada — o defeito NÃO foi plantado, logo não prova nada`);
      escapou++;
      continue;
    }
    fs.writeFileSync(ALVO, original.replace(d.de, d.para), 'utf8');
    const r = correrSuite();
    const apanhado = r.falhas.some((f) => f.includes(d.apanhado_por));
    if (r.verde) {
      console.log(`  ✖ ESCAPOU  ${d.nome}`);
      console.log(`             ${d.porque}`);
      escapou++;
    } else if (!apanhado) {
      console.log(`  ⚠ apanhado pelo teste ERRADO  ${d.nome}`);
      console.log(`             esperava "${d.apanhado_por}", falhou: ${r.falhas.slice(0, 3).join(' · ')}`);
      escapou++;
    } else {
      console.log(`  ✓ apanhado  ${d.nome}`);
      console.log(`             por "${d.apanhado_por}"`);
    }
  }
} finally {
  fs.writeFileSync(ALVO, original, 'utf8');
}

const fim = correrSuite();
console.log(`\n  restaurado: suite ${fim.verde ? 'verde' : 'VERMELHA — o ficheiro não voltou ao original!'}`);
if (!fim.verde) process.exit(1);

console.log(`\n${escapou === 0 ? `TODOS os ${DEFEITOS.length} defeitos foram apanhados.` : `${escapou} defeito(s) escaparam.`}`);
process.exit(escapou === 0 ? 0 : 1);
