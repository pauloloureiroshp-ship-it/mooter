'use strict';

/**
 * A VÁLVULA DE QUOTA — quando o kimi entra, e sobretudo quando NÃO entra.
 *
 * ── O problema que isto resolve ─────────────────────────────────────────────
 * Sob pressão de quota o Mooter tinha duas saídas: mandar para a GPU o que ela
 * aguenta, e pôr tecto no Haiku para o resto (`quota.js`, política
 * `local-primeiro`). Não havia terceira via. Medido em 2026-08-16 na máquina do
 * dono: pressão `critico`, peso 13.705 contra referência 4.000, tecto `haiku`.
 *
 * O kimi-k3 é essa terceira via: nuvem capaz que NÃO consome quota Anthropic.
 * Estava implementado, pago e configurado — e a render 2 jobs contra 122 do moo,
 * porque nada no caminho de decisão o escolhia (`seamless.js`: o agente inferido
 * é `moo` ou `cc`, ponto).
 *
 * ── A economia, dita por inteiro ────────────────────────────────────────────
 * O kimi NÃO é mais barato em absoluto. Custa USD reais: 3/M input, 15/M output,
 * 0,30/M com cache hit. O `cc` e o `codex` custam quota JÁ PAGA. Ligar o kimi
 * como preferência geral trocaria subscrição por dinheiro — o oposto do produto.
 *
 * Ele só ganha quando a quota é o recurso escasso. Por isso isto é uma VÁLVULA,
 * não um tier: abre sob pressão e fecha quando ela passa.
 *
 * ── Porquê um ficheiro próprio ──────────────────────────────────────────────
 * A decisão é política e tem sete vetos. Enterrada num `if` dentro de uma função
 * de 600 linhas, ninguém a consegue testar nem auditar. Aqui é pura: recebe
 * factos, devolve `{usar, porque}`, e o `porque` viaja para o recibo — quem
 * receber um job em kimi tem de poder ver a frase que o justificou.
 *
 * A regra que a `onda-a3` estabeleceu vale aqui inteira: uma escolha EXPLÍCITA
 * do chamador nunca é trocada em silêncio. Se pediram `cc`, corre `cc`.
 */

/** Níveis de pressão em que a válvula pode abrir. Ver `quota.js`. */
const PRESSAO_QUE_ABRE = new Set(['alto', 'critico']);

/** Categorias que nunca são desviadas, ecoando os vetos de `aprender.js`. */
const CATEGORIAS_VETADAS = new Set(['git_deploy', 'auditoria']);

/**
 * Decide se este trabalho deve ir para o kimi em vez de consumir quota.
 *
 * Todos os vetos têm de passar. A ordem importa para o `porque`: devolve-se o
 * PRIMEIRO motivo que impede, porque é esse que o utilizador precisa de ler.
 *
 * @param {{
 *   ligada?: boolean,           // MOOTER_VALVULA_KIMI=1 (opt-in — ver o veto 0)
 *   motorExplicito?: boolean,   // o chamador escreveu `agent:`?
 *   temChave?: boolean,         // MOONSHOT_API_KEY configurada?
 *   pressaoNivel?: string,      // 'baixo'|'medio'|'alto'|'critico'|'desconhecido'
 *   tier?: string,              // 'T0'..'T3' do classificador
 *   escrita?: boolean,          // o job pode escrever ficheiros?
 *   categoria?: string,         // categoria inferida do goal
 *   allowedTools?: string,      // ferramentas pedidas — o kimi tem []
 *   pedeLeitura?: boolean,      // o goal cita ficheiros? (informativo)
 *   contextoInjectado?: boolean // o conector já os leu e injectou?
 * }} f
 * @returns {{usar: boolean, porque: string}}
 */
function valvulaKimi(f) {
  const o = f || {};

  // 0. OPT-IN, e a razão é séria.
  //
  // `quota.js:56` lê as sessões de `os.homedir()` e NÃO respeita `MOOTER_HOME`.
  // Ou seja: a pressão de quota não é isolável nos testes — qualquer suite vê a
  // quota real da máquina. Ligar a válvula por omissão fazia cinco testes de
  // outras frentes mudarem de resultado consoante o consumo do dono nesse dia,
  // que é exactamente a flakiness que a frente `contrato-sandbox` acabou de
  // extinguir ("falharia às terças e passaria às quartas").
  //
  // Alterar esses cinco testes para acomodar esta mudança seria o padrão errado:
  // adaptar a prova ao código em vez do contrário. Enquanto a quota não for
  // sandboxável, isto liga-se por decisão explícita — e essa decisão fica
  // registada aqui, não escondida num default.
  //
  // Para ligar:  MOOTER_VALVULA_KIMI=1
  if (o.ligada !== true) {
    return {
      usar: false,
      porque: 'a válvula de quota está desligada (MOOTER_VALVULA_KIMI=1 para ligar) — '
        + 'a leitura de quota ainda não é isolável nos testes',
    };
  }

  // 1. A escolha do chamador é soberana. Vem primeiro porque nenhum dos outros
  //    vetos importa se o utilizador já disse qual o motor.
  if (o.motorExplicito) {
    return { usar: false, porque: 'o motor foi escolhido por quem pediu — não se troca em silêncio' };
  }

  // 2. Sem chave não há kimi. Sugerir um motor que não arranca é o beco com
  //    placa de saída que a `onda-a3` custou a fechar.
  if (!o.temChave) {
    return { usar: false, porque: 'MOONSHOT_API_KEY não configurada' };
  }

  // 3. A válvula é para pressão. Fora dela, gastar USD onde há subscrição paga
  //    seria trocar dinheiro por nada.
  if (!PRESSAO_QUE_ABRE.has(String(o.pressaoNivel || ''))) {
    return {
      usar: false,
      porque: 'a quota não está sob pressão (' + (o.pressaoNivel || 'n/d')
        + ') — a subscrição já está paga e é a mais barata',
    };
  }

  // 4. T3 é alto risco: deploy, secrets, migrations, decisões de arquitectura.
  //    A poupança nunca justifica desviar isso. Mesmo veto que `aprender.js`.
  if (String(o.tier || '') === 'T3') {
    return { usar: false, porque: 'T3 é trabalho de alto risco: não se desvia por causa de quota' };
  }

  // 5. O kimi corre via API de chat e não escreve ficheiros.
  if (o.escrita === true) {
    return { usar: false, porque: 'o trabalho pode escrever ficheiros, e o kimi não tem essas ferramentas' };
  }

  // 6. Git/deploy e auditoria têm veto próprio: um erro é irreversível no
  //    primeiro caso, e no segundo exige revisão independente.
  if (CATEGORIAS_VETADAS.has(String(o.categoria || ''))) {
    return { usar: false, porque: 'a categoria ' + o.categoria + ' tem veto: não é desviada por quota' };
  }

  // 7. `allowedTools` que o kimi não pode honrar (G4, 2026-08-16).
  //    As permissões efectivas do kimi são `[]` (seamless.js:1102-1107): ele
  //    corre via API de chat e não recebe ferramentas. Um pedido que peça
  //    Read/Bash/Edit iria para um motor incapaz de as usar — e o utilizador
  //    pagava o token na mesma. A `escrita` sozinha não cobre isto: um
  //    `allowedTools:"Read,Bash"` é read-only e passava.
  if (o.allowedTools && String(o.allowedTools).trim()) {
    return {
      usar: false,
      porque: 'o pedido exige ferramentas (' + String(o.allowedTools).slice(0, 40)
        + ') e as permissões efectivas do kimi são []',
    };
  }

  // 8. SEM CONTEXTO INJECTADO NÃO ABRE — decisão do dono, 2026-08-16.
  //    O kimi está em `ENGINES_SEM_FICHEIROS`. A regra anterior só travava
  //    quando a tarefa CITAVA ficheiros; esta é mais apertada e mais simples de
  //    raciocinar: sem contexto na mão, o kimi só tem o goal, e mandá-lo fazer
  //    trabalho sobre um repositório que não vê é pagar por uma resposta que
  //    não pode ser boa.
  //    ⚠️ Isto é um veto de CAPACIDADE, não de privacidade. Quando o contexto
  //    existe, é precisamente o conteúdo dos ficheiros que viaja para a
  //    Moonshot — ver a dívida declarada no fim deste ficheiro.
  if (o.contextoInjectado !== true) {
    return {
      usar: false,
      porque: 'sem contexto injectado o kimi só tem o goal — não se paga por '
        + 'trabalho que ele não consegue fazer bem',
    };
  }

  return {
    usar: true,
    porque: 'a quota está em ' + o.pressaoNivel + ' e este trabalho cabe no kimi — '
      + 'nuvem que não gasta a subscrição',
  };
}

// ⚠️ DÍVIDA DECLARADA — EGRESS PARA OUTRO FORNECEDOR (G4, 2026-08-16)
//
// Quando a válvula abre, o contexto injectado — o CONTEÚDO dos ficheiros lidos —
// viaja para a Moonshot. Não existe veto de privacidade aqui, e o piso T3 não
// serve de substituto: medido, `analisa credenciais em config.json` classifica
// T2/`outro` e passaria todos os vetos acima.
//
// Não foi fechado porque a regra certa é uma decisão de produto, não de código:
// um regex sobre `.env|credencial|token|secret|key` bloqueia trabalho legítimo,
// e a alternativa — nunca desviar nada com contexto — esvazia a válvula, já que
// o veto 8 exige precisamente que haja contexto.
//
// Enquanto isto não for decidido, a válvula é opt-in e quem a liga está a
// aceitar que ficheiros do repositório sejam enviados para a Moonshot.
module.exports = { valvulaKimi, PRESSAO_QUE_ABRE, CATEGORIAS_VETADAS };
