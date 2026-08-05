'use strict';
/**
 * dono.js — a quem PERTENCE uma porta TCP em escuta.
 *
 * O PROBLEMA QUE ISTO RESOLVE, dito sem rodeios:
 *
 * O `preview.js` sabe responder "que framework serve esta porta". Não sabe
 * responder "que PASTA lançou esta porta". Enquanto houver uma só pasta na
 * máquina, as duas perguntas têm a mesma resposta e ninguém repara. Com 47
 * worktrees da mesma base de código, deixam de ter — e o painel passa a
 * mostrar a app de OUTRA sessão com o rótulo "o preview DESTA sessão".
 *
 * ⚠️ Isso é pior do que não mostrar nada. Um rectângulo vazio lê-se como
 * "não encontrei". A app errada lê-se como "encontrei" — e é a mesma classe
 * de mentira que o `lpProbe` contava com o `onload` do iframe e que o
 * `retrato()` contava ao fotografar a página de erro do browser. Terceira vez
 * na mesma feature. A regra já está escrita: **se a medição não distingue os
 * casos, a sonda está do lado errado.**
 *
 * A HEURÍSTICA DE PESO NÃO SE CONSEGUE SALVAR. Duas worktrees da mesma base
 * servem HTML idêntico byte a byte nos sinais que o `classificar()` mede:
 * mesmo `<title>`, mesmo `/@vite/client`, mesmo peso 100. O desempate cai no
 * `ms` — latência, ou seja, ruído. Nenhum ajuste de pesos resolve, porque a
 * informação que distingue as pastas **não está na resposta HTTP**.
 * (Veredicto independente do kimi-k3, 2026-08-04: "o rótulo DESTA sessão é
 * falso por construção — nada no código usa a pasta da sessão".)
 *
 * ONDE É QUE A INFORMAÇÃO ESTÁ ENTÃO: no processo dono da porta.
 *
 *     porta TCP  --netstat-->  PID  --Win32_Process-->  linha de comandos
 *                                                              |
 *                                            caminhos absolutos lá dentro
 *                                                              |
 *                                              a worktree que os contém
 *
 * ⚠️ RESSALVA QUE NÃO SE OMITE: o Windows **não expõe** o directório de
 * trabalho de um processo a outro processo sem APIs de depuração. A linha de
 * comandos é um PROXY, não o CWD. Um dev server lançado por npm/pnpm traz lá o
 * caminho absoluto do shim em `node_modules/.bin` *daquela* worktree, e na
 * prática chega. Quando não chega, a resposta é `n/d` COM o motivo — nunca um
 * palpite. É por isso que existe o campo `base`: diz de onde veio a atribuição,
 * para quem lê poder duvidar dela.
 */

const { execFile } = require('child_process');
const os = require('os');
const { dentroDe } = require('./paths.js');

const TIMEOUT_MS = 4000;
/** Até onde subir na árvore de processos à procura de um caminho reconhecível. */
const SALTOS_ATE_AO_PAI = 3;

/**
 * ⚠️ A COMPARAÇÃO QUE PARECE ÓBVIA E ESTÁ ERRADA.
 *
 * `"C:/.../frugal-site".startsWith("C:/.../frugal")` é **true**. Com 47 pastas
 * todas prefixadas por `frugal-`, um `startsWith` cru atribuiria metade da
 * frota à pasta principal — e o painel diria "é tua" com toda a confiança.
 *
 * Não escrevo a comparação aqui: o `paths.js` já a tem, já lida com a forma 8.3
 * (`PAULOL~1`) que aparece em linhas de comandos reais, e já foi partido uma
 * vez no Windows real para ficar assim. Duas implementações de "está dentro de"
 * no mesmo repo é uma delas errada à espera de vez.
 */
function contido(caminho, pasta) {
  if (!caminho || !pasta) return false;
  return dentroDe(barras(caminho), barras(pasta));
}

/**
 * ⚠️ AS DUAS FONTES ESCREVEM O MESMO CAMINHO DE MANEIRAS DIFERENTES.
 *
 *   Win32_Process.CommandLine  →  C:\Users\Paulo Loureiro\frugal-site\...
 *   git worktree list          →  C:/Users/Paulo Loureiro/frugal-site
 *
 * São a mesma pasta e strings distintas. Em Windows o `path.resolve` esconde a
 * diferença; fora dele, não — e foi assim que 4 destes testes ficaram vermelhos
 * na primeira execução. Um módulo cuja correcção depende do sistema onde é
 * testado não é verificável: uniformizar na fronteira torna a comparação a
 * mesma em todo o lado, e deixa ao `paths.js` o que só ele sabe (8.3 e
 * maiúsculas).
 */
function barras(p) { return String(p || '').replace(/\\/g, '/'); }

/** Caminhos absolutos de Windows escritos dentro de uma linha de comandos. */
function caminhosDaLinha(linha) {
  const bruto = String(linha || '');
  const achados = bruto.match(/[A-Za-z]:[\\/][^"'<>|?*\r\n]*/g) || [];
  return achados.map((c) => c.trim().replace(/[\\/]+$/, '')).filter(Boolean);
}

/**
 * Qual das pastas conhecidas contém algum dos caminhos citados.
 * Ganha a MAIS FUNDA: `frugal-site` vence `frugal` quando ambas encaixam.
 */
function pastaDosCaminhos(caminhos, pastas) {
  const candidatas = [];
  for (const pasta of pastas || []) {
    if (!pasta) continue;
    for (const caminho of caminhos || []) {
      if (contido(caminho, pasta)) { candidatas.push(String(pasta)); break; }
    }
  }
  if (!candidatas.length) return null;
  candidatas.sort((a, b) => barras(b).length - barras(a).length);
  return candidatas[0];
}

function correr(comando, argumentos, opts) {
  const o = opts || {};
  if (typeof o.execImpl === 'function') return o.execImpl(comando, argumentos);
  return new Promise((resolve) => {
    execFile(comando, argumentos, {
      timeout: o.timeout_ms || TIMEOUT_MS,
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      encoding: 'utf8',
    }, (erro, stdout) => {
      if (erro && !String(stdout || '').trim()) {
        resolve({ ok: false, erro: (erro && erro.message) || 'falhou', saida: '' });
        return;
      }
      resolve({ ok: true, erro: null, saida: String(stdout || '') });
    });
  });
}

/**
 * PID dono de cada porta em escuta, a partir de UMA chamada ao `netstat`.
 *
 * ⚠️ NÃO procuramos a palavra "LISTENING". Num Windows em português ela vem
 * traduzida ("À ESCUTA") e o parser devolveria zero linhas — falharia em
 * silêncio, e o painel diria "não consegui atribuir" com a informação à frente
 * dele. O que é invariante ao idioma é o endereço remoto de um servidor à
 * espera: `0.0.0.0:0` ou `[::]:0`. É por aí que se reconhece um listener.
 */
function pidsDoNetstat(saida) {
  const porPorta = new Map();
  for (const linha of String(saida || '').split(/\r?\n/)) {
    const campos = linha.trim().split(/\s+/);
    if (campos.length < 4) continue;
    if (!/^tcp$/i.test(campos[0])) continue;
    if (!/^(0\.0\.0\.0:0|\[::\]:0|\*:\*)$/.test(campos[2])) continue;
    const pid = Number(campos[campos.length - 1]);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    const m = campos[1].match(/:(\d{1,5})$/);
    if (!m) continue;
    const porta = Number(m[1]);
    if (!(porta > 0 && porta < 65536)) continue;
    // um listener em 0.0.0.0 e outro em [::] são o mesmo processo; fica o primeiro
    if (!porPorta.has(porta)) porPorta.set(porta, pid);
  }
  return porPorta;
}

function aceitarJson(texto) {
  const t = String(texto || '').trim();
  if (!t) return [];
  let dados;
  try { dados = JSON.parse(t); } catch { return null; }
  if (dados == null) return [];
  return Array.isArray(dados) ? dados : [dados];
}

/** Linha de comandos e pai de um conjunto de PIDs, numa só chamada. */
async function processos(pids, opts) {
  const lista = [...new Set((pids || []).map(Number).filter((p) => Number.isInteger(p) && p > 0))];
  if (!lista.length) return { mapa: new Map(), porque: null };
  const filtro = lista.map((p) => 'ProcessId=' + p).join(' or ');
  const script = '$ErrorActionPreference="Stop";'
    + 'Get-CimInstance Win32_Process -Filter "' + filtro + '"'
    + ' | Select-Object ProcessId,ParentProcessId,Name,CommandLine'
    + ' | ConvertTo-Json -Compress -Depth 2';
  const r = await correr('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], opts);
  if (!r.ok) return { mapa: new Map(), porque: 'o Win32_Process não respondeu: ' + r.erro };
  const linhas = aceitarJson(r.saida);
  if (linhas === null) return { mapa: new Map(), porque: 'o Win32_Process devolveu texto que não é JSON' };
  const mapa = new Map();
  for (const l of linhas) {
    const pid = Number(l && l.ProcessId);
    if (!Number.isInteger(pid)) continue;
    mapa.set(pid, {
      pid,
      pai: Number.isInteger(Number(l.ParentProcessId)) ? Number(l.ParentProcessId) : null,
      nome: l.Name != null ? String(l.Name) : null,
      linha: l.CommandLine != null ? String(l.CommandLine) : null,
    });
  }
  return { mapa, porque: null };
}

function semDono(porta, porque) {
  return { porta, pid: null, pasta: null, base: null, porque: porque || 'não medido' };
}

/**
 * Sobe a árvore de processos até encontrar uma linha de comandos que cite uma
 * pasta conhecida. Um `npm run dev` no Windows deixa `cmd.exe /c npm run dev`
 * pelo meio: às vezes é o filho que escuta e é o pai que tem o caminho
 * absoluto. Três saltos chegam, e o `vistos` fecha a porta a ciclos de PID
 * reciclado — que existem, e dariam um laço infinito num painel.
 */
function atribuir(porta, pid, mapa, pastas) {
  let actual = pid;
  const vistos = new Set();
  for (let salto = 0; salto <= SALTOS_ATE_AO_PAI; salto++) {
    if (!actual || vistos.has(actual)) break;
    vistos.add(actual);
    const proc = mapa.get(actual);
    if (!proc) break;
    const pasta = pastaDosCaminhos(caminhosDaLinha(proc.linha), pastas);
    if (pasta) {
      return {
        porta,
        pid,
        pasta,
        base: salto === 0
          ? 'linha de comandos do PID ' + pid
          : 'linha de comandos do PID ' + actual + ', ' + salto + 'º ascendente do PID ' + pid,
        porque: null,
      };
    }
    actual = proc.pai;
  }
  const proc = mapa.get(pid);
  const nome = proc && proc.nome ? proc.nome : 'processo ' + pid;
  return {
    porta,
    pid,
    pasta: null,
    base: null,
    // ⚠️ dizer o que se procurou e onde. "não sei" sem contexto é indistinguível de "não procurei".
    porque: 'a linha de comandos de ' + nome + ' (PID ' + pid + ') e dos seus '
      + SALTOS_ATE_AO_PAI + ' ascendentes não cita nenhuma das ' + (pastas || []).length
      + ' pastas conhecidas — pode ter sido lançado com caminhos relativos',
  };
}

/**
 * A quem pertence cada porta.
 *
 * UMA chamada ao `netstat` e UMA ao `Win32_Process` para todas as portas — não
 * uma por porta. Sondar 14 portas com 28 subprocessos seria pagar segundos por
 * informação que cabe em duas leituras.
 *
 * @param {number[]} portas
 * @param {object} opts { pastas, execImpl, timeout_ms, plataforma }
 * @returns {Promise<{porPorta: Map, base: string|null, porque: string|null}>}
 */
async function donosDasPortas(portas, opts) {
  const o = opts || {};
  const alvo = [...new Set((portas || []).map(Number).filter((p) => p > 0 && p < 65536))];

  const plataforma = o.plataforma || os.platform();
  if (plataforma !== 'win32') {
    const motivo = 'a atribuição de porta a pasta só está implementada em Windows (esta máquina é '
      + plataforma + ')';
    return { porPorta: new Map(alvo.map((p) => [p, semDono(p, motivo)])), base: null, porque: motivo };
  }
  if (!alvo.length) return { porPorta: new Map(), base: null, porque: null };

  const net = await correr('netstat', ['-ano'], o);
  if (!net.ok) {
    const motivo = 'o netstat não respondeu: ' + net.erro;
    return { porPorta: new Map(alvo.map((p) => [p, semDono(p, motivo)])), base: null, porque: motivo };
  }
  const pidPorPorta = pidsDoNetstat(net.saida);
  const pidsAlvo = alvo.map((p) => pidPorPorta.get(p)).filter(Boolean);

  const { mapa, porque: porqueProc } = await processos(pidsAlvo, o);
  if (porqueProc) {
    const parcial = new Map();
    // ⚠️ o PID já foi medido. Deitá-lo fora porque a segunda medição falhou
    // seria apagar informação verdadeira — o painel fica com menos do que sabe.
    for (const p of alvo) {
      parcial.set(p, { porta: p, pid: pidPorPorta.get(p) || null, pasta: null, base: null, porque: porqueProc });
    }
    return { porPorta: parcial, base: 'netstat', porque: porqueProc };
  }

  const pastas = (o.pastas || []).filter(Boolean);
  const porPorta = new Map();
  for (const porta of alvo) {
    const pid = pidPorPorta.get(porta) || null;
    porPorta.set(porta, pid
      ? atribuir(porta, pid, mapa, pastas)
      : semDono(porta, 'o netstat não mostra nenhum processo em escuta na porta ' + porta));
  }
  return { porPorta, base: 'netstat + Win32_Process', porque: null };
}

/**
 * `true` só quando foi MEDIDO que é desta pasta.
 * `false` só quando foi MEDIDO que é de outra.
 * `null` quando não se sabe — e `null` nunca se lê como `false`.
 */
function eMinha(dono, pastaSessao) {
  if (!dono || !dono.pasta || !pastaSessao) return null;
  return contido(dono.pasta, pastaSessao) || contido(pastaSessao, dono.pasta);
}

module.exports = {
  donosDasPortas, eMinha, contido, caminhosDaLinha, pastaDosCaminhos,
  pidsDoNetstat, processos, semDono, atribuir, TIMEOUT_MS, SALTOS_ATE_AO_PAI,
};
