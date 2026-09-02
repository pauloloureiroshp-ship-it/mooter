/**
 * guardas-do-ci-mordem.test.mjs
 *
 * O irmão do `workflows-parseiam.test.mjs`. Aquele apontou o `blocoPartido` aos
 * ficheiros reais de `.github/workflows/`; este faz o mesmo ao resto do
 * `ci-coerencia.mjs` — `scriptsEmFalta`, `nomeQueMente` e (com um recorte
 * deliberado, explicado abaixo) `runtimeDePublicacao`.
 *
 * PORQUE EXISTE. O módulo exporta seis funções de análise de CI e, até
 * 2026-09-01, **nada no repositório as invocava contra um workflow a sério**. O
 * único chamador era o `ci-coerencia.test.mjs`, que por doutrina própria usa só
 * workflows sintéticos. Seis guardas escritas com cuidado e zero mordidas
 * possíveis: a prova é que o `version-sync.yml` esteve sintacticamente partido
 * três dias, 12 corridas em falha seguidas, e nenhuma delas deu sinal.
 *
 * ═══ A TRIAGEM: quem pode olhar para o real, e quem não pode ═══
 *
 * A proibição do `ci-coerencia.test.mjs` («tudo aqui usa workflows SINTETICOS»)
 * é boa e continua de pé. Ela existe para não ancorar testes em DECISÕES de
 * configuração — que versão de Node se escolhe, que pilares estão ligados —
 * porque essas mudam, e o teste ancorado nelas parte na próxima decisão
 * legítima. A saída da proibição não é ignorá-la: é separar, verificação a
 * verificação, o que é decisão do que é invariante.
 *
 *   `scriptsEmFalta` — INVARIANTE. Um script que o CI manda correr e que não
 *   existe no repo (nem é construído pelo próprio CI) é sempre um defeito. Não
 *   há um dia em que a resposta certa passe a ser «sim, manda correr um
 *   ficheiro que não está lá». Pode olhar para o real, e a asserção é `[]`.
 *
 *   `nomeQueMente` — INVARIANTE. Um passo chamado «Setup Node 20» que instala o
 *   22 é sempre uma mentira; nunca é uma escolha. Pode olhar para o real. Hoje a
 *   classe tem N=0 — nenhum dos 118 passos do repo mete um número de Node no
 *   nome — por isso o valor aqui é de CATRACA, como o próprio módulo diz: só
 *   volta a poder mentir se alguém reintroduzir o número no nome. Uma catraca
 *   vale exactamente o que valer a sua guarda de vacuidade (abaixo).
 *
 *   `runtimeDePublicacao` — DECISÃO, e por isso o veredicto fica sintético. A
 *   docstring do módulo diz-o de frente: «não afirmo que seja um defeito —
 *   publicar no Node mais antigo que se suporta é uma escolha legítima». Um
 *   `assert.deepEqual(divergentes, [])` contra os ficheiros reais ficaria
 *   vermelho no dia em que alguém tomasse essa decisão de propósito, e a
 *   correcção seria apagar o teste. Isso é precisamente o que a proibição do
 *   ficheiro sintético evita.
 *   MAS há um invariante por baixo da decisão, e esse pode olhar para o real: a
 *   comparação tem de ser POSSÍVEL. `divergentes: []` sai em três situações
 *   muito diferentes — (a) toda a gente concorda, (b) não há `test.yml` e
 *   portanto não há referência, (c) nenhum publicador instala Node. Só (a) é
 *   verde; (b) e (c) são n/d vestido de verde — a mesma classe «presença em vez
 *   de cobertura» que fez este ficheiro nascer. O que se afirma aqui contra o
 *   real são as PREMISSAS da medição, nunca o seu veredicto.
 *
 * ═══ VACUIDADE ═══
 *
 * Três destas asserções são `deepEqual(x, [])`, e um `[]` que sai por não se ter
 * lido nada é pior do que não existir: afirma cobertura que não teve. Cada uma
 * leva uma guarda de vacuidade DERIVADA do real (nº de citações de script, nº de
 * passos), e cada guarda leva a sua própria mordida. Os pisos são postos muito
 * abaixo do medido de propósito: são detectores de COLAPSO, não censos — não
 * podem ficar vermelhos porque alguém apagou um workflow legítimo.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  lerWorkflows, scriptsEmFalta, nomeQueMente, runtimeDePublicacao, nodeDe,
} from './ci-coerencia.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const DIR = path.join(RAIZ, '.github', 'workflows');

/** Lê os workflows reais e recusa-se a medir sobre nada. */
function reais(porque) {
  const ws = lerWorkflows(DIR);
  assert.notEqual(ws, null, `${porque}: a pasta de workflows tem de ser legível — n/d não é verde`);
  assert.ok(ws.length > 0, `${porque}: sem workflows lidos, este teste não mediu nada`);
  return ws;
}

/**
 * Quantos caminhos de script o CI cita, ao todo.
 *
 * Não repete a expressão regular do módulo — isso era uma segunda verdade a
 * derivar em silêncio. Usa a injecção que o próprio `scriptsEmFalta` já expõe:
 * com `existsImpl` sempre falso, TODA a citação cai em `faltam` ou em
 * `construidos`, e a soma é o total de citações encontradas.
 */
function contaCitacoes(ws) {
  const t = scriptsEmFalta(ws, RAIZ, { existsImpl: () => false, checkIgnoreImpl: () => false });
  return t.faltam.length + t.construidos.length;
}

// ───────────────────────────── scriptsEmFalta ─────────────────────────────

test('todo o script que o CI real manda correr existe (ou é construído por ele)', () => {
  const ws = reais('scriptsEmFalta');

  // Medido a 2026-09-01: 12 citações em 5 workflows. O piso é 6 — metade — para
  // ser um detector de colapso e não um censo: se alguém migrar as invocações
  // para `npm run`, o número cai e este teste diz que deixou de ver, em vez de
  // passar a verde por não ter olhado para nada.
  const citacoes = contaCitacoes(ws);
  assert.ok(citacoes >= 6,
    `só ${citacoes} citação(ões) de script nos workflows reais — a expressão do módulo ` +
    'deixou de casar com a forma como o CI invoca scripts; este `[]` não mediu nada');

  const { faltam } = scriptsEmFalta(ws, RAIZ);
  const relato = faltam.map((f) => `  ${f.ficheiro} → ${f.alvo}`).join('\n');
  assert.deepEqual(faltam, [],
    `o CI manda correr ${faltam.length} ficheiro(s) que não existem nem são construídos:\n${relato}\n` +
    'Se o caminho for gerado pelo próprio CI, tem de estar no `.gitignore` — é esse o teste ' +
    'mecânico do `ehArtefacto`. Se este teste acusar um artefacto conhecido (por ex. ' +
    '`packages/cli/mooter.js`), confirma que o `git` está disponível: sem ele o módulo assume ' +
    'defeito de propósito, e falha a acusar seria pior.');
});

test('mordida · um script citado que não existe é acusado (defeito plantado em texto REAL)', () => {
  // Derivado da fonte, não escrito à mão: pega no texto verdadeiro de um
  // workflow do repo e adultera uma citação verdadeira. Um controlo cravado à
  // mão pode estar errado da mesma maneira que o instrumento e concordar com
  // ele — foi assim que já se validou um instrumento contra si próprio.
  //
  // Aqui a expressão do módulo aparece repetida, ao contrário do `contaCitacoes`
  // acima: é a única forma de PLANTAR o defeito no sítio certo. A repetição é
  // segura porque o que se afirma a seguir é que o módulo o encontra — se as
  // duas divergirem, este teste fica vermelho em vez de calar.
  const ws = reais('mordida scriptsEmFalta');

  const base = scriptsEmFalta(ws, RAIZ);
  assert.deepEqual(base.faltam, [], 'a mordida parte de um repo limpo — ver o teste acima');

  const alvo = ws.find((w) => /(?:node|bash|sh)\s+tools\/[A-Za-z0-9_./-]+\.(?:m?js|sh)/.test(w.src));
  assert.ok(alvo, 'nenhum workflow real invoca um script de `tools/` — a mordida não tem onde morder');

  const inventado = 'tools/este-ficheiro-nunca-existiu.mjs';
  const adulterado = ws.map((w) => (w !== alvo ? w : {
    ficheiro: w.ficheiro,
    src: w.src.replace(/((?:node|bash|sh)\s+)tools\/[A-Za-z0-9_./-]+\.(?:m?js|sh)/, `$1${inventado}`),
  }));
  assert.notEqual(adulterado.find((w) => w.ficheiro === alvo.ficheiro).src, alvo.src,
    'a adulteração não pegou — a mordida estaria a medir o ficheiro original');

  const mordido = scriptsEmFalta(adulterado, RAIZ);
  assert.ok(mordido.faltam.some((f) => f.alvo === inventado),
    `o defeito plantado (${inventado}) passou despercebido — a guarda não morde`);

  // E o defeito estava mesmo FORA da linha de base: sem isto, «acusou» podia
  // significar apenas «já acusava antes».
  assert.ok(!base.faltam.some((f) => f.alvo === inventado),
    'o defeito plantado já existia na linha de base — a mordida não prova nada');
});

test('mordida · a guarda de vacuidade das citações distingue «zero» de «não li»', () => {
  // Um piso só é guarda se reprovar quando não há nada para contar.
  assert.equal(contaCitacoes([]), 0, 'sem workflows não há citações — e 0 fica abaixo do piso de 6');
  assert.ok(contaCitacoes(reais('vacuidade')) >= 6, 'com os workflows reais, o piso passa');
});

// ────────────────────────────── nomeQueMente ──────────────────────────────

/**
 * Os passos de um workflow, com a posição exacta onde acaba o nome.
 *
 * É a mesma noção de «passo» do `nomeQueMente` (começa num `- name:` e vai até
 * ao próximo), mas com índices, porque a mordida precisa de escrever DENTRO da
 * linha do nome e não à volta dela. Que as duas noções continuem a concordar
 * não é afirmado aqui — é provado pela mordida, que só passa se o passo que
 * este código adultera for o mesmo que a função do módulo vai ler.
 */
function passosComIndice(src) {
  const texto = String(src);
  const marcas = [...texto.matchAll(/^[ \t]*- name:([^\n]*)$/gm)];
  return marcas.map((m, i) => ({
    nome: m[1],
    fimNome: m.index + m[0].length,
    corpo: texto.slice(m.index, i + 1 < marcas.length ? marcas[i + 1].index : undefined),
  }));
}

/** Passos reais, ao todo. */
function contaPassos(ws) {
  return ws.reduce((n, w) => n + passosComIndice(w.src).length, 0);
}

test('nenhum passo do CI real diz um número de Node diferente do que instala', () => {
  const ws = reais('nomeQueMente');

  // 118 passos medidos a 2026-09-01, dos quais ZERO metem um número de Node no
  // nome — logo o `[]` de hoje é honesto mas vazio, e o valor desta asserção é
  // de catraca. O que a impede de ser uma catraca de mentira é este piso: se a
  // forma dos workflows mudar ao ponto de o `split(/^\s*- name:/m)` deixar de
  // encontrar passos, a função passa a não poder ver nada, e é isso que se diz.
  const passos = contaPassos(ws);
  assert.ok(passos >= 20,
    `só ${passos} passo(s) reconhecidos nos workflows reais — o `
    + '`nomeQueMente` deixou de conseguir partir os ficheiros em passos; o `[]` é n/d, não verde');

  const mentiras = nomeQueMente(ws);
  const relato = mentiras.map((m) => `  ${m.ficheiro}: "${m.nome}" diz ${m.diz}, instala ${m.usa}`).join('\n');
  assert.deepEqual(mentiras, [],
    `${mentiras.length} passo(s) com o número de Node errado no nome:\n${relato}\n` +
    'Ou se corrige o nome, ou se tira o número dele — um nome com número tem de dizer a verdade.');
});

test('mordida · um nome de passo com o número errado é acusado (em texto REAL)', () => {
  const ws = reais('mordida nomeQueMente');
  assert.deepEqual(nomeQueMente(ws), [], 'a mordida parte de um repo limpo — ver o teste acima');

  // Encontra um passo verdadeiro que instale Node e acrescenta-lhe ao nome um
  // número que não é o que ele instala. O número instalado sai do próprio
  // ficheiro, lido com o `nodeDe` do módulo: cravá-lo aqui era afirmar de novo
  // uma decisão, e um controlo cravado à mão pode errar igual ao instrumento.
  let alvo = null;
  for (const w of ws) {
    for (const p of passosComIndice(w.src)) {
      const usa = nodeDe(p.corpo);
      if (usa) { alvo = { w, ...p, usa }; break; }
    }
    if (alvo) break;
  }
  assert.ok(alvo, 'nenhum passo real instala Node — a mordida não tem onde morder');

  const mentira = String(Number(alvo.usa) - 2); // qualquer número que não seja o instalado
  assert.notEqual(mentira, alvo.usa);
  // O corte é ANTES do `\r` de um CRLF: um ` 20` posto depois dele partia a
  // linha e a mordida passava a medir outra coisa. (O repo já pagou por CRLF
  // uma vez, no sha congelado do `classify.js`.)
  const corte = alvo.fimNome - (alvo.nome.endsWith('\r') ? 1 : 0);
  const adulterado = ws.map((w) => (w !== alvo.w ? w : {
    ficheiro: w.ficheiro,
    src: `${w.src.slice(0, corte)} ${mentira}${w.src.slice(corte)}`,
  }));
  assert.notEqual(adulterado.find((w) => w.ficheiro === alvo.w.ficheiro).src, alvo.w.src,
    'a adulteração não pegou — a mordida estaria a medir o ficheiro original');

  const mentiras = nomeQueMente(adulterado);
  const apanhada = mentiras.find((m) => m.ficheiro === alvo.w.ficheiro);
  assert.ok(apanhada, `o nome plantado ("…${alvo.nome} ${mentira}") passou despercebido`);
  assert.equal(apanhada.diz, mentira);
  assert.equal(apanhada.usa, alvo.usa);
});

test('mordida · a guarda de vacuidade dos passos distingue «zero» de «não li»', () => {
  assert.equal(contaPassos([]), 0, 'sem workflows não há passos — e 0 fica abaixo do piso de 20');
  assert.equal(contaPassos([{ ficheiro: 'x.yml', src: 'on: push\njobs:\n' }]), 0,
    'um workflow sem passos conta 0 — o piso não se deixa encher por ficheiros quaisquer');
  assert.ok(contaPassos(reais('vacuidade')) >= 20, 'com os workflows reais, o piso passa');
});

// ─────────────────────────── runtimeDePublicacao ───────────────────────────

test('a comparação de runtimes é POSSÍVEL nos workflows reais (a premissa, não o veredicto)', () => {
  const ws = reais('runtimeDePublicacao');
  const { nodeTeste } = runtimeDePublicacao(ws);

  // PREMISSA 1 — existe referência. Sem `test.yml` (ou com um `test.yml` que
  // deixe de declarar `node-version`), a função devolve `divergentes: []` para
  // sempre, e ninguém repara. É o mesmo n/d-vestido-de-verde de que este
  // ficheiro nasceu.
  assert.notEqual(nodeTeste, null,
    'não há referência de runtime: ou o `test.yml` mudou de nome, ou deixou de declarar ' +
    '`node-version`. Sem referência, `runtimeDePublicacao` cala-se para sempre.');

  // PREMISSA 2 — há publicadores, e a função consegue lê-los. Prova-se pelo
  // comportamento, sobre os ficheiros reais: se TODOS os workflows que não são o
  // de teste passassem a instalar outro Node, teria de sair pelo menos uma
  // divergência. Zero aqui quer dizer que o conjunto de publicadores está vazio
  // ou ilegível — e nesse caso o silêncio da função não é informação nenhuma.
  const noutroRuntime = ws.map((w) => (/^test\.ya?ml$/.test(w.ficheiro) ? w : {
    ficheiro: w.ficheiro,
    src: String(w.src).replace(/(?<a>node-version:\s*['"]?)[0-9]+/g, '$<a>18'),
  }));
  const { divergentes } = runtimeDePublicacao(noutroRuntime);
  assert.ok(divergentes.length >= 1,
    'nenhum workflow real é reconhecido como publicador com Node legível — ' +
    'o `divergentes: []` do dia-a-dia não estaria a afirmar concordância nenhuma');

  // E o VEREDICTO fica de fora, de propósito: ver a triagem no topo. Publicar
  // num runtime diferente daquele em que se testa é uma decisão legítima; o que
  // não pode é ser acidente, e é a divergência ficar VISÍVEL (no `principal()`
  // do módulo) que trata disso — não um teste que a proíbe.
});

test('mordida · sem `test.yml`, `divergentes: []` não é prova de concordância', () => {
  // Esta é a razão de ser da premissa 1, demonstrada: a mesma resposta vazia
  // sai de um repo em concordância e de um repo onde não se mediu nada.
  const ws = reais('mordida runtimeDePublicacao');
  const semReferencia = ws.filter((w) => !/^test\.ya?ml$/.test(w.ficheiro));
  assert.equal(semReferencia.length, ws.length - 1, 'era suposto haver exactamente um `test.yml`');

  const r = runtimeDePublicacao(semReferencia);
  assert.equal(r.nodeTeste, null);
  assert.deepEqual(r.divergentes, [],
    'o `[]` sai à mesma sem referência — por isso a premissa 1 é asserida à parte');
});
