#!/usr/bin/env node
/**
 * index.js — o launcher do Mooter. Menos de 200 linhas, e ZERO logica de produto.
 *
 * O TRABALHO E UM SO: se o payload existe em `~/.mooter/cli`, passa-lhe o stdio e
 * sai de cena. Se nao existe, atende o suficiente do MCP para PERGUNTAR se pode
 * prepara-lo (estado B1) e para dizer a verdade quando nao consegue (B2).
 *
 * PORQUE SEPARAR LAUNCHER E PAYLOAD. Um conector que traz o produto dentro do zip
 * fica preso a versao do dia da instalacao. Separados, o launcher quase nunca muda
 * e o payload actualiza-se pelo canal do entitlement, com manifesto assinado e
 * rollback (`tools/cli/lib/update-core.js`).
 *
 * NADA DE LOGICA DE PRODUTO AQUI — e uma regra, nao um estilo: tudo o que este
 * ficheiro souber fazer sozinho deixa de se poder actualizar. O tecto de 200
 * linhas e a ausencia de dependencias sao guardados por teste.
 */

'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const RAIZ = process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter');
const PAYLOAD = path.join(RAIZ, 'cli', 'mooter.js');
const PROTOCOLO = '2025-06-18';

/** O payload esta instalado? A unica pergunta que este ficheiro decide sozinho. */
function temPayload(o = {}) {
  const { existsImpl = fs.existsSync, payload = PAYLOAD } = o;
  try {
    return existsImpl(payload);
  } catch {
    return false;
  }
}

/**
 * Entrega o processo ao payload. `stdio: 'inherit'` e nao um pipe: uma copia
 * intermedia seria uma segunda coisa a poder partir-se, em bytes. E sai com o
 * codigo do payload — o host ve o que o payload viu, nao o que o launcher achou.
 */
function delegar(o = {}) {
  const { spawnImpl = spawn, payload = PAYLOAD, argv = process.argv.slice(2) } = o;
  const filho = spawnImpl(process.execPath, [payload, ...argv], {
    stdio: 'inherit',
    env: process.env,
  });
  filho.on('exit', (code, sinal) => process.exit(sinal ? 1 : code === null ? 1 : code));
  filho.on('error', (e) => {
    process.stderr.write(`mooter: nao consegui arrancar o payload: ${e.message}\n`);
    process.exit(1);
  });
  return filho;
}

// ── O MCP minimo, so para o caso de o payload nao existir ──────────────────
//
// Escrito a mao, sem dependencias, porque o bundle nao deve arrastar um SDK
// para atender tres metodos. Se este bloco crescer, e sinal de que logica de
// produto se infiltrou — e deve sair daqui para o payload.

function enviar(msg, escrever = (s) => process.stdout.write(s)) {
  escrever(JSON.stringify(msg) + '\n');
}

function resposta(id, result) {
  return { jsonrpc: '2.0', id, result };
}

/** O estado de uma sessao do launcher. Sem payload, e tudo o que ele guarda. */
function novoEstado() {
  return { clienteAceitaElicitation: false, jaPerguntou: false };
}

/**
 * Trata uma mensagem. Devolve a resposta (ou `null` para notificacoes).
 * Pura o suficiente para ser testada sem processos nem stdio.
 */
async function tratar(msg, estado, o = {}) {
  const { id, method, params } = msg || {};

  if (method === 'initialize') {
    const cap = (params && params.capabilities) || {};
    estado.clienteAceitaElicitation = !!cap.elicitation;
    return resposta(id, {
      protocolVersion: PROTOCOLO,
      capabilities: { tools: {} },
      serverInfo: { name: 'mooter-launcher', version: '0.1.0' },
    });
  }

  if (method === 'tools/list') {
    return resposta(id, {
      tools: [
        {
          name: 'mooter_preparar',
          description:
            'Prepara o Mooter neste computador (descarrega o payload). Corre sozinho no primeiro pedido.',
          inputSchema: { type: 'object', properties: {} },
        },
      ],
    });
  }

  if (method === 'tools/call') {
    const r = await preparar(estado, o);
    return resposta(id, { content: [{ type: 'text', text: r.texto }], isError: !r.ok });
  }

  if (id == null) return null; // notificacao: nada a responder
  return { jsonrpc: '2.0', id, error: { code: -32601, message: `metodo desconhecido: ${method}` } };
}

/**
 * O bootstrap (estado B1). Pergunta primeiro, se o host souber perguntar.
 *
 * `descarregarImpl` e injectado e HOJE NAO EXISTE — ver `tools/cli/lib/manifesto.js`:
 * sem chave de release publicada nao ha manifesto assinado para descarregar, e o
 * update recusa-se a aplicar o que nao consegue verificar. O launcher degrada da
 * MESMA maneira, de proposito: um launcher que descarregasse sem verificar seria
 * a porta que o resto do sistema fechou.
 */
async function preparar(estado, o = {}) {
  const { descarregarImpl = null, perguntarImpl = null } = o;

  if (temPayload(o)) return { ok: true, texto: 'O Mooter ja esta preparado.' };

  if (estado.clienteAceitaElicitation && perguntarImpl && !estado.jaPerguntou) {
    estado.jaPerguntou = true;
    const sim = await perguntarImpl('Vou preparar o Mooter neste computador (≈30 s). Posso?');
    if (!sim) {
      return { ok: false, texto: 'Sem problema — nada foi descarregado. Pede outra vez quando quiseres.' };
    }
  }

  if (typeof descarregarImpl !== 'function') {
    return {
      ok: false,
      texto:
        'O Mooter ainda nao esta instalado neste computador, e este launcher nao o consegue ' +
        'descarregar sozinho: falta a chave publica de release com que verificaria o que ia ' +
        'descarregar, e nada e instalado sem essa verificacao. Instala o payload com ' +
        '`npx @mooter/cli` e reinicia esta aplicacao.',
    };
  }

  try {
    await descarregarImpl();
  } catch (e) {
    // B2 — sem rede nao e uma avaria, e um aviao.
    const m = String((e && e.message) || e);
    if (/ENOTFOUND|EAI_AGAIN|ETIMEDOUT|network|fetch failed/i.test(m)) {
      return { ok: false, texto: 'Sem rede nao consigo descarregar o Mooter. Tento outra vez quando houver.' };
    }
    return { ok: false, texto: `Nao consegui preparar o Mooter: ${m.slice(0, 140)}` };
  }
  return { ok: true, texto: 'O Mooter esta preparado. Repete o teu pedido.' };
}

/** O loop de stdio. So corre quando nao ha payload. */
function servir(o = {}) {
  const estado = novoEstado();
  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (pedaco) => {
    buffer += pedaco;
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const linha = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!linha) continue;
      let msg;
      try {
        msg = JSON.parse(linha);
      } catch {
        continue; // linha ilegivel: ignorar e' melhor do que morrer a meio de um stream
      }
      try {
        const r = await tratar(msg, estado, o);
        if (r) enviar(r);
      } catch (e) {
        if (msg && msg.id != null) {
          enviar({ jsonrpc: '2.0', id: msg.id, error: { code: -32603, message: String((e && e.message) || e) } });
        }
      }
    }
  });
}

function main(o = {}) {
  if (temPayload(o)) return delegar(o);
  return servir(o);
}

if (require.main === module) main();

module.exports = { temPayload, delegar, tratar, preparar, servir, novoEstado, main, PAYLOAD, PROTOCOLO };
