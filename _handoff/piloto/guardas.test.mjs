/**
 * guardas.test.mjs — os dois buracos que a manhã do piloto revelou.
 *
 * Escrito VERMELHO antes do fix (regra 5 da wave): `guardas.mjs` ainda não
 * existe quando isto corre pela primeira vez.
 *
 * BUG 1 — o argumento que se parte no espaço.
 *   `driver.mjs:204` faz spawnSync(..., { shell: true }), e com shell:true o
 *   Node CONCATENA os argumentos sem os escapar (DEP0190, impresso na consola
 *   da corrida abortada). O `--settings` dos braços A e C é
 *   `C:\Users\Paulo Loureiro\frugal\_handoff\piloto\settings.no-mooter.json`:
 *   parte-se em `Paulo`, e o CLI responde `Settings file not found: C:\Users\Paulo`.
 *   Efeito medido: A e C fizeram 3/3 tentativas com 0 bytes de transcrição e o
 *   piloto ia declarar MOOTER 3-0 contra dois braços que nunca arrancaram.
 *   O teste não simula: passa mesmo pelo shell e compara o que o filho recebeu.
 *
 * BUG 2 — o braço que não existiu passa por "incompleto".
 *   Um braço com 0 bytes em TODAS as tentativas não é um braço incompleto: é um
 *   braço que não correu. O harness registava-o como `TECTO ATINGIDO` e seguia,
 *   e o `resultado.md` sairia mecanicamente correcto e factualmente falso. O
 *   P0-C prova que correu o código certo; nada provava que o braço correu.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { citaArg, bracoSemSaida } from "./guardas.mjs";

const COM_ESPACO = "C:\\Users\\Paulo Loureiro\\frugal\\_handoff\\piloto\\settings.no-mooter.json";

/**
 * O que o processo filho REALMENTE recebeu, via o mesmo `shell: true` do driver.
 *
 * ⚠️ O script do `-e` vai com aspas fixas e SEM espaços por dentro: a primeira
 * versão deste helper passava `console.log(process.argv[1] ?? '')` em cru e
 * partia-se no shell exactamente como o bug que vem medir — o harness sofria do
 * defeito que estava a testar e devolvia string vazia nas duas variantes. As
 * aspas aqui são literais de propósito, não `citaArg()`: um teste que usa a
 * função sob teste para montar o seu próprio andaime não prova nada.
 */
const PRINT = '"console.log(process.argv[1]||String())"';
/**
 * ⚠️ O PRÓPRIO `process.execPath` leva aspas: é `C:\Program Files\nodejs\node.exe`
 * e, com `shell: true`, o cmd.exe partia-o em `C:\Program` — "is not recognized as
 * an internal or external command". O mesmo defeito, agora no comando em vez do
 * argumento. Custou duas iterações deste helper: enquanto o node não arrancava,
 * as DUAS variantes devolviam string vazia e o teste dizia que o fix não
 * funcionava. Quotar o comando é o que torna a comparação do argumento honesta.
 */
const NODE = '"' + process.execPath + '"';
function argRecebido(arg) {
  const r = spawnSync(NODE, ["-e", PRINT, arg], { encoding: "utf8", shell: true });
  return String(r.stdout || "").trim();
}

test("BUG 1 — repro: com shell:true, o caminho com espaço chega mutilado ao filho", () => {
  const recebido = argRecebido(COM_ESPACO);
  assert.notEqual(recebido, COM_ESPACO, "se isto passar, o bug desapareceu sozinho — reconfirma antes de apagar o teste");
  assert.ok(recebido.startsWith("C:\\Users\\Paulo") && !recebido.includes("Loureiro"),
    `esperava truncado em 'Paulo', recebi: ${recebido}`);
});

test("BUG 1 — fix: citaArg() entrega o caminho inteiro através do mesmo shell", () => {
  assert.equal(argRecebido(citaArg(COM_ESPACO)), COM_ESPACO);
});

test("BUG 1 — citaArg() não mexe no que não precisa", () => {
  assert.equal(citaArg("--verbose"), "--verbose");
  assert.equal(citaArg("C:\\sem-espacos\\x.json"), "C:\\sem-espacos\\x.json");
});

test("BUG 2 — braço com 0 bytes em todas as tentativas é recusado, não registado", () => {
  const vazio = [{ stdout: "" }, { stdout: "" }, { stdout: "" }];
  assert.equal(bracoSemSaida(vazio), true);
});

test("BUG 2 — uma única tentativa com saída real já não é um braço vazio", () => {
  assert.equal(bracoSemSaida([{ stdout: "" }, { stdout: '{"type":"result"}' }, { stdout: "" }]), false);
});

test("BUG 2 — whitespace não conta como saída (0 bytes úteis é 0 bytes)", () => {
  assert.equal(bracoSemSaida([{ stdout: "  \n" }, { stdout: "\t" }]), true);
});

test("BUG 2 — sem tentativas nenhumas também é braço vazio, nunca 'ok'", () => {
  assert.equal(bracoSemSaida([]), true);
});
