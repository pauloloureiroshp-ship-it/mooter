// @ts-check
/**
 * ollama-system-prompt.test.js — o system prompt do executor local não pode
 * voltar a mandar o modelo responder em 3 frases.
 *
 * MATRIZ 12 (2026-09-10, D10): «nunca mais de 3 frases para perguntas simples»
 * ia em toda a chamada local do executor. Um pedido de cláusula, plano ou
 * passo a passo perdia antes de o modelo abrir a boca. Este teste lê o texto
 * que o adaptador envia — não uma cópia — e reprova se a restrição voltar.
 *
 *   node --test tools/router/providers/ollama-system-prompt.test.js
 */
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = fs.readFileSync(path.join(__dirname, 'ollama-api.js'), 'utf8');
const bloco = SRC.match(/const SYSTEM = \[([\s\S]*?)\]\.join\('\\n'\);/);

test('o bloco SYSTEM existe na forma esperada', () => {
  assert.ok(bloco, 'const SYSTEM = [ ... ].join(\'\\n\') não encontrado');
});

test('o system prompt do executor local não limita o número de frases', () => {
  const texto = bloco[1];
  assert.doesNotMatch(texto, /\d+\s*frases/i, 'voltou um tecto de frases ao system prompt local (D10)');
  assert.doesNotMatch(texto, /nunca mais de/i);
});

test('o system prompt pede tamanho proporcional ao pedido', () => {
  assert.match(bloco[1], /tamanho que o pedido exige/, 'a instrução de tamanho proporcional saiu');
});

test('opts.system continua a poder substituir o SYSTEM por completo', () => {
  // Quem precisa de um prompt terso de propósito (Option A tem o seu em
  // ollama_call_node.js) passa opts.system; o default não pode ignorá-lo.
  assert.match(SRC, /content:\s*opts\.system\s*\|\|\s*SYSTEM/, 'o adaptador deixou de honrar opts.system');
});
