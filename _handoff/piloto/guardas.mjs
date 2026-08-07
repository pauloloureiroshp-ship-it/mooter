/**
 * guardas.mjs — as duas guardas que faltavam ao driver do piloto.
 *
 * Vive à parte do `driver.mjs` de propósito: o driver corre o seu main no topo
 * do módulo, portanto importá-lo num teste dispararia o piloto. Um módulo
 * minúsculo e puro é testável sem tocar nessa estrutura na manhã da medição.
 *
 * Ambas nasceram de falha medida, não de precaução — ver `guardas.test.mjs`.
 */

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
