'use strict';
/**
 * entrega.test.js — Onda W9 / Fase D: o gate de conteúdo que faltava.
 *
 * fleet.test.js já garante que a versão do manifest tem uma chave em
 * entregas-por-versao.json. O que faltava: para cada ficheiro que essa chave
 * declara, provar que a funcionalidade está mesmo lá — não só que o ficheiro
 * existe. Um `fs.existsSync` sozinho passa com um ficheiro vazio; os
 * marcadores abaixo são strings literais que só sobrevivem no código se a
 * peça que descrevem ainda estiver implementada. Se alguém remover ou
 * renomear essa peça, a asserção falha a dizer QUAL ficheiro e QUAL marcador
 * desapareceu — nunca um assert genérico.
 *
 *   node --test packages/mooter-bridge/
 */

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert');

const ROOT = __dirname;

function readJson(file) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'));
}

function minorKey(version) {
  const match = /^(\d+)\.(\d+)/.exec(String(version || ''));
  return match ? match[1] + '.' + match[2] : null;
}

const manifest = readJson('manifest.json');
const entregas = readJson('entregas-por-versao.json');
const versao = minorKey(manifest.version);

// Um marcador por ficheiro é uma string literal lida do código real (não
// inventada) que só existe se a funcionalidade declarada estiver presente.
const MARCADORES = {
  // v1.20 — os dois loops de self-learning
  'sentinela.js': ['correrSentinela', 'resumoDaSentinela'],
  'afericao.js': ['avaliarResposta', 'resultadoDaAfericao'],
  // v1.23 — a Onda 1, parar a mentira
  'board.js': ['custo_total_usd', 'cobertura_custo_pct'],
  'seamless.js': ['relocacao_recusada', 'stepsTotalFor', 'requireClassify'],
  'tools6.js': ['permissoes_diferenca', 'primeira_vez'],
  'server-apps.js': ['resourceUri'],
  // v1.24 — a ETA e o SYNC gerado
  'capacidades.js': ['mcp-capabilities.json', 'registarInitialize'],
  'eta.js': ['eta-index.json', 'MIN_OBSERVATIONS'],
  'estimativa.js': ['estimateJob', 'a-trabalhar'],
  'fleet.js': ['etaBarModel', 'summarizeWorktrees'],
  'fleet-ui.html': ['eta-track', 'fill_pct'],
  'sync.js': ['semHead'],
  'worktrees.js': ['total_bruto', 'suspeita'],
  // v1.25 — o tecto de VRAM e a ETA que deixou de fingir 100%
  'moo.js': ['FOLGA_MINIMA_GB', 'falta_vram'],
  'localfirst.js': ['falta_vram'],
  // v1.26 — o trabalho passou a saber de que departamento é
  'recibo.js': ['VALID_CARGOS', 'VERDICT_QUESTION'],
  // v1.27 — F0: distribuição honesta (release do .mcpb, classify.js no bundle,
  // user_config, diagnóstico primeira_vez, GitHub Releases API)
  'manifest.json': ['user_config'],
  'update.js': ['releasesGitHub', 'procurarAsync'],
};

test('entregas-por-versao.json declara a versão actual do manifest', () => {
  assert.ok(versao, 'manifest.version "' + manifest.version + '" não é semver');
  assert.ok(
    Object.prototype.hasOwnProperty.call(entregas, versao),
    'manifest anuncia ' + manifest.version + ' mas entregas-por-versao.json não declara ' + versao,
  );
});

/**
 * ⚠️ Verificar só a versão actual deixa as anteriores sem guarda.
 *
 * A primeira versão deste ficheiro percorria apenas `entregas[versao]`. Isso
 * cobre a entrega que estamos a fazer agora e abandona todas as outras: uma
 * regressão que apague o `custo_total_usd` do board — entregue na 1.23 — passa
 * despercebida enquanto a versão corrente for outra. As entregas passadas são
 * promessas que continuam de pé; o gate percorre-as todas.
 */
const versoesDeclaradas = Object.keys(entregas);

for (const chave of versoesDeclaradas) {
  const declarados = Array.isArray(entregas[chave]) ? entregas[chave] : [];
  const actual = chave === versao ? ' (versão actual)' : '';

  for (const ficheiro of declarados) {
    test('entrega ' + chave + actual + ' — ' + ficheiro + ' existe no repo', () => {
      assert.ok(
        fs.existsSync(path.join(ROOT, ficheiro)),
        'ficheiro declarado em entregas-por-versao.json["' + chave + '"] não existe: ' + ficheiro,
      );
    });

    test('entrega ' + chave + actual + ' — ' + ficheiro + ' tem marcadores definidos neste teste', () => {
      assert.ok(
        Object.prototype.hasOwnProperty.call(MARCADORES, ficheiro) && MARCADORES[ficheiro].length > 0,
        ficheiro + ' está declarado em entregas-por-versao.json["' + chave + '"] mas entrega.test.js não '
          + 'tem marcadores de conteúdo para ele — adiciona-os a MARCADORES antes de confiar nesta entrega.',
      );
    });

    for (const marcador of MARCADORES[ficheiro] || []) {
      test('entrega ' + chave + actual + ' — ' + ficheiro + ' contém "' + marcador + '"', () => {
        const conteudo = fs.readFileSync(path.join(ROOT, ficheiro), 'utf8');
        assert.ok(
          conteudo.includes(marcador),
          ficheiro + ': falta o marcador de conteúdo "' + marcador + '" — a entrega declarada '
            + 'para a versão ' + chave + ' não está implementada (ou foi regredida).',
        );
      });
    }
  }
}
