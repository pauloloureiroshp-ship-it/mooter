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
const P = require('./paths.js');

// extensões que fazem sentido dar a um modelo. Binários e lock files ficam fora.
const TEXTO = /\.(js|mjs|cjs|ts|tsx|jsx|json|md|txt|py|rs|go|java|rb|php|sh|ps1|bat|yml|yaml|toml|ini|html|css|scss|sql|graphql|prisma|env\.example)$/i;
// ⚠️ codex#27131 — logs de sessão de agentes NUNCA entram no contexto de nenhum
// agente: o Codex já se auto-ingeriu e explodiu o próprio contexto. A quota
// (quota.js) lê esses caminhos SÓ para somar números; aqui são veto absoluto.
const IGNORAR = /(node_modules|\.git[\/\\]|dist[\/\\]|build[\/\\]|coverage[\/\\]|package-lock\.json|yarn\.lock|pnpm-lock|\.codex[\/\\]sessions|\.claude[\/\\]projects)/i;

/** Todos os caminhos que o texto cita e que parecem ficheiros. */
function pathsCitados(texto) {
  const out = [];
  const aceitar = (bruto) => {
    const p = bruto.replace(/\\/g, '/');
    if (!TEXTO.test(p) || IGNORAR.test(p)) return;
    if (!out.includes(p)) out.push(p);
  };

  // 1º passo — caminhos ABSOLUTOS, que podem conter ESPAÇOS.
  // ⚠️ O caminho de utilizador por omissão do Windows é `C:\Users\Nome Apelido\…`.
  // O padrão relativo abaixo exige um `\s` antes e não aceita espaço lá dentro,
  // por isso arrancava DEPOIS do espaço e devolvia `Apelido/frugal/x.js` — um
  // caminho que não existe. Pior que falhar: `procurar()` só compara o basename,
  // portanto um fragmento truncado com UM único candidato era lido em silêncio
  // como sucesso, injectando o ficheiro de OUTRA worktree no prompt do modelo.
  // Não-guloso até à primeira extensão, e a fatia consumida é apagada (mantendo
  // o comprimento) para o 2º passo não voltar a apanhar o fragmento de dentro.
  const ABS = /[A-Za-z]:[\\/][^"'`\n\r,;|]*?\.[a-zA-Z0-9]{1,6}(?=$|[\s"'`)\],;|])/g;
  const resto = String(texto || '').replace(ABS, (m) => { aceitar(m); return ' '.repeat(m.length); });

  // 2º passo — relativos ("worktrees.js", "src/alpha.js").
  const re = /(?:^|[\s"'`(\[])([\w.@-]+(?:[\/\\][\w.@-]+)*\.[a-zA-Z0-9]{1,6})\b/g;
  let m;
  while ((m = re.exec(resto)) !== null) aceitar(m[1]);
  return out;
}

/** Resolve um caminho relativo DENTRO da worktree. Nunca fora. */
function resolverDentro(worktree, rel) {
  const raiz = path.resolve(worktree);
  const alvo = path.resolve(raiz, rel);
  // ⚠️ a verificação de traversal usa canon(): sem isso, em Windows um caminho
  // em 8.3 podia escapar a uma raiz escrita na forma longa.
  if (!P.dentroDe(alvo, raiz)) return null;
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
 * NUMERAR AS LINHAS — a causa-raiz nº1 da medição de eficiência de 2026-09-02.
 *
 * O experimento correu 6 tarefas fechadas com verdade por `grep`. Os dois jobs
 * locais que chegaram ao fim acertaram **3/3 dos factos e 0/3 das linhas**:
 *
 *   ci-prs.mjs   disse 103 / 10 / 43-50      real 48 / 28 / 37-49
 *   gh-bin.mjs   disse 103 / 106 / 120       real 117 / 41 / 125
 *
 * Não é o modelo a mentir: é este ficheiro a injectar o conteúdo CRU. Sem
 * números, qualquer `ficheiro:linha` que o modelo escreva é um palpite sobre
 * uma coisa que ele nunca viu — e alimenta o bucket `linha-errada`, 18,8% dos
 * 1.072 achados do `receipts-check`.
 *
 * Formato `NNN│ texto`, largura fixa por ficheiro. Três escolhas, e nenhuma é
 * arbitrária:
 *
 *  · **`│` (U+2502) e não `:`** — um `:` colaria a `48: const x` e o modelo, ao
 *    citar, tem de decidir onde acaba o número. A barra vertical não aparece em
 *    código real e não se confunde com conteúdo.
 *  · **Largura fixa**, alinhada à direita, calculada sobre o TOTAL de linhas do
 *    ficheiro e não sobre as que couberam — senão um corte mudava o alinhamento
 *    a meio e o modelo via duas colunas onde só há uma.
 *  · **Começa em 1**, que é o que um editor mostra e o que um `sed -n 48p` lê.
 *    Qualquer outra base seria uma segunda convenção de linha neste projecto.
 *
 * @returns {{linhas: string[], largura: number}}
 */
function numerarLinhas(texto) {
  const linhas = String(texto == null ? '' : texto).split('\n');
  const largura = Math.max(3, String(linhas.length).length);
  return {
    linhas: linhas.map((l, i) => String(i + 1).padStart(largura, ' ') + '\u2502 ' + l),
    largura,
  };
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
    // Numerar ANTES de cortar: o orçamento tem de contar o que é MESMO
    // injectado. Numerar depois faria o bloco passar do tecto em silêncio —
    // exactamente o tipo de corte mudo que o cabeçalho deste ficheiro proíbe.
    const num = numerarLinhas(conteudo);
    let linhasFinais = num.linhas;
    const totais = num.linhas.length;
    let corpo = linhasFinais.join('\n');
    if (corpo.length > restante) {
      // cortar por linhas, não a meio de uma — e DIZER que se cortou
      const mantidas = [];
      let n = 0;
      for (const l of linhasFinais) { if (n + l.length + 1 > restante) break; mantidas.push(l); n += l.length + 1; }
      linhasFinais = mantidas;
      corpo = mantidas.join('\n');
      truncados.push({ path: relFinal, linhas_dadas: mantidas.length, linhas_totais: totais });
    }
    usado += corpo.length;
    lidos.push({
      path: relFinal, chars: corpo.length, linhas: linhasFinais.length, como: comoAchou,
      numerado: true, largura_do_numero: num.largura,
    });
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
    '',
    '📏 CADA LINHA VEM PREFIXADA COM O SEU NÚMERO REAL NO FICHEIRO, no formato `NNN│ texto`.',
    'São os números do ficheiro em disco, a começar em 1 — os mesmos que um editor mostra.',
    'Quando citares uma linha, usa ESSE número e nunca um que tenhas contado.',
    'O prefixo `NNN│ ` não faz parte do código: não o incluas em nada que cites como conteúdo.',
    truncados.length ? '⚠️ ' + truncados.map((t) => t.path + ' foi cortado (' + t.linhas_dadas + ' de ' + t.linhas_totais + ' linhas)').join(' · ') : '',
    falhados.length ? '⚠️ não consegui ler: ' + falhados.map((f) => f.path + ' (' + f.porque + ')').join(' · ') : '',
    '',
  ].filter((l) => l !== '').join('\n');

  return { bloco: cabecalho + '\n' + partes.join('\n\n') + '\n---\n', lidos, falhados, chars: usado, truncados };
}

module.exports = { lerParaPrompt, pathsCitados, resolverDentro, procurar, numerarLinhas, TEXTO };
