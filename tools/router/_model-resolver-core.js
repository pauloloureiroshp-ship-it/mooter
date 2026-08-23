// _model-resolver-core.js — o parser de comandos por trás do `detectExternalModel`.
//
// Separado do `_model-resolver.js` só para o manter legível: aquele ficheiro é
// carregado sincronamente dentro do PostToolUse a cada chamada Bash, e o custo
// que importa é o do `require`, não o número de ficheiros.
//
// ─────────────────────────────────────────────────────────────────────────────
// PORQUE UM PARSER, e não uma expressão regular
//
// A versão original testava `/\bcodex\b/` contra o texto inteiro do comando.
// Medido no `execution.log` a 2026-08-23: 282 linhas `model=gpt-5-codex`, das
// quais 14 eram invocações reais — 268 fabricadas, 95,0%. `which codex` contava.
// Um `git add` contava.
//
// A minha PRIMEIRA correcção — trocar o `/\bcodex\b/` por "o executável do
// segmento" — foi bloqueada por uma revisão adversarial que encontrou nela uma
// fabricação NOVA, na direcção que favorece a poupança:
//
//   `ehInvocacao(cmd, 'ollama')` disparava em QUALQUER subcomando e devolvia
//   'qwen3:30b'. Logo `ollama list`, `ollama ps` e `ollama pull` passavam a ser
//   EXECUÇÕES locais, e o `bucketFor` conta local como trabalho grátis.
//
// Não era hipotético: `onboarding.js:145`, `mooter-doctor.js:264` e
// `hardware-matcher.js:106` imprimem `ollama pull …` para o dono colar no
// terminal. Ou seja: eu ia inflacionar a quota de $0 no próprio PR que existe
// para deixar de inflacionar números.
//
// A lição, e é a razão de este ficheiro existir: **um heurístico que erra sempre
// para o mesmo lado não é ruído, é viés.** Por isso, aqui, a resposta por
// omissão em cada ramo duvidoso é `null` — "não sei" — e nunca o motor mais
// barato.

'use strict';

/** Interpretadores: o que interessa é o SCRIPT que eles correm, não eles. */
const INTERPRETES = new Set(['bash', 'sh', 'zsh', 'dash', 'node', 'python', 'python3', 'pwsh', 'powershell']);
/** Prefixos que envolvem o comando real sem serem o comando. */
const PREFIXOS = new Set(['sudo', 'env', 'exec', 'nohup', 'time', 'command', 'nice', 'timeout']);
/**
 * Prefixos que consomem argumentos proprios antes do comando real.
 *
 * Sem isto, `timeout 30 codex exec x` resolvia para o executavel "30": o `30`
 * nao e uma flag, nao e uma atribuicao, e por isso passava no filtro. Um numero
 * nunca e um motor, mas a regra generica "salta o que parece numero" mascarava
 * casos legitimos — melhor dizer explicitamente quem consome o que.
 */
const PREFIXOS_COM_ARG = { timeout: 1, nice: 0 };

/**
 * Parte um comando em segmentos de tokens, respeitando aspas.
 *
 * A versão anterior partia a string crua com uma expressão regular, e era cega
 * a aspas de duas maneiras opostas:
 *
 *   `echo "a; codex exec b"`            -> segmento fantasma que virava codex
 *   `"C:\Program Files\codex\codex.exe"` -> partia em `"C:\Program` -> null
 *
 * A primeira FABRICAVA; a segunda PERDIA uma invocação real. E o segundo caso é
 * o normal nesta máquina — caminhos do Windows com espaços.
 */
function segmentar(cmd) {
  const s = String(cmd == null ? '' : cmd);
  const segs = [];
  let toks = [];
  let cur = '';
  let temCur = false;
  let aspa = null;

  const fecharToken = () => { if (temCur) { toks.push(cur); cur = ''; temCur = false; } };
  const fecharSeg = () => { fecharToken(); if (toks.length) segs.push(toks); toks = []; };

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (aspa) {
      if (c === aspa) aspa = null;
      else { cur += c; temCur = true; }
      continue;
    }
    if (c === '"' || c === "'") { aspa = c; temCur = true; continue; }
    if (c === '\\' && s[i + 1] === '"') { cur += '"'; temCur = true; i += 1; continue; }
    if ((c === '&' && s[i + 1] === '&') || (c === '|' && s[i + 1] === '|')) { fecharSeg(); i += 1; continue; }
    if (c === '|' || c === ';' || c === '\n') { fecharSeg(); continue; }
    if (c === ' ' || c === '\t' || c === '\r') { fecharToken(); continue; }
    cur += c; temCur = true;
  }
  fecharSeg();
  return segs;
}

/** `C:\bin\codex.exe` -> `codex`. Caminho e extensão fora. */
function nomeBase(token) {
  return String(token)
    .split(/[\\/]/).pop()
    .replace(/\.(exe|cmd|bat|ps1|sh|mjs|cjs|js|py)$/i, '');
}

/**
 * O executável de UM segmento, já em tokens.
 *
 * Um `bash -c "…"` devolve `null` AQUI de propósito: o script inline não é um
 * executável deste segmento, é um comando à parte, e quem o expande é o
 * `segmentosDe` logo abaixo. Sem essa separação, `sh -c "cd /repo && codex exec
 * x"` resolvia para `cd` e a invocação do Codex desaparecia do registo.
 */
function executavelDeTokens(toks) {
  for (let i = 0; i < toks.length; i += 1) {
    const t = toks[i];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t)) continue; // VAR=valor
    const base = nomeBase(t);
    if (PREFIXOS.has(base)) { i += PREFIXOS_COM_ARG[base] || 0; continue; }
    if (!INTERPRETES.has(base)) return { nome: base, toks };

    // Interprete + script: conta o SCRIPT. O caso `-c` nao passa por aqui —
    // e expandido em segmentos proprios pelo `segmentosDe`, para que a busca
    // por um motor os percorra a todos em vez de parar no primeiro.
    const resto = toks.slice(i + 1);
    if (resto.includes('-c')) return null;
    const script = resto.find((x) => !String(x).startsWith('-'));
    if (script) return { nome: nomeBase(script), toks: resto };
    return { nome: base, toks };
  }
  return null;
}

/**
 * Todos os segmentos de um comando, incluindo os que vivem dentro de um
 * `bash -c "..."`.
 *
 * A versao anterior recursava dentro do `-c` e devolvia o PRIMEIRO executavel
 * que encontrasse la dentro — o que, em `sh -c "cd /repo && codex exec x"`, era
 * o `cd`. A invocacao do Codex desaparecia do registo. Expandir para segmentos
 * irmaos resolve-o sem casos especiais: quem procura um motor percorre todos.
 */
function segmentosDe(cmd, profundidade = 0) {
  const out = [];
  for (const seg of segmentar(cmd)) {
    out.push(seg);
    const idxC = seg.indexOf('-c');
    if (idxC < 0 || seg[idxC + 1] == null || profundidade >= 3) continue;
    const chefe = seg.find((t) => !String(t).startsWith('-'));
    if (!chefe || !INTERPRETES.has(nomeBase(chefe))) continue;
    out.push(...segmentosDe(seg[idxC + 1], profundidade + 1));
  }
  return out;
}

/** O primeiro segmento que invoca `nome`, ou `null`. Devolve os TOKENS dele. */
function segmentoQueInvoca(cmd, nome) {
  for (const seg of segmentosDe(cmd)) {
    const r = executavelDeTokens(seg);
    if (r && r.nome === nome) return r.toks;
  }
  return null;
}

/** O comando INVOCA este programa? (não: "menciona-o algures no texto") */
function ehInvocacao(cmd, nome) {
  return segmentoQueInvoca(cmd, nome) !== null;
}

/**
 * `--model x` ou `--model=x`, lido APENAS nos tokens do segmento que invoca.
 *
 * Lê-lo do comando inteiro fazia um motor roubar a flag de outro:
 * `codex exec "a" ; gemini --model gemini-3-pro "b"` registava a chamada do
 * Codex como `gemini-3-pro`. E como o tokenizador já tira as aspas,
 * `--model "gemini-3-pro"` passa a funcionar — antes caía no default cravado,
 * que escrevia um id de modelo ESPECÍFICO e ERRADO no registo.
 */
function modeloDaFlag(toks) {
  if (!Array.isArray(toks)) return null;
  for (let i = 0; i < toks.length; i += 1) {
    const t = String(toks[i]);
    if (t === '--model' || t === '-m') {
      const v = toks[i + 1];
      return v && !String(v).startsWith('-') ? String(v) : null;
    }
    const m = t.match(/^--model=(.+)$/);
    if (m) return m[1];
  }
  return null;
}

module.exports = { segmentar, segmentosDe, nomeBase, executavelDeTokens, segmentoQueInvoca, ehInvocacao, modeloDaFlag, INTERPRETES, PREFIXOS };
