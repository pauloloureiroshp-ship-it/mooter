/**
 * actualizacao.mjs — dizer ao dono como actualizar o conector, sem o actualizar.
 *
 * O Ledger ja mostra, no cabecalho, a versao INSTALADA e a versao do repo, e
 * carimba-as a vermelho quando divergem. O que faltava era o passo seguinte:
 * onde esta o ficheiro, e o que se faz com ele.
 *
 * ⚠️ ESTE MODULO NAO INSTALA NADA, e a recusa e a funcionalidade.
 *
 * Instalar um `.mcpb` e escrever dentro do Claude Desktop do dono e reiniciar a
 * aplicacao dele. Um painel que faca isso sozinho — mesmo bem — tirou-lhe a
 * decisao sobre o que corre na maquina dele. E o mesmo criterio que ja governa
 * o merge, o push e o delete neste repositorio: o irreversivel e do dono. Por
 * isso a resposta e uma INSTRUCAO, com o caminho exacto.
 *
 * E a segunda regra: se o bundle nao existir em disco, diz-se que nao existe e
 * diz-se como o construir. Nunca se aponta para um caminho que ninguem provou.
 */

import fs from 'node:fs';
import path from 'node:path';

/** `1.53.0` -> `mooter-v1530.mcpb`. A mesma regra do `pack-mcpb.mjs`, e so ela. */
export function nomeDoBundle(versao) {
  const v = String(versao || '').trim();
  if (!/^\d+\.\d+\.\d+$/.test(v)) return null;
  return `mooter-v${v.replace(/\./g, '')}.mcpb`;
}

/**
 * O estado da actualizacao deste device.
 *
 * Nao adivinha o "mais novo" por data de ficheiro: pergunta ao repo qual e a
 * versao que ele declara (`packages/mooter-bridge/manifest.json`) e procura
 * EXACTAMENTE o bundle dessa versao. Escolher pelo `mtime` daria o ficheiro
 * mais recentemente tocado, que num `_handoff/` com tres bundles antigos e uma
 * loteria — e apontar o dono para o bundle errado e pior do que nao apontar.
 *
 * @returns objecto sempre com a mesma forma; `null` em tudo o que nao foi lido.
 */
export function estadoDaActualizacao({
  repoRoot,
  instalada = null,
  disponivel = null,
  existsImpl = fs.existsSync,
  statImpl = fs.statSync,
} = {}) {
  const nome = nomeDoBundle(disponivel);
  const rel = nome ? path.join('_handoff', nome) : null;
  const abs = rel ? path.join(repoRoot, rel) : null;
  const existe = Boolean(abs && existsImpl(abs));

  let bytes = null;
  if (existe) {
    try { bytes = statImpl(abs).size; } catch { bytes = null; }
  }

  // `null` em qualquer dos lados quer dizer que NAO SE SABE se ha diferenca —
  // e nao-saber nunca se arredonda para "estas em dia".
  const atrasado = instalada && disponivel ? instalada !== disponivel : null;

  const faz_assim = !disponivel
    ? 'o repo nao declara uma versao do conector — nao ha o que instalar'
    : (existe
      ? `abre ${rel} (duplo clique instala no Claude Desktop) e reinicia o Claude Desktop`
      : `constroi primeiro: cd packages/mooter-bridge && node pack-mcpb.mjs`);

  return {
    instalada,
    disponivel,
    atrasado,
    bundle: existe ? rel : null,
    bundle_bytes: bytes,
    bundle_existe: existe,
    faz_assim,
    // Escrito no payload de proposito: um dia alguem le este endpoint a espera
    // de um botao, e tem de encontrar aqui a razao de nao haver nenhum.
    instala_sozinho: false,
    porque_nao: 'instalar escreve no Claude Desktop e reinicia-o — e um gesto do dono, nunca do painel',
  };
}
