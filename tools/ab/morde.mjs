/**
 * morde.mjs — a prova de que os testes do harness A/B servem para alguma coisa.
 *
 * Uso:  node tools/ab/morde.mjs        (exit 0 se TODOS os defeitos forem apanhados)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PORQUE EXISTE
 *
 * Neste repositório já se aprendeu três vezes que **uma guarda sem teste de
 * mordida não é guarda**: peças escreveram-se com cuidado, passaram a verde, e
 * não estavam a verificar nada. O harness A/B é o instrumento que produz
 * números públicos — foi para uma release e para uma página. Os seus testes
 * precisam de prova, não de confiança.
 *
 * A prova veio no primeiro uso: dos 13 defeitos plantados, **um passou**. O
 * teste que devia guardar as convenções dadas ao adversário procurava as
 * palavras no prompt INTEIRO, e casava com a linha que define os tiers («T3 =
 * arquitectura, multi-ficheiro, produção, segredos, CI, migrações»). Apagar o
 * bloco de convenções todo deixava-o verde. 22 testes a passar, e um deles
 * guardava nada.
 *
 * Cada defeito abaixo é uma correcção que a auditoria de pré-merge de
 * 2026-09-01 impôs, e que sem guarda pode ser desfeita em silêncio — pondo a
 * peça pública a dizer outra vez 84,3% e «+36 pontos».
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * SEGURANÇA
 *
 * Este script ESCREVE no `mooter-vs-sem.mjs` e restaura-o a seguir, incluindo
 * num `finally` se rebentar a meio. Por isso NÃO se chama `*.test.mjs`: o
 * `node --test` corre ficheiros em paralelo, e um teste a ler o harness
 * enquanto este o muta veria lixo. Corre sozinho, no seu próprio passo de CI.
 *
 * O `ORIG` é lido no arranque, portanto o restauro devolve o ficheiro ao estado
 * em que estava — não a `HEAD`. Alterações por commitar sobrevivem.
 */
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const P = 'tools/ab/mooter-vs-sem.mjs';
const ORIG = fs.readFileSync(P, 'utf8');

const DEFEITOS = [
  { nome: 'a marcação de co-autoradas desaparece (84,3% volta)',
    de: "coautorada: /^mooter_review/.test(a.confidence_source || ''),",
    para: 'coautorada: false, // DEFEITO' },

  { nome: 'o braço do Mooter deixa de propagar a marca',
    de: `      tokens_in: 0, tokens_out: 0,
      // sem isto, \`precisao_limpa\` era igual a \`precisao_total\` e o corte limpo
      // nao existia — a marca morria no braco em vez de chegar a contabilidade
      coautorada: !!a.coautorada,`,
    para: '      tokens_in: 0, tokens_out: 0, // DEFEITO: marca perdida' },

  { nome: 'o braço do LLM deixa de propagar as marcas',
    de: 'tokens_in: ti, tokens_out: to, coautorada: !!a.coautorada, trust: a.trust || null, preview_truncado: !!a.preview_truncado });',
    para: 'tokens_in: ti, tokens_out: to }); // DEFEITO' },

  { nome: 'o adversário volta a correr a temperature 0.2 (a variância falsa)',
    de: '        temperature: 0,',
    para: '        temperature: 0.2, // DEFEITO' },

  { nome: 'o juiz deixa de receber as convenções (+36 pontos falsos voltam)',
    de: '- risco alto força T3: deploy, push, merge, release, migrações, segredos, .env, CI',
    para: '- (removido) // DEFEITO' },

  { nome: 'o harness volta a poluir a telemetria real',
    de: "        sessionId: 'ab-harness',",
    para: '        // DEFEITO: sessionId removido' },

  { nome: 'o juiz que não responde passa a ser contado como palpite',
    de: '        tier = m ? m[0] : null;',
    para: "        tier = m ? m[0] : 'T0'; // DEFEITO" },

  { nome: 'a proveniência volta a ser cravada',
    de: `    dataset: opts.holdout
      ? 'tools/router/validation-set.json (2026-04-15)'
      : 'tools/router/gold-labels.json (2026-04-11)',`,
    para: "    dataset: 'tools/router/gold-labels.json (2026-06-08)', // DEFEITO" },

  { nome: '`identico_em_todas` passa a estar cravado a true',
    de: "      identico_em_todas: new Set(lim.map((x) => (x == null ? 'n/d' : x.toFixed(6)))).size === 1,",
    para: '      identico_em_todas: true, // DEFEITO' },

  { nome: 'um número derrubado volta para uma docstring',
    de: ' * O QUE SE MEDE, E PORQUE NÃO É SÓ CUSTO',
    para: ' * O QUE SE MEDE (holdout 84,3%) — DEFEITO' },

  { nome: 'o controlo começa a classificar em vez de despachar',
    de: '    id: a.id, esperado: a.expected_tier, obtido: tierFixo, erro: null,',
    para: '    id: a.id, esperado: a.expected_tier, obtido: a.expected_tier, erro: null, // DEFEITO' },

  { nome: 'subestimar e sobrestimar passam a ser somados',
    de: '    if (a < b) sub++; else sobre++;',
    para: '    sobre++; // DEFEITO' },

  { nome: 'a bandeira --corridas desaparece do CLI',
    de: "  const iC = argv.indexOf('--corridas');",
    para: '  const iC = -1; // DEFEITO' },

  // ── a separacao deriva/precisao (a «fraqueza historical 68%») ──────────
  { nome: 'o `trust` deixa de sair do dataset (deriva volta a misturar-se)',
    de: '        trust: a.trust || null,\n        // E o prompt guardado nao e o prompt',
    para: '        trust: null, // DEFEITO\n        // E o prompt guardado nao e o prompt' },

  { nome: 'a precisao volta a incluir rotulos escritos pelo classificador',
    de: "  const gt = r.linhas.filter((l) => l.trust === 'ground_truth' && !l.coautorada);",
    para: '  const gt = r.linhas.filter((l) => !l.coautorada); // DEFEITO' },

  { nome: 'a deriva deixa de declarar quantas guardam preview truncado',
    de: '  const drTrunc = dr.filter((l) => l.preview_truncado);',
    para: '  const drTrunc = []; // DEFEITO' },

  { nome: 'a marca de preview truncado deixa de ser calculada',
    de: "        preview_truncado: String(a.prompt || '').length >= 79,",
    para: '        preview_truncado: false, // DEFEITO' },
];

let mordeu = 0;
const falhados = [];
try {
  for (const d of DEFEITOS) {
    if (!ORIG.includes(d.de)) {
      console.log(`  ÂNCORA AUSENTE · ${d.nome}`);
      falhados.push(d.nome + ' (âncora)');
      continue;
    }
    const mut = ORIG.replace(d.de, d.para);
    if (mut === ORIG) {
      console.log(`  REPLACE SEM EFEITO · ${d.nome}`);
      falhados.push(d.nome + ' (sem efeito)');
      continue;
    }
    fs.writeFileSync(P, mut);

    let saida = '';
    try {
      saida = execFileSync(process.execPath, ['--test', 'tools/ab/mooter-vs-sem.test.mjs'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) { saida = String((e.stdout || '') + (e.stderr || '')); }

    const m = saida.match(/^# fail (\d+)/m) || saida.match(/ℹ fail (\d+)/);
    const fail = m ? Number(m[1]) : -1;
    const quais = [...saida.matchAll(/^✖ (.+?) \(/gm)].map((x) => x[1]).slice(0, 2);

    if (fail > 0) {
      mordeu++;
      console.log(`  MORDEU (${fail}) · ${d.nome}`);
      for (const q of quais) console.log(`       ↳ ${q}`);
    } else {
      console.log(`  NÃO MORDEU · ${d.nome}   <<< a suite dá verde com este defeito`);
      falhados.push(d.nome);
    }
    fs.writeFileSync(P, ORIG);
  }
} finally {
  fs.writeFileSync(P, ORIG);
}

console.log(`\n  ${mordeu}/${DEFEITOS.length} defeitos apanhados. Ficheiro restaurado.`);
if (falhados.length) {
  console.log('  Não cobertos:');
  for (const f of falhados) console.log('    · ' + f);
}
process.exit(mordeu === DEFEITOS.length ? 0 : 1);
