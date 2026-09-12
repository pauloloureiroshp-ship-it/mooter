// TESTE DE MORDIDA do resumo do braco A.
//
// O `braco-a-resumo.mjs` e um guarda: e ele que diz "o controlo sem rede deu o
// mesmo resultado" e "nao saiu nada da maquina". Nas tres corridas reais ele
// disse `achados_identicos: true` e `saiu_da_maquina: false`. Esse e o resultado
// esperado — e por isso mesmo indistinguivel do que um comparador partido diria.
// Cada teste aqui poe o guarda perante o caso MAU e exige que ele falhe.
//
// Correr:  node --test tools/cockpit/runner/braco-a-resumo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RESUMO = resolve(AQUI, 'braco-a-resumo.mjs');

const achado = (id, ficheiro, linha, msg) => ({
  check_id: id, path: ficheiro,
  start: { line: linha, col: 1 }, end: { line: linha, col: 20 },
  extra: { message: msg, severity: 'ERROR' },
});
const semgrepJson = (results, errors = []) => ({
  version: '1.174.0', results, errors,
  paths: { scanned: [...new Set(results.map((r) => r.path))], skipped: [] },
});
// Desde a mordida 5 do adversario (PR #505) um trace so conta se mostrar o semgrep a
// ser executado; esta e a linha que o `strace -e trace=connect,execve` real produz.
const EXECVE_SEMGREP = '657   execve("/home/paulo/.local/bin/semgrep", ["semgrep", "scan", "--metrics=off"], 0x7ffe6f2fab38 /* 25 vars */) = 0\n';

function correr(escrever) {
  const dir = mkdtempSync(join(tmpdir(), 'braco-a-mordida-'));
  try {
    escrever(dir);
    const saida = execFileSync(process.execPath, [RESUMO, dir], { encoding: 'utf8' });
    return JSON.parse(saida);
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
// Os tres sujeitos tem de existir ou o resumo sai com codigo 1; S2/S3 ficam vazios.
const vazios = (dir, escreverS1) => {
  escreverS1(dir);
  for (const s of ['S2', 'S3']) {
    writeFileSync(join(dir, `braco-a-${s}.json`), JSON.stringify(semgrepJson([])));
  }
};

test('MAU: o controlo sem-rede perdeu um achado -> tem de dizer que NAO e identico', () => {
  const base = [achado('r.a', 'a.js', 10, 'x'), achado('r.b', 'b.js', 20, 'y')];
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson(base)));
    // o controlo perdeu o segundo achado — e exactamente isto que um controlo
    // que precisou de rede pareceria
    writeFileSync(join(dir, 'braco-a-S1.semrede.json'), JSON.stringify(semgrepJson(base.slice(0, 1))));
  }));
  const s1 = rel.sujeitos.find((s) => s.id === 'S1');
  assert.equal(s1.controlo_sem_rede.achados_identicos, false, 'comparador cego: aceitou um controlo diferente');
  assert.equal(s1.controlo_sem_rede.so_no_limpo, 1);
});

test('BOM: controlo igual -> identico', () => {
  const base = [achado('r.a', 'a.js', 10, 'x')];
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson(base)));
    writeFileSync(join(dir, 'braco-a-S1.semrede.json'), JSON.stringify(semgrepJson(base)));
  }));
  assert.equal(rel.sujeitos.find((s) => s.id === 'S1').controlo_sem_rede.achados_identicos, true);
});

test('MAU: dois achados no MESMO span com mensagens diferentes nao podem colapsar', () => {
  // O caso real: detect-child-process casou duas vezes em shadow-judge.js:80,
  // uma por metavariavel. Uma chave sem a mensagem come um achado real.
  const dois = [
    achado('r.a', 'a.js', 80, 'argumento `model`'),
    achado('r.a', 'a.js', 80, 'argumento `prompt`'),
  ];
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson(dois)));
  }));
  const s1 = rel.sujeitos.find((s) => s.id === 'S1');
  assert.equal(s1.volume_entregue_ao_humano, 2);
  assert.equal(s1.achados_distintos_apos_colapso_exacto, 2, 'chave ingenua: comeu um achado real');
});

test('MAU: um connect() para fora tem de contar como saiu-da-maquina', () => {
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([])));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'),
      EXECVE_SEMGREP +
      '111   connect(3, {sa_family=AF_UNIX, sun_path="/tmp/x.sock"}, 20) = 0\n' +
      '111   connect(4, {sa_family=AF_INET, sin_port=htons(80), sin_addr=inet_addr("127.0.0.1")}, 16) = 0\n' +
      '112   connect(5, {sa_family=AF_INET, sin_port=htons(443), sin_addr=inet_addr("34.117.59.81")}, 16) = -1 EINPROGRESS\n');
  }));
  const r = rel.sujeitos.find((s) => s.id === 'S1').criterio_5_rede;
  assert.equal(r.saiu_da_maquina, true, 'detector cego a um connect() externo');
  assert.deepEqual(r.externos, ['34.117.59.81']);
  assert.equal(r.af_unix, 1, 'AF_UNIX contado como externo ou nao contado de todo');
  assert.equal(r.loopback, 1, '127.0.0.1 classificado como externo');
});

test('BOM: trace sem connect nenhum -> nao saiu, mas so porque foi medido', () => {
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([])));
    writeFileSync(join(dir, 'braco-a-S1.connect.trace'), EXECVE_SEMGREP + '111   --- SIGCHLD ---\n');
  }));
  const r = rel.sujeitos.find((s) => s.id === 'S1').criterio_5_rede;
  assert.equal(r.medido, true);
  assert.equal(r.saiu_da_maquina, false);
});

test('MAU: sem trace nenhum, o criterio 5 e n/d — nunca "nao saiu"', () => {
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([])));
  }));
  const r = rel.sujeitos.find((s) => s.id === 'S1').criterio_5_rede;
  assert.equal(r.medido, false, 'ausencia de medicao apresentada como prova de que nao saiu');
  assert.match(r.porque, /trace ausente/);
});

test('MAU: sem recibo, parede_s e n/d com o porque — nunca inventado', () => {
  const rel = correr((dir) => vazios(dir, () => {
    writeFileSync(join(dir, 'braco-a-S1.json'), JSON.stringify(semgrepJson([])));
  }));
  const r = rel.sujeitos.find((s) => s.id === 'S1').recibo_da_corrida;
  assert.equal(r.medido, false);
  assert.match(r.porque, /recibo ausente/);
  assert.equal(r.parede_s, undefined, 'inventou um tempo de parede sem recibo');
});
