/**
 * O cartucho — a identificação da folha, como num desenho técnico.
 *
 * Identificação à esquerda, revisão à direita, hairline por baixo. É a primeira
 * coisa que se lê numa prancha, e serve para o mesmo aqui: dizer O QUE É esta
 * superfície e EM QUE ESTADO está, antes de qualquer conteúdo.
 *
 * A `revisao` não é decorativa: é a versão publicada, lida de `version.json`,
 * que por sua vez é escrito pelo `version-sync.yml` a partir da tag. Um cartucho
 * com uma revisão inventada seria pior do que não ter cartucho — a linguagem
 * inteira existe para dizer «isto foi medido».
 *
 * Estilo em `design/tokens/moo-ui.css` (`.moo-cartucho`), gerado de
 * `moo-tokens.json`. Aqui não se redefine nada.
 */
export default function Cartucho({
  o_que,
  desenho,
  revisao,
  data,
}: {
  /** O que esta folha é. Curto, caixa-alta na apresentação. */
  o_que: string;
  /** O número da folha no conjunto — `DES. 001`. */
  desenho: string;
  /** A versão publicada. Vem de version.json, nunca à mão. */
  revisao: string;
  /** A data da revisão, ISO curta. */
  data: string;
}) {
  return (
    <div className="moo-cartucho">
      <span>
        MOOTER · {o_que} · DES. {desenho}
      </span>
      <span>
        ESC 1:1 · REV {revisao} · {data}
      </span>
    </div>
  );
}
