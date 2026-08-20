/**
 * sync-device.test.mjs — a skill `moo-sync` nao pode prometer o que o script
 * nao faz. Uma skill desactualizada nao e documentacao atrasada: e uma
 * instrucao errada a um executor, e foi exactamente isso que aconteceu com o
 * Windows (mandava `cd ~/frugal` e `export`, que em PowerShell nao existem).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const SCRIPT = path.join(REPO, 'tools', 'cockpit', 'sync-device.mjs');
const SKILL = fs.readFileSync(path.join(REPO, '.claude', 'skills', 'moo-sync', 'SKILL.md'), 'utf8');
const FONTE = fs.readFileSync(SCRIPT, 'utf8');

test('o script existe e o --check nao escreve nada', () => {
  assert.ok(fs.existsSync(SCRIPT));
  assert.match(FONTE, /SO_RELATA/, 'tem de haver um modo que so relata');
  // Cada escrita tem de estar atras do guarda. Um --check que escreve e uma
  // armadilha: usa-se justamente quando nao se quer mexer em nada. A janela
  // INCLUI a propria linha — o guarda mais comum e `if (!SO_RELATA) escreve()`,
  // na mesma linha, e a primeira versao deste teste so olhava para tras.
  const escritas = FONTE.split('\n')
    .filter((l) => /(copiar\(|execFileSync\(process\.execPath|git\(\['pull')/.test(l))
    .filter((l) => !/^\s*(\/\/|\*)/.test(l) && !l.includes('function copiar'));
  assert.ok(escritas.length >= 3, 'nao encontrei as escritas — o teste deixou de medir o que diz medir');
  for (const linha of escritas) {
    const i = FONTE.indexOf(linha);
    const janela = FONTE.slice(Math.max(0, i - 300), i + linha.length);
    assert.match(janela, /SO_RELATA/, `escrita sem guarda de --check: ${linha.trim().slice(0, 60)}`);
  }
});

test('nunca sai com erro — informa, nao bloqueia', () => {
  // Um alinhador que devolve codigo de erro acaba dentro de um `|| true` na
  // primeira semana, e a partir dai ninguem le a saida dele.
  assert.doesNotMatch(FONTE, /process\.exit\(\s*[1-9]/, 'o script nao pode sair com erro');
  const r = execFileSync(process.execPath, [SCRIPT, '--check'], { cwd: REPO, encoding: 'utf8' });
  assert.match(r, /Mooter · alinhar este device/);
});

test('nada de shell — tem de correr igual nos tres sistemas', () => {
  // A skill do Moo Pilot mandava `cd ~/frugal` e `export` para uma maquina
  // Windows. A regra aqui e nao haver um unico comando de shell.
  assert.doesNotMatch(FONTE, /\bexecSync\(/, 'execSync abre uma shell — depende do sistema');
  assert.doesNotMatch(FONTE, /shell:\s*true/);
  for (const bin of [...FONTE.matchAll(/execFileSync\('([^']+)'/g)].map((m) => m[1])) {
    assert.ok(['git', 'gh'].includes(bin), `${bin} nao e garantido nos tres sistemas`);
  }
});

test('o conector para no ultimo gesto, e diz porque', () => {
  // Forjar o registo de extensoes poria a app a conhecer uma versao que nunca
  // instalou. O script descarrega e para.
  assert.match(FONTE, /release', 'download'/, 'tem de descarregar o .mcpb');
  assert.doesNotMatch(FONTE, /writeFileSync[^)]*extensions-installations/, 'nunca escrever no registo do Desktop');
  assert.match(SKILL, /o último gesto é do dono/i);
  // O texto quebra a linha a meio da frase — o regex tem de tolerar isso.
  assert.match(SKILL, /não\s+inventes\s+uma\s+forma\s+de\s+contornar/i);
});

test('a skill da o gesto nas duas plataformas', () => {
  assert.match(SKILL, /macOS \/ Linux/);
  assert.match(SKILL, /Windows \(PowerShell\)/);
  assert.ok(SKILL.includes('cd $HOME'), 'o caminho do Windows tem de aparecer como o PowerShell o escreve');
});

test('todo o comando que a skill promete existe no package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
  for (const m of SKILL.matchAll(/npm run ([a-z:-]+)/g)) {
    assert.ok(pkg.scripts[m[1]], `a skill promete "npm run ${m[1]}" e o package.json nao o tem`);
  }
});
