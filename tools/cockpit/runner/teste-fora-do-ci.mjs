/**
 * teste-fora-do-ci.mjs — um teste novo que o CI nao corre faz o CI FALHAR.
 *
 * ── O PROBLEMA, MEDIDO ──────────────────────────────────────────────────────
 *
 * Na origem (2026-08-26): **180 de 599** ficheiros de teste versionados (30%)
 * nao eram alcancados por nada que os workflows invocassem. Nao e negligencia
 * de ninguem — e mecanica. Metade dos scripts de teste deste repo eram (e
 * varios ainda sao) **listas escritas a mao**:
 *
 *     "test": "node --test … (97 ficheiros)"   ← tools/router, ainda hoje
 *
 * Escrever um teste novo ao lado dos outros e a coisa mais natural do mundo. A
 * lista nao cresce sozinha. O teste passa localmente, entra no repo, e nunca
 * mais corre — e ninguem descobre, porque um teste que nao corre nao falha.
 *
 * (O `test:cockpit-runner` era o exemplo canonico, com 46 ficheiros a mao. A
 * 2026-09-11 ja e um glob — e foi isso que matou a premissa da primeira
 * mordida deste guarda, ver o teste. Numeros sem data envelhecem; os que aqui
 * ficam levam a data.)
 *
 * ── O QUE ESTE GUARDA FAZ, E O QUE NAO FAZ ──────────────────────────────────
 *
 * NAO tenta levar os orfaos a zero de uma vez. Isso e uma onda de trabalho,
 * nao um guarda, e um guarda que nasce vermelho e desligado no mesmo dia.
 *
 * FAZ uma **catraca**: a lista actual e a linha de base, e o guarda falha
 * quando ela **cresce**. Um teste novo fora do CI parte a build no PR que o
 * introduz — que e o unico momento em que corrigi-lo custa dois minutos.
 *
 * E aperta nos dois sentidos: quando um orfao passa a ser coberto, o guarda
 * TAMBEM falha, a pedir que a linha de base encolha. Uma catraca que so trava
 * numa direccao acaba a proteger o numero em vez do repositorio.
 *
 * ── REGRAVAR NAO E UMA SAIDA — E UMA PERGUNTA ───────────────────────────────
 *
 * A 2026-09-11 a linha de base foi regravada de 180 para 193 «porque entraram
 * 15». O proprio ficheiro exigia explicar porque e que CADA teste nao deve
 * correr, e a lista nao trazia uma unica explicacao. Um adversario apanhou:
 * «explica o crescimento, nao justifica a dispensa». Desde entao:
 *
 *   · a linha de base guarda a lista INICIAL (2026-08-26) em `inicio.orfaos`;
 *   · qualquer orfao que nao esteja nessa lista inicial tem de ter uma entrada
 *     em `justificacoes` — o porque de nao correr em CI;
 *   · `--linha-base` RECUSA (codigo 1) regravar com um orfao novo sem
 *     `--porque "<ficheiro>=<texto>"`, ou sem ele ja estar no mapa;
 *   · o guarda FALHA (codigo 1) se a linha de base trouxer um orfao fora da
 *     lista inicial sem justificacao — mesmo que alguem o tenha escrito a mao.
 *
 * ── A LISTA INICIAL E IMUTAVEL, E O GUARDA VERIFICA-O ───────────────────────
 *
 * Na 2.ª ronda (2026-09-12) um adversario acrescentou um caminho a
 * `inicio.orfaos` a mao e o guarda passou de codigo 1 para 0 sem
 * justificacao nenhuma: «o guarda confia na lista que devia fiscalizar».
 * Tinha razao. A lista de 2026-08-26 tem 180 entradas e nao muda — nem
 * cresce, nem encolhe: um inicial que passe a coberto continua na foto, e o
 * guarda calcula «ainda por cobrir» = inicio ∩ orfaos actuais. O sha256 da
 * lista (ordenada, `\n`-joined) esta em `SHA_INICIO_2026_08_26`, em CODIGO:
 * uma linha de base cujo `inicio.orfaos` nao bate com ele e ADULTERADA e o
 * guarda sai com codigo 2 — nao ha `--linha-base` que a regrave, porque
 * `--linha-base` copia `inicio` e recusa copiar um que nao bata. Orfaos
 * novos vao para `justificacoes`, com o porque; e o unico sitio onde entram.
 *
 * (Ate esta ronda o `--linha-base` encolhia `inicio.orfaos` quando um
 * inicial passava a coberto — 178 no ficheiro, 180 no `total`. Um sha de uma
 * lista que encolhe nao serve; a lista voltou aos 180 de 2d5fd762.)
 *
 * ── RESSALVAS (medidas pelo adversario, 2026-09-12; comportamento mantido) ──
 *
 *   · `--porque "a.test.js=x=y"` divide no PRIMEIRO `=`: a justificacao fica
 *     `x=y`, inteira. E o que se quer.
 *   · Um orfao justificado que passa a coberto perde a justificacao na
 *     regravacao seguinte (poda); se voltar a ser orfao, tem de justificar de
 *     novo. E o que se quer: uma frase para um teste que ja corria e uma
 *     frase a envelhecer.
 *   · LIMITACAO (nao reproduzida, escrita): um dos 180 iniciais que passe a
 *     coberto e depois volte a ser orfao entra sem porque — esta na foto. A
 *     alternativa (exigir porque a quem ja esteve coberto) pedia uma segunda
 *     lista mutavel dentro do ficheiro, que e o que esta ronda tirou. A
 *     catraca continua a acusar o regresso como `novo` (codigo 1); so a
 *     regravacao e que nao pede o porque.
 *
 * ── PORQUE E QUE NAO TEM DETECTOR PROPRIO ───────────────────────────────────
 *
 * A cobertura calcula-se em `indice-do-harness.testesGateados()`, que ja e a
 * parcela C1 do indice e ja e testada. Uma segunda implementacao da mesma
 * pergunta divergiria da primeira no primeiro mes — e a partir dai o painel
 * diria um numero e o CI outro, sobre a mesma coisa.
 *
 * Uso:
 *   node tools/cockpit/runner/teste-fora-do-ci.mjs                # verifica
 *   node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base \
 *        --porque "a/b.test.mjs=artefacto de experiencia datada"  # regrava
 *
 * Saida: 0 = a catraca aguenta. 1 = cresceu, encolheu, ou ha orfao sem
 * justificacao (ver mensagem). 2 = falhou a medir, ou a lista inicial foi
 * alterada.
 */

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { testesGateados, RAIZ_REPO } from './indice-do-harness.mjs';

export const CAMINHO_LINHA_BASE = path.join(RAIZ_REPO, 'tools', 'cockpit', 'runner', 'testes-orfaos.baseline.json');

/**
 * sha256 da lista inicial de 2026-08-26 (180 caminhos, ordenados, `\n`-joined),
 * tal como foi commitada em 2d5fd762. Calculado UMA vez e escrito aqui: e a
 * unica coisa que impede `inicio.orfaos` de ser editado para dispensar um
 * orfao sem porque. Se alguem precisar de mudar isto, a pergunta e «porque e
 * que a foto de 26/08 mudou?» — e a resposta nao existe.
 */
export const SHA_INICIO_2026_08_26 = 'e17e43f83fc74689efd1f38b0108a41699747f99c174f4a19c02bc104cf46f1b';

export const shaDaLista = (lista) => createHash('sha256').update([...lista].map(String).sort().join('\n')).digest('hex');

export const MENSAGEM_INICIO_ALTERADO = 'a lista inicial foi alterada; a lista inicial e imutavel — orfaos novos vao para `justificacoes`';

export function lerLinhaBase({ caminho = CAMINHO_LINHA_BASE, readImpl = fs.readFileSync, shaInicio = SHA_INICIO_2026_08_26 } = {}) {
  let j;
  try {
    j = JSON.parse(String(readImpl(caminho, 'utf8')));
  } catch {
    // Sem linha de base, o guarda NAO passa em silencio. Passar seria dizer
    // "esta tudo bem" sobre uma pergunta que nunca foi feita.
    return { presente: false, ausente: true, porque: 'linha de base ausente ou ilegivel', orfaos: [], justificacoes: {}, inicio: null };
  }
  const inicio = j && j.inicio && Array.isArray(j.inicio.orfaos) ? j.inicio : null;
  if (!inicio) {
    // Formato anterior a 2026-09-11: sem a lista inicial nao ha como saber que
    // entradas precisam de justificacao. Nao se adivinha — pede-se regravar.
    return { presente: false, porque: 'linha de base sem o bloco `inicio` (formato anterior a 2026-09-11) — regravar', orfaos: [], justificacoes: {}, inicio: null };
  }
  const sha = shaDaLista(inicio.orfaos);
  if (sha !== shaInicio) {
    // A foto de 26/08 nao bate com o sha em codigo: alguem mexeu na lista que
    // dispensa justificacao. Nao e «regravar» — e codigo 2, e diz-se qual e o
    // sha que veio, para quem for comparar com o git.
    return { presente: false, adulterada: true, porque: `${MENSAGEM_INICIO_ALTERADO} (sha da lista lida ${sha.slice(0, 12)}, esperado ${shaInicio.slice(0, 12)}; ${inicio.orfaos.length} entradas)`, orfaos: [], justificacoes: {}, inicio: null };
  }
  const justificacoes = j.justificacoes && typeof j.justificacoes === 'object' && !Array.isArray(j.justificacoes) ? j.justificacoes : {};
  return {
    presente: true,
    orfaos: Array.isArray(j.orfaos) ? j.orfaos : [],
    justificacoes,
    inicio: { data: inicio.data || null, total: inicio.total ?? inicio.orfaos.length, orfaos: inicio.orfaos },
  };
}

/**
 * A comparacao. Devolve as duas direccoes em separado porque significam coisas
 * diferentes: `novos` e uma regressao a acontecer agora, `resolvidos` e trabalho
 * feito que a linha de base ainda nao reconheceu.
 */
export function comparar(orfaosAgora, linhaBase) {
  const base = new Set(linhaBase);
  const agora = new Set(orfaosAgora);
  return {
    novos: orfaosAgora.filter((f) => !base.has(f)).sort(),
    resolvidos: linhaBase.filter((f) => !agora.has(f)).sort(),
  };
}

/** Os orfaos de uma lista que nao sao da lista inicial NEM tem justificacao. */
export function semJustificacao(orfaos, { inicio, justificacoes } = {}) {
  const inicial = new Set((inicio && inicio.orfaos) || []);
  const j = justificacoes && typeof justificacoes === 'object' ? justificacoes : {};
  return orfaos.filter((f) => !inicial.has(f) && !(typeof j[f] === 'string' && j[f].trim())).sort();
}

export function verificar({ raiz = RAIZ_REPO, linhaBaseImpl = lerLinhaBase, gateadosImpl = testesGateados } = {}) {
  // `incluirNaoVersionados`: o guarda tem de morder ANTES do commit. Ver a
  // nota em `testesGateados` — sem isto, um teste novo ainda por commitar
  // passava verde, e o guarda so acordava quando ja era tarde.
  const p = gateadosImpl({ raiz, incluirNaoVersionados: true });
  if (p.valor === null) {
    return { ok: false, codigo: 2, porque: `nao foi possivel medir a cobertura: ${p.porque}` };
  }
  const lb = linhaBaseImpl({});
  if (lb.adulterada) {
    // Sem `orfaos` de proposito: o `--linha-base` le isso como «nao ha o que
    // gravar» e sai com 2. Uma lista inicial mexida nao se regrava por cima.
    return { ok: false, codigo: 2, porque: lb.porque, linha_base_lida: lb };
  }
  if (!lb.presente) {
    return {
      ok: false,
      codigo: 2,
      porque: `${lb.porque || 'sem linha de base'}. Correr \`node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base\` e commitar o ficheiro. Um guarda sem linha de base que passasse em silencio seria pior do que guarda nenhum.`,
      total: p.den,
      orfaos: p.orfaos,
      linha_base_lida: lb,
    };
  }
  const { novos, resolvidos } = comparar(p.orfaos || [], lb.orfaos);
  // Entradas da linha de base fora da lista inicial e sem porque: alguem as
  // escreveu a mao, ou um regravar antigo deixou-as passar. Nao passam.
  const sem_justificacao = semJustificacao(lb.orfaos, lb);
  const ok = novos.length === 0 && resolvidos.length === 0 && sem_justificacao.length === 0;
  const agora = new Set(p.orfaos || []);
  return {
    ok,
    codigo: ok ? 0 : 1,
    total: p.den,
    cobertos: p.num,
    orfaos: p.orfaos || [],
    linha_base: lb.orfaos.length,
    inicio: lb.inicio,
    // A foto de 26/08 nao muda; o que muda e quantos dela AINDA sao orfaos.
    inicio_por_cobrir: lb.inicio.orfaos.filter((f) => agora.has(f)).length,
    justificacoes: lb.justificacoes,
    novos,
    resolvidos,
    sem_justificacao,
  };
}

/**
 * Regrava a linha de base — ou RECUSA.
 *
 * Recusa (codigo 1, nada escrito) quando um orfao fora da lista inicial nao
 * tem porque: nem em `porques` (os `--porque` desta chamada) nem no mapa que
 * ja la estava. Regravar sem a segunda frase e como o repo passa de 180
 * orfaos para 200.
 *
 * As justificacoes de ficheiros que deixaram de ser orfaos sao PODADAS: uma
 * justificacao para um teste que ja corre e uma frase a envelhecer no sitio
 * onde as frases deviam ser verdade.
 */
export function escreverLinhaBase(r, { caminho = CAMINHO_LINHA_BASE, writeImpl = fs.writeFileSync, porques = {}, hoje = new Date(), shaInicio = SHA_INICIO_2026_08_26 } = {}) {
  const inicio = r.inicio && Array.isArray(r.inicio.orfaos) ? r.inicio : null;
  if (!inicio) {
    return { ok: false, codigo: 2, porque: 'sem lista inicial (`inicio.orfaos`) nao se regrava: a linha de base actual nao a traz' };
  }
  if (shaDaLista(inicio.orfaos) !== shaInicio) {
    // A leitura ja recusa isto; aqui e a segunda porta, para quem chamar esta
    // funcao com um `inicio` que nao veio de `lerLinhaBase`.
    return { ok: false, codigo: 2, porque: MENSAGEM_INICIO_ALTERADO };
  }
  const orfaos = [...(r.orfaos || [])].sort();
  const anteriores = r.justificacoes && typeof r.justificacoes === 'object' ? r.justificacoes : {};
  const justificacoes = {};
  const inicial = new Set(inicio.orfaos);
  for (const f of orfaos) {
    if (inicial.has(f)) continue;
    const texto = (typeof porques[f] === 'string' && porques[f].trim()) || (typeof anteriores[f] === 'string' && anteriores[f].trim()) || null;
    if (texto) justificacoes[f] = texto;
  }
  const semPorque = semJustificacao(orfaos, { inicio, justificacoes });
  if (semPorque.length) {
    return {
      ok: false,
      codigo: 1,
      porque: `${semPorque.length} orfao(s) fora da lista inicial sem justificacao — cada um precisa de --porque "<ficheiro>=<porque nao corre em CI>"`,
      sem_justificacao: semPorque,
    };
  }
  const data = hoje.toISOString().slice(0, 10);
  const j = {
    porque_existe: `A catraca dos testes que o CI nao corre. Esta lista e a divida conhecida a ${data} (inicio ${inicio.data}: ${inicio.total} orfaos); o guarda falha quando ela cresce. Nao e uma allowlist permanente — e um tecto que so deve descer.`,
    como_regravar: 'node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base --porque "<ficheiro>=<porque nao corre em CI>"  (um --porque por orfao novo; e commitar)',
    aviso: 'Regravar isto para calar um vermelho e o gesto que mata a catraca. Se o numero SUBIU, ou se corrige o CI ou se escreve AQUI, em `justificacoes`, porque e que aquele teste nao deve correr — o guarda recusa regravar sem isso, e falha se a entrada aparecer sem porque.',
    regravada_em: hoje.toISOString(),
    // ⚠️ O total foi escrito ERRADO a primeira vez, e a maneira como isso
    // aconteceu vale mais do que o numero. A linha de base foi gravada com o
    // ficheiro de teste do proprio guarda ainda por commitar: o `--linha-base`
    // ve os nao-versionados (`incluirNaoVersionados: true`), mas naquele
    // instante o ficheiro nem existia. Gravou 600; o commit seguinte trouxe o
    // 601. Um agente adversarial e que apanhou, ao comparar com `git ls-files`.
    //
    // A catraca nao mordeu porque compara a LISTA de orfaos, nunca o total —
    // que e o desenho certo. Mas um numero errado a viver dentro do ficheiro
    // cuja funcao e ser a verdade de referencia e exactamente a especie de
    // detalhe que ninguem verifica por parecer trivial.
    total_versionados: r.total,
    // O que nao esta em `inicio.orfaos` tem de estar aqui, com o porque.
    justificacoes,
    orfaos,
    // A lista de 2026-08-26, congelada: e contra ela que se decide quem
    // precisa de justificacao. COPIADA, nunca filtrada — o sha em codigo e
    // sobre os 180 daquele dia, e um inicial que passe a coberto continua na
    // foto (o guarda diz quantos ainda faltam). (Os 180 nao trazem porque:
    // sao a divida herdada, e diz-se que o sao.)
    inicio: { data: inicio.data, total: inicio.total, orfaos: [...inicio.orfaos] },
  };
  writeImpl(caminho, JSON.stringify(j, null, 2) + '\n');
  return { ok: true, codigo: 0, ...j, inicio_por_cobrir: inicio.orfaos.filter((f) => orfaos.includes(f)).length };
}

export function imprimir(r) {
  if (r.codigo === 2) {
    console.error(`teste-fora-do-ci: ${r.porque}`);
    return 2;
  }
  console.log(`testes versionados ${r.total} · alcancados pelo CI ${r.cobertos} · orfaos ${r.orfaos.length} (linha de base ${r.linha_base}; inicio ${r.inicio.data}: ${r.inicio.total}, ainda por cobrir ${r.inicio_por_cobrir}; justificados ${Object.keys(r.justificacoes).length})`);
  if (r.novos.length) {
    console.error(`\n::error::${r.novos.length} teste(s) NOVO(S) que o CI nao corre:`);
    for (const f of r.novos) console.error(`  ${f}`);
    console.error('\nUm teste que ninguem corre nao protege ninguem. Duas saidas, as duas legitimas:');
    console.error('  1. ligar o ficheiro a um script que o CI invoque (o caminho normal);');
    console.error('  2. se ele MESMO nao deve correr em CI, regravar com o porque:');
    console.error('     node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base --porque "<ficheiro>=<porque>"');
    console.error('Regravar sem a segunda frase e como o repo passa de 180 orfaos para 200 — e o guarda recusa.');
  }
  if (r.resolvidos.length) {
    console.error(`\n::error::${r.resolvidos.length} orfao(s) da linha de base passaram a ser cobertos — a catraca tem de APERTAR:`);
    for (const f of r.resolvidos) console.error(`  ${f}`);
    console.error('\nCorrer `node tools/cockpit/runner/teste-fora-do-ci.mjs --linha-base` e commitar.');
    console.error('Uma catraca que so trava numa direccao acaba a proteger o numero em vez do repositorio.');
  }
  if (r.sem_justificacao.length) {
    console.error(`\n::error::${r.sem_justificacao.length} orfao(s) na linha de base fora da lista inicial e SEM justificacao:`);
    for (const f of r.sem_justificacao) console.error(`  ${f}`);
    console.error('\nA linha de base so aceita um orfao novo com o porque em `justificacoes`. Regravar com --porque, ou ligar o teste ao CI.');
  }
  if (r.ok) console.log('a catraca aguenta: nenhum teste novo fora do CI, e todos os que entraram depois do inicio tem porque.');
  return r.codigo;
}

/** `--porque "<ficheiro>=<texto>"`, repetivel. Divide no PRIMEIRO `=`. */
export function porquesDe(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] !== '--porque') continue;
    const v = String(argv[i + 1] || '');
    const k = v.indexOf('=');
    if (k > 0) out[v.slice(0, k).trim()] = v.slice(k + 1).trim();
    i += 1;
  }
  return out;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = verificar({});
  if (process.argv.includes('--linha-base')) {
    if (r.codigo === 2 && !r.orfaos) {
      console.error(`nao ha o que gravar: ${r.porque}`);
      process.exit(2);
    }
    // Sem `inicio` lido (ficheiro ausente, ilegivel, ou do formato antigo) nao
    // se regrava: a lista inicial e imutavel e vive no git, e recria-la a
    // partir da arvore de hoje seria dispensar toda a divida posterior a
    // 26/08 sem porque. (Ate 2026-09-12 este ramo fabricava um `inicio` novo
    // datado de hoje — com o sha em codigo, esse ficheiro seria recusado na
    // leitura seguinte; a saida honesta e restaurar o ficheiro.)
    if (!r.inicio) {
      console.error(`linha de base NAO regravada: sem lista inicial legivel (${(r.linha_base_lida || {}).porque || r.porque || 'sem linha de base'}). A lista inicial de 2026-08-26 e imutavel e vive no git — restaurar com \`git checkout -- ${path.relative(RAIZ_REPO, CAMINHO_LINHA_BASE).split(path.sep).join('/')}\` e regravar por cima.`);
      process.exit(2);
    }
    const j = escreverLinhaBase(r, { porques: porquesDe(process.argv) });
    if (!j.ok) {
      console.error(`linha de base NAO regravada: ${j.porque}`);
      for (const f of j.sem_justificacao || []) console.error(`  ${f}`);
      process.exit(j.codigo);
    }
    console.error(`linha de base gravada: ${j.orfaos.length} orfaos de ${j.total_versionados} testes versionados (${Object.keys(j.justificacoes).length} com justificacao, inicio ${j.inicio.data}: ${j.inicio_por_cobrir} ainda por cobrir de ${j.inicio.total})`);
    process.exit(0);
  }
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.codigo);
  }
  process.exit(imprimir(r));
}
