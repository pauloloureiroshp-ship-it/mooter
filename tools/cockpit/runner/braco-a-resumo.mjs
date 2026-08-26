#!/usr/bin/env node
// Resumo do braco A — le os JSON crus do semgrep e produz os numeros do §4 do
// pre-registo. So le. Nao chama o semgrep, nao chama a rede, nao reescreve nada
// do que mede: se este ficheiro soubesse regenerar os JSON, validaria a propria
// corrupcao (mesmo argumento do `ab-vendorizado.mjs`).
//
// Uso:  node tools/cockpit/runner/braco-a-resumo.mjs [<dir-com-os-artefactos>]
//       (o dir tem de conter braco-a-S<n>.json e, opcionalmente,
//        braco-a-S<n>.semrede.json, .strace.json e .connect.trace)
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ARG = process.argv.slice(2).find((a) => !a.startsWith('--'));
const DIR = ARG ? resolve(ARG) : join(RAIZ, '_handoff', 'ab-audit');
const SUJEITOS = [
  { id: 'S1', nome: 'mooter' },
  { id: 'S2', nome: 'fastify' },
  { id: 'S3', nome: 'hono' },
];

const ler = (p) => JSON.parse(readFileSync(p, 'utf8'));

// A chave de identidade de um achado. Serve para duas coisas: (1) colapsar
// duplicados exactos, para dizer se a redundancia dos 4 conjuntos de regras
// (117 ids repetidos, ver regras-semgrep/MANIFESTO.json) inflacionou o volume;
// (2) comparar corridas entre si sem depender da ordem de saida do semgrep.
//
// A MENSAGEM ENTRA NA CHAVE, e isto foi aprendido a errar. A primeira versao
// usava so (check_id, ficheiro, span) e reportava 1 duplicado em S1. Nao era
// duplicado nenhum: `detect-child-process` casou DUAS vezes no mesmo span de
// tools/router/shadow-judge.js:80, uma por cada metavariavel (`model` e
// `prompt`) — dois achados distintos que partilham a mesma linha. A chave
// ingenua comia um achado real e teria feito o braco A parecer 1 mais pequeno
// do que e. O `extra.fingerprint` do semgrep CE nao serve para desempatar: sem
// conta paga vem literalmente como a string "requires login".
const chave = (r) =>
  [r.check_id, r.path, r.start.line, r.start.col, r.end.line, r.end.col,
    r.extra?.message ?? ''].join('\u0000');

function medir(j) {
  const res = j.results ?? [];
  const errs = j.errors ?? [];
  const classes = new Map();
  for (const r of res) classes.set(r.check_id, (classes.get(r.check_id) ?? 0) + 1);
  const porNivel = {};
  for (const e of errs) porNivel[e.level ?? 'sem-nivel'] = (porNivel[e.level ?? 'sem-nivel'] ?? 0) + 1;
  const porTipo = {};
  for (const e of errs) {
    const t = typeof e.type === 'string' ? e.type : Array.isArray(e.type) ? e.type[0] : 'desconhecido';
    porTipo[t] = (porTipo[t] ?? 0) + 1;
  }
  return {
    brutos: res.length,
    distintos: new Set(res.map(chave)).size,
    erros: errs.length,
    erros_por_nivel: porNivel,
    erros_por_tipo: porTipo,
    ficheiros_varridos: (j.paths?.scanned ?? []).length,
    // `paths.skipped` SO existe na saida do semgrep quando se corre com --verbose.
    // Medido em 1.174.0: sem --verbose a chave nao vem, nem sequer vazia. O `?? []`
    // que estava aqui transformava uma chave AUSENTE num zero, e o relatorio afirmava
    // "zero ficheiros saltados" sem ter medido nada. Zero nao medido e n/d COM o
    // porque — nunca um zero.
    ficheiros_saltados: j.paths && 'skipped' in j.paths
      ? j.paths.skipped.length
      : 'n/d — o semgrep so emite paths.skipped com --verbose, e esta corrida nao o usou',
    // "varrido" nao e "analisado": um ficheiro que falha o parse na linha 1 aparece na
    // mesma em paths.scanned (medido: src/types.ts em S3). Estes sao os ficheiros cuja
    // analise saiu degradada, e onde a recolha do braco e desconhecida.
    ficheiros_com_analise_degradada: [...new Set(errs.map((e) => e.path).filter(Boolean))],
    n_classes: classes.size,
    classes: [...classes.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    conjunto: new Set(res.map(chave)),
  };
}

// Criterio 5 do §4: contagem de sockets, nao declaracao. Uma linha do strace com
// `connect(` e uma tentativa de ligacao; classificamo-la pela familia e destino.
function medirRede(p) {
  if (!existsSync(p)) return { medido: false, porque: `trace ausente: ${p}` };
  const cru = readFileSync(p, 'utf8');
  // O CASO QUE FALTAVA. Ate aqui um trace VAZIO — ou um que so contivesse a mensagem
  // de erro do proprio strace ("Could not attach to process") — dava total_connect: 0
  // e saiu_da_maquina: false. Ou seja: `touch braco-a-S1.connect.trace` PASSAVA o
  // criterio 5. Demonstrado na CLI antes desta correccao. Um trace so conta como
  // medicao se mostrar que o tracer chegou a agarrar alguem: pelo menos uma linha no
  // formato de registo do strace com -f (`<pid>  connect(...)`, `<pid>  --- SIG...`).
  if (!/^\d+\s+(connect\(|---|\+\+\+)/m.test(cru)) {
    return {
      medido: false,
      porque: `trace degenerado (${cru.length} bytes, nenhum registo de strace la dentro): `
        + 'indistinguivel de um tracer que nunca correu — criterio 5 e n/d, nao "nao saiu"',
    };
  }
  const linhas = cru.split('\n').filter((l) => l.includes('connect('));
  const externos = [];
  let unix = 0, loopback = 0;
  for (const l of linhas) {
    if (l.includes('AF_UNIX')) { unix++; continue; }
    const m = l.match(/inet_addr\("([^"]+)"\)|inet_pton\(AF_INET6, "([^"]+)"/);
    const alvo = m ? (m[1] ?? m[2]) : '(destino nao parseado)';
    if (alvo === '127.0.0.1' || alvo === '::1') loopback++;
    else externos.push(alvo);
  }
  return { medido: true, total_connect: linhas.length, af_unix: unix, loopback, externos, saiu_da_maquina: externos.length > 0 };
}

// §3: uma classe = um check_id; classes com < 5 candidatos juntam-se numa classe
// unica `cauda`. Amostra de calibracao = min(40, candidatos) POR CLASSE.
// §3.1: os 40 de avaliacao saem do que RESTA depois da calibracao; se nao
// sobrarem 40, o n desce e e declarado. §7.3: n = 0 => INCONCLUSIVO.
function amostragem(m) {
  const grandes = m.classes.filter(([, n]) => n >= 5);
  const cauda = m.classes.filter(([, n]) => n < 5).reduce((a, [, n]) => a + n, 0);
  const baldes = [...grandes.map(([id, n]) => ({ classe: id, n })), ...(cauda ? [{ classe: 'cauda', n: cauda }] : [])];
  const calibracao = baldes.reduce((a, b) => a + Math.min(40, b.n), 0);
  const resta = m.brutos - calibracao;
  const avaliacao = Math.max(0, Math.min(40, resta));
  return {
    candidatos: m.brutos, baldes, calibracao_consome: calibracao,
    resta_para_avaliacao: resta, n_de_avaliacao: avaliacao,
    inconclusivo_por_par_7_3: avaliacao === 0,
    porque: avaliacao === 0
      ? 'a calibracao do §3 consome todos os candidatos; o §3.1 nao deixa reutilizar os ja usados; n = 0 => §7.3 INCONCLUSIVO'
      : `n = ${avaliacao} (< 40 e declarado, nao compensado — §3.1)`,
  };
}

const relatorio = { gerado_em: new Date().toISOString(), dir: DIR, sujeitos: [], totais: {} };
let tBrutos = 0, tErros = 0, tVarridos = 0;
const classesGlobais = new Map();

for (const s of SUJEITOS) {
  const pLimpo = join(DIR, `braco-a-${s.id}.json`);
  if (!existsSync(pLimpo)) { console.error(`FALTA ${pLimpo}`); process.exitCode = 1; continue; }
  const limpo = medir(ler(pLimpo));

  const comparar = (sufixo) => {
    const p = join(DIR, `braco-a-${s.id}.${sufixo}.json`);
    if (!existsSync(p)) return { medido: false, porque: `ausente: ${p}` };
    const o = medir(ler(p));
    const soLimpo = [...limpo.conjunto].filter((k) => !o.conjunto.has(k)).length;
    const soOutro = [...o.conjunto].filter((k) => !limpo.conjunto.has(k)).length;
    return {
      medido: true, brutos: o.brutos, erros: o.erros, erros_por_tipo: o.erros_por_tipo,
      ficheiros_varridos: o.ficheiros_varridos,
      achados_identicos: soLimpo === 0 && soOutro === 0,
      so_no_limpo: soLimpo, so_no_outro: soOutro,
    };
  };

  tBrutos += limpo.brutos; tErros += limpo.erros; tVarridos += limpo.ficheiros_varridos;
  for (const [k, v] of limpo.classes) classesGlobais.set(k, (classesGlobais.get(k) ?? 0) + v);

  // O recibo que a propria corrida escreveu (tempo de parede, regras que
  // correram, sha das regras e da lista). Nao ha aqui numero nenhum transcrito
  // a mao: se o recibo faltar, o campo sai `n/d` com o porque, nao inventado.
  const pMeta = join(DIR, `braco-a-${s.id}.meta.json`);
  const recibo = existsSync(pMeta)
    ? ler(pMeta)
    : { medido: false, porque: `recibo ausente: ${pMeta} — parede_s e regras_correram sao n/d` };

  relatorio.sujeitos.push({
    id: s.id, nome: s.nome,
    recibo_da_corrida: recibo,
    volume_entregue_ao_humano: limpo.brutos,   // §4 metrica 2 — ambito COMPLETO, nao amostra
    achados_distintos_apos_colapso_exacto: limpo.distintos,
    erros: limpo.erros, erros_por_nivel: limpo.erros_por_nivel, erros_por_tipo: limpo.erros_por_tipo,
    ficheiros_varridos: limpo.ficheiros_varridos, ficheiros_saltados: limpo.ficheiros_saltados,
    ficheiros_com_analise_degradada: limpo.ficheiros_com_analise_degradada.length,
    quais_degradados: limpo.ficheiros_com_analise_degradada,
    // O §2.2 diz "braco que veja outra lista e um braco invalido". O relatorio imprimia
    // ficheiros_varridos e ficheiros_na_lista lado a lado e NUNCA os comparava: um braco
    // que varresse 900 dos 974 saia daqui verde. A comparacao passa a ser um campo, nao
    // um exercicio de leitura de quem le o JSON.
    ambito_integro: existsSync(pMeta)
      ? {
        medido: true,
        na_lista: recibo.ficheiros_na_lista,
        varridos: limpo.ficheiros_varridos,
        igual: recibo.ficheiros_na_lista === limpo.ficheiros_varridos,
      }
      : { medido: false, porque: `recibo ausente: ${pMeta} — nao ha com que comparar os varridos` },
    n_classes: limpo.n_classes,
    top10_classes: limpo.classes.slice(0, 10).map(([id, n]) => ({ n, check_id: id })),
    todas_as_classes: limpo.classes.map(([id, n]) => ({ n, check_id: id })),
    // §3 + §3.1 aplicados ao volume MEDIDO. Isto nao e um veredicto — e a
    // aritmetica que as regras do pre-registo obrigam, com os numeros desta
    // corrida em vez de numeros supostos. Fica aqui porque decidir a amostragem
    // depois de ver o volume seria exactamente o que o §10 proibe.
    consequencia_mecanica_do_par_3: amostragem(limpo),
    controlo_sem_rede: comparar('semrede'),
    corrida_sob_strace: comparar('strace'),
    criterio_5_rede: medirRede(join(DIR, `braco-a-${s.id}.connect.trace`)),
  });
}

relatorio.totais = {
  n_de_avaliacao_por_sujeito: Object.fromEntries(
    relatorio.sujeitos.map((x) => [x.id, x.consequencia_mecanica_do_par_3.n_de_avaliacao])),
  volume_entregue_ao_humano: tBrutos, erros: tErros, ficheiros_varridos: tVarridos,
  classes_distintas_no_braco: classesGlobais.size,
  top10_classes_do_braco: [...classesGlobais.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10)
    .map(([id, n]) => ({ n, check_id: id })),
};

if (process.argv.includes('--json')) {
  const dest = join(DIR, 'braco-a-RESUMO.json');
  writeFileSync(dest, JSON.stringify(relatorio, null, 2) + '\n');
  console.log(`escrito ${dest}`);
} else {
  console.log(JSON.stringify(relatorio, null, 2));
}
