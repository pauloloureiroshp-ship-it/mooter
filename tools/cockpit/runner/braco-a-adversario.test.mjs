// TESTES DE MORDIDA DO ADVERSARIO ao resumo do braco A.
//
// O `braco-a-resumo.test.mjs` do autor morde na direccao "o detector deixou
// passar um connect() para fora". Nenhum dos seus testes morde na direccao
// oposta, que e a que custa: "o tracer nunca correu, e o relatorio leu esse
// silencio como prova de que nada saiu". O mesmo padrao repetia-se em dois
// outros sitios do mesmo ficheiro:
//
//   1. `ficheiros_saltados` vinha de `j.paths?.skipped ?? []`. Medido no
//      semgrep 1.174.0: sem `--verbose` a chave `paths.skipped` NAO EXISTE na
//      saida (verificado com quatro controlos na CLI, incluindo um alvo dentro
//      de node_modules e outro coberto por um .semgrepignore). O `?? []` fazia
//      da ausencia um zero, e o RESUMO publicava "ficheiros_saltados: 0" nos
//      tres sujeitos sem nunca ter medido nada.
//   2. `ficheiros_varridos` e `recibo.ficheiros_na_lista` eram impressos lado a
//      lado e nunca comparados. O §2.2 diz que um braco que veja outra lista e
//      um braco invalido — mas nada no codigo verificava a igualdade.
//   3. `paths.scanned` inclui ficheiros cujo parse falhou na linha 1 (medido:
//      src/types.ts e src/helper/factory/index.ts em S3). "Varrido" nao e
//      "analisado", e o relatorio nao distinguia.
//
// SEGUNDA PASSAGEM (adversario noutro motor, PR #505, 2026-09-11), duas mordidas
// que a primeira deixou passar:
//
//   4. `ambito_integro` comparava CONTAGENS: `scanned: ['wrong.js']` contra uma
//      lista de um ficheiro dava `igual: true`. Passa a comparar caminhos.
//   5. `medirRede` aceitava qualquer linha com formato de strace como prova de
//      medicao: `123 +++ exited with 1 +++` dava `medido: true, total_connect: 0`.
//      Um zero sem produtor observado. Passa a exigir `execve("…semgrep…") = 0`.
//
// Correr:  node --test tools/cockpit/runner/braco-a-adversario.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RESUMO = resolve(AQUI, 'braco-a-resumo.mjs');

// O trace REAL de 26/08: `-e trace=connect` filtrava tudo o resto, por isso o que
// sobrava eram registos de sinal — com pid e formato de strace, mas sem uma unica
// linha que mostrasse QUE processo estava a ser tracado. Ja nao chega (mordida 5).
const TRACE_26_08 = [
  '1588  --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=1589, si_status=0} ---',
  '1588  --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=1646, si_status=0} ---',
  '',
].join(String.fromCharCode(10));

// A forma real de `strace -f -qq -e trace=connect,execve` sobre o semgrep 1.174.0
// (medido a 2026-09-11 no WSL): o wrapper exec'a semgrep -> semgrep-core -> pysemgrep
// no MESMO pid; os filhos procuram `uname`/`git` pelo PATH e falham com ENOENT ate
// acertarem. A prova e a linha do semgrep com `= 0`.
const EXECVE_SEMGREP = '657   execve("/home/paulo/.local/bin/semgrep", ["semgrep", "scan", "--metrics=off", "--config", "/mnt/c/Users/Paulo Loureiro/frug"..., "--json"], 0x7ffe6f2fab38 /* 25 vars */) = 0';
const TRACE_COM_EXECVE = [
  EXECVE_SEMGREP,
  '657   execve("/home/paulo/.local/lib/python3.10/site-packages/semgrep/bin/semgrep-core", ["osemgrep", "scan"], 0x7ffe6f2fab38 /* 25 vars */) = 0',
  '658   execve("/home/paulo/.local/bin/uname", ["uname", "-s"], 0x7ffe6f2fab38 /* 25 vars */) = -1 ENOENT (No such file or directory)',
  '658   execve("/usr/bin/uname", ["uname", "-s"], 0x7ffe6f2fab38 /* 25 vars */) = 0',
  '657   --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=658, si_status=0} ---',
  '',
].join(String.fromCharCode(10));

// Lista de ambito sintetica com N caminhos, no formato do produtor (um por linha,
// terminador final).
const listaDeAmbito = (n) => Array.from({ length: n }, (_, i) => `src/f${i}.js`).join(String.fromCharCode(10)) + String.fromCharCode(10);

const semgrepJson = (results = [], errors = [], scanned = null) => ({
  version: '1.174.0',
  results,
  errors,
  paths: { scanned: scanned ?? [...new Set(results.map((r) => r.path))] },
});

function correr(escrever) {
  const dir = mkdtempSync(join(tmpdir(), 'braco-a-adv-'));
  try {
    escrever(dir);
    // os tres sujeitos tem de existir ou o resumo sai com codigo 1
    for (const s of ['S1', 'S2', 'S3']) {
      const p = join(dir, `braco-a-${s}.json`);
      if (!existsSync(p)) writeFileSync(p, JSON.stringify(semgrepJson()));
    }
    return JSON.parse(execFileSync(process.execPath, [RESUMO, dir], { encoding: 'utf8' }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const s1 = (rel) => rel.sujeitos.find((s) => s.id === 'S1');

test('MAU: trace VAZIO (o tracer nunca correu) nao pode passar por "nao saiu"', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), '');   // `touch`
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'um ficheiro de 0 bytes passou o criterio 5');
  assert.match(r.porque, /degenerado/);
});

test('MAU: trace que so tem o erro do proprio strace tambem e n/d', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'),
      'strace: Could not attach to process. Operation not permitted' + String.fromCharCode(10));
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'o relatorio leu a falha do tracer como ausencia de rede');
});

test('MAU (mordida 5): o trace de 26/08 (so SIGCHLD) nao prova que o tracer viu o semgrep — n/d', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), TRACE_26_08);
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'um trace sem execve do semgrep passou como medicao');
  assert.match(r.porque, /n[aã]o mostra o semgrep a ser executado/);
  assert.equal(r.total_connect, undefined, 'publicou um zero sem produtor observado');
});

test('MAU (mordida 5, a linha do codex): `123 +++ exited with 1 +++` nao e prova de execucao', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), '123 +++ exited with 1 +++' + String.fromCharCode(10));
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'uma linha com formato de strace chegou para dizer "0 connect()"');
  assert.match(r.porque, /n[aã]o mostra o semgrep a ser executado/);
  assert.equal(r.saiu_da_maquina, undefined);
});

test('MAU (mordida 5): execve do semgrep que FALHOU (ENOENT) nao e execucao', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'),
      '657   execve("/home/x/.local/bin/semgrep", ["semgrep", "scan"], 0x1 /* 2 vars */) = -1 ENOENT (No such file or directory)' + String.fromCharCode(10));
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'um execve que devolveu -1 contou como o semgrep a correr');
});

test('MAU (mordida 5): execve de OUTRO executavel cujo argv menciona semgrep nao serve', () => {
  // `--config …/regras-semgrep/p-javascript.yaml` poe a palavra "semgrep" no argv de
  // qualquer processo; a prova tem de estar no EXECUTAVEL, nao nos argumentos.
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'),
      '700   execve("/usr/bin/cat", ["cat", "/x/regras-semgrep/p-javascript.yaml"], 0x1 /* 2 vars */) = 0' + String.fromCharCode(10));
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, false, 'o nome do ficheiro de regras passou por prova de execucao do semgrep');
});

test('BOM: trace com execve("…/semgrep") = 0 conta, e regista quem foi observado', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), TRACE_COM_EXECVE);
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, true, 'a correccao passou a rejeitar o trace verdadeiro com execve');
  assert.equal(r.saiu_da_maquina, false);
  assert.equal(r.total_connect, 0);
  assert.equal(r.prova_de_execucao.pid, 657);
  assert.match(r.prova_de_execucao.executavel, /\/semgrep$/);
});

test('BOM: execve `<unfinished ...>` + `<... execve resumed> = 0` (strace -f interrompido) conta', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), [
      '657   execve("/home/paulo/.local/bin/semgrep", ["semgrep", "scan"], 0x1 /* 2 vars */ <unfinished ...>',
      '658   --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=659, si_status=0} ---',
      '657   <... execve resumed>) = 0',
      '',
    ].join(String.fromCharCode(10)));
  });
  assert.equal(s1(rel).criterio_5_rede.medido, true);
});

test('MAU: sem a chave paths.skipped, ficheiros_saltados tem de ser n/d e nao 0', () => {
  const rel = correr((dir) => {
    // exactamente a forma da saida real: `paths` so tem `scanned`
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['a.js', 'b.js'])));
  });
  const v = s1(rel).ficheiros_saltados;
  assert.notEqual(v, 0, 'zero nao medido publicado como se fosse uma medicao');
  assert.match(String(v), /n\/d/);
});

test('MAU: varrer menos ficheiros do que a lista tem de partir ambito_integro', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['src/f0.js', 'src/f1.js'])));
    writeFileSync(join(dir, 'ambito-S1.txt'), listaDeAmbito(974));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 974, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.medido, true);
  assert.equal(a.igual, false, 'um braco que varreu 2 de 974 saiu daqui verde');
  assert.equal(a.na_lista, 974);
  assert.equal(a.varridos, 2);
  assert.equal(a.so_na_lista, 972);
});

test('MAU (mordida 4): varrer o MESMO numero de ficheiros ERRADOS tem de partir ambito_integro', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['wrong.js'])));
    writeFileSync(join(dir, 'ambito-S1.txt'), 'a.js' + String.fromCharCode(10));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 1, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.medido, true);
  assert.equal(a.igual, false, 'contagens iguais (1 == 1) passaram por listas iguais');
  assert.equal(a.so_na_lista, 1);
  assert.equal(a.so_nos_varridos, 1);
  assert.deepEqual(a.exemplos_so_nos_varridos, ['wrong.js']);
});

test('MAU (mordida 4): sem a lista de ambito no disco nao ha com que comparar — n/d, nao verde', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['a.js'])));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 1, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.medido, false, 'o recibo dizia 1 e o JSON tinha 1 — e isso chegou');
  assert.match(a.porque, /lista de ambito ausente/);
});

test('BOM: os mesmos caminhos com `./`, barras invertidas ou o prefixo da raiz continuam iguais', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], [
      './src/a.js', 'src\\b.js', '/mnt/c/suj/src/c.js',
    ])));
    writeFileSync(join(dir, 'ambito-S1.txt'), ['src/a.js', 'src/b.js', 'src/c.js', ''].join(String.fromCharCode(10)));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', raiz: '/mnt/c/suj', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 3, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.igual, true, 'a normalizacao dos caminhos partiu uma igualdade real');
  assert.equal(a.recibo_concorda, true);
});

test('BOM: lista que mudou entre a corrida e o resumo fica visivel em recibo_concorda', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['a.js'])));
    writeFileSync(join(dir, 'ambito-S1.txt'), 'a.js' + String.fromCharCode(10));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 974, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.igual, true);
  assert.equal(a.recibo_concorda, false, 'o recibo dizia 974 e a lista no disco tem 1 — passou em silencio');
});

// ─────────────────────────────── a frase do criterio 5 e o "$0" (objeccao 2 e o custo)

test('MAU (objeccao 2): a corrida tracada com achados DIFERENTES nunca pode ser descrita como identica', () => {
  const base = (n) => Array.from({ length: n }, (_, i) => ({
    check_id: 'r', path: `f${i}.js`, start: { line: 1, col: 1 }, end: { line: 1, col: 2 }, extra: { message: 'm' },
  }));
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson(base(22))));
    writeFileSync(join(dir, 'braco-a-S1.strace.json'), JSON.stringify(semgrepJson(base(20))));
    writeFileSync(join(dir, 'braco-a-S1.semrede.json'), JSON.stringify(semgrepJson(base(22))));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), TRACE_COM_EXECVE);
  });
  const x = s1(rel);
  assert.match(x.criterio_5_declaracao, /0 connect\(\) numa corrida com 20 achados/);
  assert.match(x.criterio_5_declaracao, /DIFERENTE/);
  assert.doesNotMatch(x.criterio_5_declaracao, /numa corrida com 22 achados/, 'atribuiu o zero a corrida que nao foi tracada');
  assert.match(x.criterio_5_declaracao, /\(b\) em netns sem interface, conjunto de achados identico/);
  // e o $0 nao se apoia na via (a), que nao provou o mesmo conjunto
  assert.match(x.custo_em_dolares.porque, /netns/);
  assert.doesNotMatch(x.custo_em_dolares.porque, /strace/);
});

test('MAU: "$0" nunca e `medido: true`, e sem prova de ausencia de rede nem por construcao', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
  });
  const c = s1(rel).custo_em_dolares;
  assert.equal(c.medido, false);
  assert.equal(c.por_construcao, null, 'afirmou $0 sem strace nem netns');
  assert.match(c.porque, /n\/d/);
  assert.equal(rel.totais.custo_em_dolares.medido, false);
  assert.equal(rel.totais.custo_em_dolares.por_construcao, null);
});

test('BOM: com as duas vias a bater, "$0" e por construcao, declarado como nao-recibo', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.strace.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.semrede.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), TRACE_COM_EXECVE);
  });
  const c = s1(rel).custo_em_dolares;
  assert.equal(c.medido, false, '"$0" apresentado como medicao');
  assert.equal(c.por_construcao, '$0');
  assert.match(c.porque, /nao e um recibo de custo/);
  assert.match(c.porque, /0 connect\(\) sob strace/);
  assert.match(c.porque, /netns/);
});

// ─────────────────────────────── corridas invalidadas (objeccao 1): postas de lado, nao apagadas

test('corridas INVALIDO-<sha7> aparecem no resumo com conta:false e o porque do manifesto', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.INVALIDO-2d5fd76.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.INVALIDO-2d5fd76.meta.json'), JSON.stringify({
      sujeito: 'S1', raiz: '/mnt/c/velha', corrido_em: '2026-08-26T19:40:11Z', ficheiros_na_lista: 974,
      sha256_lista_ambito: 'aa', sha256_json: 'bb',
    }));
    writeFileSync(join(dir, 'braco-a-S1.INVALIDO-2d5fd76.connect.trace'), '');
    writeFileSync(join(dir, 'ambito-MANIFESTO.json'), JSON.stringify({
      sujeitos: [], substituidos: [{ id: 'S1', head_da_raiz_ao_versionar: '2d5fd76294dfa16ef3d67e712c5a51394f72790d', porque: 'fora do sha pre-registado (§10.2)' }],
    }));
  });
  assert.equal(rel.corridas_invalidadas.length, 1);
  const inv = rel.corridas_invalidadas[0];
  assert.equal(inv.sujeito, 'S1');
  assert.equal(inv.conta, false);
  assert.deepEqual(inv.ficheiros, ['braco-a-S1.INVALIDO-2d5fd76.connect.trace', 'braco-a-S1.INVALIDO-2d5fd76.json', 'braco-a-S1.INVALIDO-2d5fd76.meta.json']);
  assert.equal(inv.recibo_da_corrida_invalidada.corrido_em, '2026-08-26T19:40:11Z');
  assert.match(inv.porque, /§10\.2/);
  // e a corrida invalidada NAO entra nos numeros
  assert.equal(rel.totais.volume_entregue_ao_humano, 0);
});

test('corrida INVALIDO sem entrada no manifesto: o porque e n/d, nao inventado', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.INVALIDO-abcdef0.json'), JSON.stringify(semgrepJson()));
  });
  assert.equal(rel.corridas_invalidadas.length, 1);
  assert.match(rel.corridas_invalidadas[0].porque, /n\/d/);
  assert.equal(rel.corridas_invalidadas[0].recibo_da_corrida_invalidada.medido, false);
});

test('MAU: ficheiro que falhou o parse continua em scanned — tem de ser nomeado', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson(
      [], [{ type: 'Syntax error', level: 'warn', path: 'src/types.ts', message: 'Syntax error at line 1' }],
      ['src/types.ts', 'ok.js'],
    )));
  });
  const x = s1(rel);
  assert.equal(x.ficheiros_varridos, 2);
  assert.equal(x.ficheiros_com_analise_degradada, 1, '"varrido" apresentado como "analisado"');
  assert.deepEqual(x.quais_degradados, ['src/types.ts']);
});
