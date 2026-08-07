/**
 * guardas.mjs — as duas guardas que faltavam ao driver do piloto.
 *
 * Vive à parte do `driver.mjs` de propósito: o driver corre o seu main no topo
 * do módulo, portanto importá-lo num teste dispararia o piloto. Um módulo
 * minúsculo e puro é testável sem tocar nessa estrutura na manhã da medição.
 *
 * Ambas nasceram de falha medida, não de precaução — ver `guardas.test.mjs`.
 */
import { readdirSync, existsSync, mkdirSync, renameSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";

/**
 * Torna um argumento seguro para `spawnSync(..., { shell: true })`.
 *
 * Com `shell: true` o Node concatena os argumentos numa linha de comando SEM os
 * escapar — é o que o `DEP0190` avisa. Um caminho com espaço (`C:\Users\Paulo
 * Loureiro\...`) parte-se em dois e o CLI recebe metade.
 *
 * Porquê aspas e não `shell: false`: sem shell, o `claude` no Windows dá ENOENT
 * (é um shim `.cmd`, não um executável). Medido nas três variantes antes de
 * escolher — as aspas foram a única que devolveu status 0.
 *
 * Aspas duplas funcionam nos dois shells que aqui interessam: em `cmd.exe` são o
 * delimitador nativo, e em `sh` (Git Bash) a barra invertida só é especial antes
 * de `$`, crase, `"` ou `\` — `\U`, `\P`, `\f` atravessam intactos.
 */
export function citaArg(arg) {
  const s = String(arg ?? "");
  if (!/\s/.test(s)) return s;                              // nada a fazer
  if (s.length > 1 && s.startsWith('"') && s.endsWith('"')) return s;  // idempotente
  return '"' + s + '"';
}

/**
 * Um braço que não produziu UM ÚNICO byte de transcrição em nenhuma tentativa
 * não é um braço incompleto — é um braço que não correu.
 *
 * A diferença não é semântica. `TECTO ATINGIDO — incompleto` é um resultado
 * legítimo do protocolo (o agente tentou e não fechou a tarefa) e entra no
 * `resultado.md` como tal. Um braço com 0 bytes nunca chegou a falar com o
 * modelo: registá-lo como "incompleto" transforma uma avaria do instrumento
 * numa medição do produto. Foi o que quase aconteceu a 2026-08-07 — A e C
 * mortos no `--settings`, e o piloto pronto a declarar MOOTER 3-0.
 *
 * Sem tentativas nenhumas devolve `true` pela mesma razão: ausência de prova
 * nunca é prova de sucesso.
 */
export function bracoSemSaida(tentativas) {
  const t = Array.isArray(tentativas) ? tentativas : [];
  if (!t.length) return true;
  return t.every((x) => !String((x && x.stdout) || "").trim());
}

// ---------------------------------------------------------------------------
// kit v2.2 · item 1 — onde vive o artefacto
// ---------------------------------------------------------------------------

/**
 * As raízes onde o artefacto de um run pode legitimamente estar.
 *
 * A bateria-1 (2026-08-07) mediu TRÊS destinos para o mesmo prompt:
 *   · braço A → raiz da worktree (`<wt>\index.html`)
 *   · braços B e C → scratchpad da sessão
 *     (`<tmp>\claude\<chave-do-projecto>\<session-id>\scratchpad\...`)
 *   · e, fora de qualquer sandbox, a HOME do Paulo (`~\moo-ranch\`) — essa NÃO
 *     entra aqui de propósito: um artefacto na home é uma fuga de isolamento a
 *     reportar, não um sítio onde procurar. Aceitá-lo seria legitimar que dois
 *     runs se vejam um ao outro.
 *
 * O `<session-id>` é o mesmo `--session-id` que o driver gera (confirmado contra
 * `meta.json.session_ids[0]` do B/e1), portanto o scratchpad é localizável sem
 * reproduzir a derivação da chave-de-projecto que o Claude Code faz do cwd — é
 * essa chave que fica no glob.
 */
export function raizesDeProcura(worktree, sessionIds, tmpClaudeRoot) {
  const raizes = [{ raiz: worktree, onde: "worktree" }];
  const ids = (Array.isArray(sessionIds) ? sessionIds : []).filter(Boolean);
  if (!tmpClaudeRoot || !ids.length) return raizes;
  let projectos = [];
  try { projectos = readdirSync(tmpClaudeRoot, { withFileTypes: true }).filter((e) => e.isDirectory()); }
  catch { return raizes; }
  for (const p of projectos) {
    for (const id of ids) {
      const sp = join(tmpClaudeRoot, p.name, id, "scratchpad");
      if (existsSync(sp)) raizes.push({ raiz: sp, onde: "scratchpad" });
    }
  }
  return raizes;
}

/** Pastas que nunca contêm o artefacto de um braço — só ruído de ferramentas. */
const IGNORAR = new Set(["node_modules", ".git", ".vscode", "dist", "build"]);

/**
 * Primeiro ficheiro com este nome sob as raízes dadas, em largura (o mais raso
 * ganha). Devolve o caminho absoluto, ou `null` — nunca um palpite.
 */
export function achaFicheiro(raizes, nome, limiteProfundidade = 6) {
  for (const { raiz } of raizes || []) {
    let fila = [{ dir: raiz, prof: 0 }];
    while (fila.length) {
      const seguinte = [];
      for (const { dir, prof } of fila) {
        let entradas = [];
        try { entradas = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
        for (const e of entradas) if (e.isFile() && e.name === nome) return join(dir, nome);
        if (prof >= limiteProfundidade) continue;
        for (const e of entradas) {
          if (!e.isDirectory() || IGNORAR.has(e.name)) continue;
          seguinte.push({ dir: join(dir, e.name), prof: prof + 1 });
        }
      }
      fila = seguinte;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// kit v2.3 · detecção + quarentena de fugas de isolamento
// ---------------------------------------------------------------------------

/** Comprimento mínimo de um segmento para servir de padrão. Abaixo disto recusa-se:
 *  varrer a HOME por um prefixo de 2 letras é como não ter padrão nenhum. */
const MIN_SEGMENTO = 4;

/**
 * O padrão de fuga sai do PRÓPRIO caminho do artefacto declarado na spec
 * (`moo-ranch/index.html` → `moo-ranch`), nunca de uma lista escrita à mão que
 * envelhece à parte da tarefa.
 *
 * Um artefacto sem pasta (`index.html`) não produz padrão: preferimos não
 * detectar a andar a mexer na HOME do Paulo por um prefixo genérico.
 */
export function padroesDeFuga(artefactoRel) {
  const seg = String(artefactoRel || "").split(/[\\/]/).filter(Boolean)[0] || "";
  if (!seg || seg.length < MIN_SEGMENTO) return [];
  if (seg === String(artefactoRel || "").trim()) return [];   // era só o ficheiro, sem pasta
  return [seg];
}

/** Directórios de topo da HOME cujo nome começa por um dos padrões. Só topo, só pastas. */
export function listaCandidatos(homeDir, padroes) {
  const ps = (padroes || []).filter((p) => p && p.length >= MIN_SEGMENTO);
  if (!homeDir || !ps.length) return [];
  let entradas = [];
  try { entradas = readdirSync(homeDir, { withFileTypes: true }); } catch { return []; }
  return entradas
    .filter((e) => e.isDirectory() && ps.some((p) => e.name.startsWith(p)))
    .map((e) => ({ nome: e.name, caminho: join(homeDir, e.name) }));
}

/**
 * Move os candidatos para `destino`. É isto que mata o veneno real: o run N nasce
 * sem conseguir ver o build do run N-1. Não impede a fuga — impede a herança.
 * Sem candidatos não cria a pasta (não se produz lixo para dizer que não houve nada).
 */
export function quarentena(candidatos, destino) {
  const cs = candidatos || [];
  if (!cs.length) return [];
  mkdirSync(destino, { recursive: true });
  const movidos = [];
  for (const c of cs) {
    const alvo = join(destino, c.nome);
    try {
      renameSync(c.caminho, alvo);                 // mesmo volume: instantâneo
    } catch {
      try {                                        // volumes diferentes: copia e remove
        cpSync(c.caminho, alvo, { recursive: true });
        rmSync(c.caminho, { recursive: true, force: true });
      } catch { continue; }                        // não conseguiu: fica declarado por ausência
    }
    movidos.push({ nome: c.nome, de: c.caminho, para: alvo });
  }
  return movidos;
}

/** O que apareceu entre os dois retratos. Desaparecer não é fuga. */
export function fugasNovas(antes, depois) {
  const a = new Set(antes || []);
  return (depois || []).filter((n) => !a.has(n));
}
