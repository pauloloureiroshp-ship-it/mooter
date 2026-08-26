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

// Um trace REAL do braco A: `-e trace=connect` filtra tudo o resto, por isso o
// que sobra sao registos de sinal — mas sao registos, com pid e formato.
const TRACE_REAL = [
  '1588  --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=1589, si_status=0} ---',
  '1588  --- SIGCHLD {si_signo=SIGCHLD, si_code=CLD_EXITED, si_pid=1646, si_status=0} ---',
  '',
].join(String.fromCharCode(10));

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

test('BOM: o trace real do braco A (so SIGCHLD) continua a contar como medido', () => {
  const rel = correr((dir) => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson()));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), TRACE_REAL);
  });
  const r = s1(rel).criterio_5_rede;
  assert.equal(r.medido, true, 'a correccao passou a rejeitar os traces verdadeiros');
  assert.equal(r.saiu_da_maquina, false);
  assert.equal(r.total_connect, 0);
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
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([], [], ['a.js', 'b.js'])));
    writeFileSync(join(dir, 'braco-a-S1.meta.json'), JSON.stringify({
      sujeito: 'S1', modo: 'limpo', rc: 0, parede_s: 1, ficheiros_na_lista: 974, regras_correram: 89,
    }));
  });
  const a = s1(rel).ambito_integro;
  assert.equal(a.medido, true);
  assert.equal(a.igual, false, 'um braco que varreu 2 de 974 saiu daqui verde');
  assert.equal(a.na_lista, 974);
  assert.equal(a.varridos, 2);
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
