'use strict';
/**
 * testes-nao-escrevem-no-corpus.cjs — carregado por `--require` antes de
 * qualquer teste desta pasta (package.json → scripts.test).
 *
 * ── O DEFEITO, medido a 2026-09-03 nesta bancada ────────────────────────────
 *
 * O C1.3 pos o conector a escrever no corpus de routing os tokens que MEDIU
 * (`seamless.js` → `decisions_v2.appendMeasured`). O `appendMeasured` sem
 * `logPath` resolve para `~/.claude/tools/router/decisions_v2.jsonl` — o
 * corpus REAL do dono, o mesmo que a metrica-mae le.
 *
 * Dois testes desta pasta fazem um despacho a serio com motores de mentira
 * (`cadeia-nao-silenciosa.test.js`, com um Ollama em loopback, e
 * `v12.test.js:288`, com um stream `usage:{input_tokens:100,output_tokens:80}`).
 * Cada `npm test` injectava essas DUAS linhas no corpus do dono, rotuladas
 * `tokens_fonte: 'medido'`:
 *
 *     10/5   qwen2.5:3b  via mooter-moo     ← o stub do Ollama
 *     100/80 sonnet      via mooter-cc      ← a fixture do v12
 *
 * Medido: 420 linhas no corpus, 4 com `tokens_fonte: 'medido'` — e as 4 sao
 * dois pares identicos, um por cada corrida da suite (2026-09-02T12:13 e
 * 2026-09-03T10:30). ZERO vinham de um motor a serio.
 *
 * Ou seja: a mudanca escrita para impedir que um numero nao medido entrasse no
 * corpus era, ela propria, a unica coisa a por numeros inventados la dentro. E
 * pior do que o zero legado que ela veio corrigir: o zero pelo menos nao mentia
 * sobre a proveniencia.
 *
 * ── PORQUE AQUI, E NAO NO TOPO DOS DOIS TESTES ──────────────────────────────
 *
 * Porque uma lista de ficheiros envelhece. E a licao de 2026-08-29 (a guarda de
 * movimento reduzido nomeava 2 selectores e a folha tinha 6): presenca nao e
 * cobertura. Um teste novo que faca um despacho nasce coberto por estar nesta
 * pasta, e nao por alguem se ter lembrado.
 *
 * Redirecciona `MOOTER_CLAUDE_DIR` — a raiz, e nao o ficheiro — porque
 * `decisions_v2.js:routerDir()` a usa para TUDO o que escreve em
 * `~/.claude/tools/router/`. Qualquer escritor futuro nasce coberto pela mesma
 * linha. Nada no bridge LE esta variavel (so a reenvia aos filhos em
 * `seamless.js:859`), por isso redireccioná-la nao muda o que os testes medem.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

// Um alvo fixo, e nao um `mkdtemp` por processo: o `node --test` levanta um
// processo por ficheiro e nao ha aqui nada que alguem afirme — so nao pode ser
// a casa do dono. Fixo tambem nao deixa lixo a crescer a cada corrida.
const CASA_DE_TESTE = path.join(os.tmpdir(), 'mooter-bridge-corpus-de-teste');
fs.mkdirSync(path.join(CASA_DE_TESTE, 'tools', 'router'), { recursive: true });

// `||=` de propósito: quem quiser apontar para outro sitio (um teste que
// INSPECCIONE o que foi escrito) continua a mandar.
process.env.MOOTER_CLAUDE_DIR = process.env.MOOTER_CLAUDE_DIR || CASA_DE_TESTE;

module.exports = { CASA_DE_TESTE };
