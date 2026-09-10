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
const EXPOSICAO = path.join(AQUI, 'r24-exposicao.mjs');
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
    porque: 'validar uma vez e correr 23 horas e validar nada; a janela fica aberta o tempo todo',
    de: '    const g2 = guardas(prereg, { fsImpl, envImpl, spawnImpl, exigirAgente: precisaDeAgente, exigirAmbiente: precisaDeAgente });',
    para: '    const g2 = { ok: true };',
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
    nome: 'o controlo prepara a partir do pai',
    porque: 'um controlo que mede a mesma coisa que o instrumento concorda com ele por construcao',
    de: '    repo, parent: tarefa.commit, destino, acceptanceCwd: tarefa.acceptance_cwd, cacheNm, spawnImpl, fsImpl,',
    para: '    repo, parent: tarefa.parent, destino, acceptanceCwd: tarefa.acceptance_cwd, cacheNm, spawnImpl, fsImpl,',
    apanhado_por: 'MORDE: o controlo prepara a partir do FILHO, não do pai',
  },
  {
    nome: 'o controlo aceita um teste que falha no filho',
    porque: 'um teste que não passa no filho torna a vitória do braço ON impossível — mede o ambiente, não o Mooter',
    de: "  if (!r.aceite) return { ok: false, motivo: `teste_nao_passa_no_filho:status=${r.status}` };",
    para: '',
    apanhado_por: 'MORDE: o controlo exige PASSAR, e reprova quando falha',
  },
  {
    nome: 'erro de spawn conta como derrota do agente',
    porque: 'o defeito real de 2026-09-04: ENOENT nos dois bracos dava 23 pares validos, X=0, PERDEU com p=1,0',
    de: '  const invalido = res.invalido === true || spawnPartido || !exp.ok;',
    para: '  const invalido = res.invalido === true || !exp.ok;',
    apanhado_por: 'MORDE: um erro de spawn é INVÁLIDO, não uma derrota de 1800 s',
  },
  {
    nome: 'sem pre-voo do executavel do agente',
    porque: 'sem ele a corrida arranca, falha 46 vezes em 4 ms cada, e imprime um veredicto',
    de: '  if (exigirAgente) {',
    para: '  if (false) {',
    apanhado_por: 'MORDE: --correr recusa arrancar sem executável do agente',
  },
  {
    nome: 'candidatos sem o exe escondido do npm',
    porque: 'no Windows o claude do PATH e um shim; sem este candidato nunca se resolve nada',
    de: "      cands.push(path.join(d, 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe'));",
    para: '',
    apanhado_por: 'candidatosClaude procura o exe escondido do npm no Windows',
  },
  {
    nome: 'o wrapper de spawn nao reescreve nada',
    porque: 'o controlador congelado tem o nome claude cravado; sem reescrita volta o ENOENT',
    de: '    const alvo = ehAgente && caminho ? caminho : cmd;',
    para: '    const alvo = cmd;',
    apanhado_por: 'MORDE: o spawn da corrida reescreve claude, e só claude',
  },
  {
    nome: 'primarias volta a ler o campo que nao existe',
    porque: 'era o defeito real: prereg.atribuicao.primarias nao existe e todos os modos rebentavam contra o ficheiro a serio',
    de: '  const ids = prereg?.corpus?.primarias;',
    para: '  const ids = prereg?.atribuicao?.primarias;',
    apanhado_por: 'CONTRATO: o executor lê o pré-registo REAL sem rebentar',
  },
  {
    nome: 'ledger sem filtro de identidade',
    porque: 'um ledger de outra geracao era saltado pela retoma e contado pela analise como se fosse desta',
    de: '    && l.seed === prereg.seed',
    para: '    && true',
    apanhado_por: 'MORDE: só as linhas DESTA experiência contam',
  },
  {
    nome: 'linhas ilegiveis engolidas em silencio',
    porque: 'perder um braco sem uma palavra valia uma derrota do ON',
    de: '    try { linhas.push(JSON.parse(l)); } catch { descartadas++; }',
    para: '    try { linhas.push(JSON.parse(l)); } catch { /* engole */ }',
    apanhado_por: 'MORDE: uma linha ilegível no ledger é contada, não engolida',
  },
  {
    nome: 'o teste nao e reinstalado depois do agente',
    porque: 'um agente que apague uma assercao sai com exit 0; um par fabricado leva X=15 a X=16',
    de: '    tocouNoTeste = agora !== antes;',
    para: '    tocouNoTeste = false;',
    apanhado_por: 'MORDE: o teste é reinstalado depois do agente',
  },
  {
    nome: 'o pre-registo deixa de se verificar a si proprio',
    porque: 'o n vinha do unico ficheiro do circuito que o congelamento nao cobria, e mexe nas duas pontas',
    de: "  if (typeof prereg.sha_do_prereg === 'string') {",
    para: '  if (false) {',
    apanhado_por: 'MORDE: mexer no n do pré-registo trava as guardas',
  },
  {
    nome: 'a tranca aceita duas instancias',
    porque: 'a segunda apagava a arvore onde o agente da primeira trabalhava, e o braco saia como derrota honesta',
    de: "    fsImpl.writeFileSync(alvo, JSON.stringify({ pid, agora }), { flag: 'wx' });",
    para: '    fsImpl.writeFileSync(alvo, JSON.stringify({ pid, agora }), {});',
    apanhado_por: 'MORDE: duas instâncias não correm ao mesmo tempo',
  },
  {
    nome: 'o braco OFF tambem leva o hook',
    alvo: 'exposicao',
    porque: 'com os dois bracos a levar o tratamento, a experiencia mede a diferenca entre a mesma coisa e a mesma coisa',
    de: "  if (braco !== 'ON') return base;",
    para: '  if (false) return base;',
    apanhado_por: 'MORDE: os dois braços diferem em UMA chave, e é `hooks`',
  },
  {
    nome: 'exposicao deixa de ser verificada',
    alvo: 'exposicao',
    porque: '«braco mal exposto» era um motivo de invalidez que o pre-registo listava e ninguem calculava',
    de: "  if (braco === 'ON' && !marcaExiste) return { ok: false, motivo: 'braco_mal_exposto:ON_sem_hook' };",
    para: '',
    apanhado_por: 'MORDE: braço mal exposto é INVÁLIDO — nos dois sentidos',
  },
  {
    nome: 'um braco mal exposto conta como resultado',
    porque: 'um ON cujo hook nao disparou e uma corrida sem tratamento — e contava como derrota do ON',
    de: '  const invalido = res.invalido === true || spawnPartido || !exp.ok;',
    para: '  const invalido = res.invalido === true || spawnPartido;',
    apanhado_por: 'MORDE: um ON cujo hook não disparou não conta como derrota',
  },
  {
    nome: 'node_modules volta a ligar ao repositorio vivo',
    porque: 'os bracos correm com bypassPermissions; uma juncao para ~/frugal deixa o agente escrever no repo do dono',
    de: "    const origem = cacheNm ? path.join(cacheNm, 'nm', dir, 'node_modules') : path.join(repo, dir, 'node_modules');",
    para: "    const origem = path.join(repo, dir, 'node_modules');",
    apanhado_por: 'MORDE: o node_modules do snapshot vem do CACHE',
  },
  {
    nome: 'o sha do router pinado deixa de ser verificado',
    porque: 'sem isso as 23 tarefas podiam deixar de partilhar o mesmo tratamento sem ninguem saber',
    de: '  if (shaEsperado && router.sha !== shaEsperado) {',
    para: '  if (false) {',
    apanhado_por: 'MORDE: --correr recusa se o router pinado não bater',
  },
  {
    nome: 'a sonda passa a confiar no exit code',
    porque: 'medido: --version responde 0 com a conta sem credito, com o OAuth expirado e de dentro de uma sessao',
    de: '  const v = validarCorrida(json);',
    para: '  const v = { invalido: false, motivo: null };',
    apanhado_por: 'MORDE: a sonda recusa o que o --version aceita',
  },
  {
    nome: 'o TVA volta a parar quando o agente sai',
    porque: 'o desenho manda contar ate a aceitacao passar; parar antes desconta 5 a 25 s ao braco que passa',
    de: '  return Math.min(res.tva_s + aceitacaoS, tectoS);',
    para: '  return Math.min(res.tva_s, tectoS);',
    apanhado_por: 'MORDE: o TVA inclui o tempo do teste de aceitação',
  },
  {
    nome: 'a chave do arbitro volta a passar para o braco',
    alvo: 'exposicao',
    porque: 'com a chave, o tratamento deixa de ser o classificador congelado e passa a ser um segundo modelo remoto',
    de: "export const PREFIXOS_REMOVIDOS = ['ANTHROPIC_', 'CLAUDE_CODE_', 'MOOTER_'];",
    para: "export const PREFIXOS_REMOVIDOS = ['CLAUDE_CODE_'];",
    apanhado_por: 'MORDE: a chave que liga o árbitro não chega ao braço',
  },
  {
    nome: 'o env limpo deixa de ser passado ao agente',
    porque: 'o correrBraco congelado faz spawn sem env; sem o involucro o terminal inteiro entra',
    de: '    const opcoes = ehAgente && env ? { ...opts, env } : opts;',
    para: '    const opcoes = opts;',
    apanhado_por: 'MORDE: o env limpo vai ao agente e a mais ninguém',
  },
  {
    nome: 'a marca volta a ser escrita antes de delegar',
    alvo: 'exposicao',
    porque: 'era o D4: a marca certificava o involucro, nunca que o tratamento chegou ao agente',
    de: `  "const houveHint = r.status === 0 && saida.includes('router-hint');",`,
    para: `  "const houveHint = true;",`,
    apanhado_por: 'MORDE: o invólucro só marca quando o hint saiu mesmo',
  },
  {
    nome: 'o ambiente deixa de ser revalidado a cada tarefa',
    porque: 'um /crazy-moo numa sessao ao lado, ou a cache de orcamento a renovar-se, muda o tratamento a meio das 23 horas',
    de: "      if (agora[campo] !== ambiente0[campo]) {",
    para: '      if (false) {',
    apanhado_por: 'MORDE: --correr pára quando o ambiente muda a meio',
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

const originais = new Map([[ALVO, fs.readFileSync(ALVO, 'utf8')], [EXPOSICAO, fs.readFileSync(EXPOSICAO, 'utf8')]]);
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
    const alvo = d.alvo === 'exposicao' ? EXPOSICAO : ALVO;
    const original = originais.get(alvo);
    if (!original.includes(d.de)) {
      console.log(`  ⚠ ${d.nome}: âncora não encontrada — o defeito NÃO foi plantado, logo não prova nada`);
      escapou++;
      continue;
    }
    fs.writeFileSync(alvo, original.replace(d.de, d.para), 'utf8');
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
  for (const [f, txt] of originais) fs.writeFileSync(f, txt, 'utf8');
}

const fim = correrSuite();
console.log(`\n  restaurado: suite ${fim.verde ? 'verde' : 'VERMELHA — o ficheiro não voltou ao original!'}`);
if (!fim.verde) process.exit(1);

console.log(`\n${escapou === 0 ? `TODOS os ${DEFEITOS.length} defeitos foram apanhados.` : `${escapou} defeito(s) escaparam.`}`);
process.exit(escapou === 0 ? 0 : 1);
