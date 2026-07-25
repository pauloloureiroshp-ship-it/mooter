'use strict';
/**
 * context.js — mooter-bridge v1.4.1: dar OLHOS ao modelo local.
 *
 * O problema que isto resolve, e porque a solução anterior era a errada:
 *
 * A v1.4.0 detectava "este goal pede leitura de ficheiro" e RECUSAVA despachar
 * para o `moo`, porque o Ollama não tem ferramentas de ficheiro. Era honesto —
 * evitava a resposta inventada — mas resolvia o sintoma pela amputação: o tier
 * local ficava proibido de fazer 90% do trabalho real de um vibe coder.
 *
 * A observação que muda tudo: **o servidor MCP corre em Node, no disco do
 * utilizador, e pode ler o ficheiro ele próprio.** O modelo local não precisa
 * de ferramentas — precisa de contexto. Ler o ficheiro e injectá-lo no prompt
 * custa milissegundos e $0, e transforma um motor que só sabia opinar num
 * motor que sabe analisar código a sério.
 *
 * É a diferença entre "o teu modelo local não serve para isto" e "o teu modelo
 * local acabou de auditar o teu ficheiro por zero dólares".
 *
 * Regras que não se negoceiam:
 *   · só lê DENTRO da worktree (nada de `../../.ssh`)
 *   · só ficheiros de texto com extensão conhecida
 *   · orçamento de caracteres duro — um modelo local tem contexto pequeno
 *   · o que não coube é DITO, nunca silenciosamente cortado
 */

const fs = require('fs');
const path = require('path');

// extensões que fazem sentido dar a um modelo. Binários e lock files ficam fora.
const TEXTO = /\.(js|mjs|cjs|ts|tsx|jsx|json|md|txt|py|rs|go|java|rb|php|sh|ps1|bat|yml|yaml|toml|ini|html|css|scss|sql|graphql|prisma|env\.example)$/i;
const IGNORAR = /(node_modules|\.git[\/\\]|dist[\/\\]|build[\/\\]|coverage[\/\\]|package-lock\.json|yarn\.lock|pnpm-lock)/i;

/** Todos os caminhos que o texto cita e que parecem ficheiros. */
function pathsCitados(texto) {
  const out = [];
  const re = /(?:^|[\s"'`(\[])([\w.@-]+(?:[\/\\][\w.@-]+)*\.[a-zA-Z0-9]{1,6})\b/g;
  let m;
  while ((m = re.exec(String(texto || ''))) !== null) {
    const p = m[1].replace(/\\/g, '/');
    if (!TEXTO.test(p) || IGNORAR.test(p)) continue;
    if (!out.includes(p)) out.push(p);
  }
  return out;
}

/** Resolve um caminho relativo DENTRO da worktree. Nunca fora. */
function resolverDentro(worktree, rel) {
  const raiz = path.resolve(worktree);
  const alvo = path.resolve(raiz, rel);
  if (alvo !== raiz && !alvo.startsWith(raiz + path.sep)) return null;   // path traversal
  return alvo;
}

/**
 * Procura o ficheiro na worktree quando o caminho citado não bate certo.
 * Um utilizador escreve "worktrees.js" e o ficheiro está em
 * `packages/mooter-bridge/worktrees.js`. Exigir o caminho exacto é exigir que
 * ele já saiba onde as coisas estão — que é precisamente o que não sabe.
 */
function procurar(worktree, nome, maxDepth) {
  const alvo = path.basename(nome).toLowerCase();
  const raiz = path.resolve(worktree);
  const fila = [{ dir: raiz, d: 0 }];
  const encontrados = [];
  while (fila.length && encontrados.length < 4) {
    const { dir, d } = fila.shift();
    if (d > (maxDepth || 4)) continue;
    let ents;
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of ents) {
      const full = path.join(dir, e.name);
      if (IGNORAR.test(full)) continue;
      if (e.isDirectory()) { if (!e.name.startsWith('.')) fila.push({ dir: full, d: d + 1 }); }
      else if (e.name.toLowerCase() === alvo) encontrados.push(full);
    }
  }
  return encontrados;
}

/**
 * Lê os ficheiros que o goal cita e devolve um bloco pronto a injectar.
 *
 * @returns {{bloco:string|null, lidos:Array, falhados:Array, chars:number, truncados:Array}}
 */
function lerParaPrompt(texto, worktree, budgetChars) {
  const budget = Math.max(2000, Number(budgetChars) || 24000);
  const citados = pathsCitados(texto);
  const lidos = []; const falhados = []; const truncados = [];
  let usado = 0;
  const partes = [];

  for (const rel of citados) {
    if (usado >= budget) { falhados.push({ path: rel, porque: 'orçamento de contexto esgotado' }); continue; }
    let alvo = resolverDentro(worktree, rel);
    let comoAchou = 'caminho directo';
    if (!alvo || !fs.existsSync(alvo)) {
      const achados = procurar(worktree, rel, 4);
      if (achados.length === 1) { alvo = achados[0]; comoAchou = 'encontrado por nome'; }
      else if (achados.length > 1) {
        falhados.push({ path: rel, porque: 'há ' + achados.length + ' ficheiros com esse nome — sê específico',
          candidatos: achados.map((a) => path.relative(worktree, a).replace(/\\/g, '/')) });
        continue;
      } else { falhados.push({ path: rel, porque: 'não existe nesta pasta de trabalho' }); continue; }
    }
    let conteudo;
    try {
      const st = fs.statSync(alvo);
      if (!st.isFile()) { falhados.push({ path: rel, porque: 'não é um ficheiro' }); continue; }
      conteudo = fs.readFileSync(alvo, 'utf8');
    } catch (e) { falhados.push({ path: rel, porque: 'não consegui ler: ' + ((e && e.code) || 'erro') }); continue; }

    const relFinal = path.relative(worktree, alvo).replace(/\\/g, '/');
    const restante = budget - usado;
    let corpo = conteudo;
    if (corpo.length > restante) {
      // cortar por linhas, não a meio de uma — e DIZER que se cortou
      const linhas = corpo.split('\n');
      const mantidas = [];
      let n = 0;
      for (const l of linhas) { if (n + l.length + 1 > restante) break; mantidas.push(l); n += l.length + 1; }
      corpo = mantidas.join('\n');
      truncados.push({ path: relFinal, linhas_dadas: mantidas.length, linhas_totais: linhas.length });
    }
    usado += corpo.length;
    lidos.push({ path: relFinal, chars: corpo.length, linhas: corpo.split('\n').length, como: comoAchou });
    partes.push('### ' + relFinal + '\n```\n' + corpo + '\n```');
  }

  if (!partes.length) return { bloco: null, lidos, falhados, chars: 0, truncados };

  const cabecalho = [
    '',
    '---',
    '## FICHEIROS REAIS (lidos do disco pelo Mooter, não inventados)',
    '',
    'Tu não tens ferramentas de ficheiro. O conector leu-os por ti e colou-os aqui.',
    'Trabalha SÓ sobre este conteúdo. ❌ Não inventes funções, ficheiros ou linhas que não estejam abaixo.',
    truncados.length ? '⚠️ ' + truncados.map((t) => t.path + ' foi cortado (' + t.linhas_dadas + ' de ' + t.linhas_totais + ' linhas)').join(' · ') : '',
    falhados.length ? '⚠️ não consegui ler: ' + falhados.map((f) => f.path + ' (' + f.porque + ')').join(' · ') : '',
    '',
  ].filter((l) => l !== '').join('\n');

  return { bloco: cabecalho + '\n' + partes.join('\n\n') + '\n---\n', lidos, falhados, chars: usado, truncados };
}

module.exports = { lerParaPrompt, pathsCitados, resolverDentro, procurar, TEXTO };
