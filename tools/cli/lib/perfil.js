/**
 * perfil.js — o `subscription-profile.json`, derivado em vez de perguntado.
 *
 * O QUE NAO MUDA: a FORMA do ficheiro. Dez ficheiros o leem
 * (`budget-cap.js`, `budget-wizard.js`, `usage-estimator.js`, `inject_context.js`,
 * `gsd-statusline.js`, `hub-push.js`, `savings-tracker.js`, `auto-sync.js`,
 * `onboarding.js`, `mooter-doctor.js`). Mudar as chaves para as tornar "mais
 * honestas" partiria os dez de uma vez, e nenhum deles pediu isso. O que muda e
 * de ONDE vem cada valor.
 *
 * O QUE MUDA: o `init` fazia **onze perguntas** de faturacao — «tens Claude
 * Max?», «tens um plano Pro do Claude Code?», «usas o Cursor?». Onze prompts sao
 * onze oportunidades de desistir antes do 1.º recibo, e um perfil errado roteia
 * mal para sempre, em silencio. Agora:
 *
 *   · o que a maquina sabe, a maquina responde   (variaveis de ambiente, CLIs)
 *   · o que a maquina NAO pode saber fica `n/d`  (planos de subscricao)
 *   · e so se pergunta o que muda a rota E nao se consegue medir
 *
 * PORQUE O CLAUDE MAX CONTINUA A SER UMA PERGUNTA. Nao ha sinal nenhum dele no
 * ambiente, e a R6 proibe ir espreitar sessoes. Mas ele muda o comportamento a
 * serio — com Max, o T3 deixa de ter custo marginal e o tecto de orcamento nao
 * se aplica da mesma maneira (ver `budget-cap.js`). Uma pergunta que muda a
 * rota vale a pena; dez que so preenchem um relatorio nao valem.
 *
 * A PRESENCA DE UMA CLI NAO E UMA SUBSCRICAO. `claude` instalado nao prova
 * plano nenhum, e este modulo nao finge o contrario: a presenca vai para
 * `detection`, que e um registo do que se mediu, e nunca para `profiles`, que e
 * o que o router usa para decidir.
 */

'use strict';

/**
 * Constroi o perfil. `respostas` traz so o que nao se consegue medir.
 * Puro: recebe o retrato do probe e o ambiente, devolve o objecto.
 */
function construir(retrato, respostas = {}, o = {}) {
  const { env = process.env, agora = () => new Date().toISOString() } = o;

  const anthropicEnv = !!env.ANTHROPIC_API_KEY;
  const openaiEnv = !!env.OPENAI_API_KEY;
  const geminiEnv = !!(env.GEMINI_API_KEY || env.GOOGLE_API_KEY);

  const cli = (nome) => (retrato && retrato.clis ? retrato.clis.find((c) => c.nome === nome) : null) || { presente: false };

  const temMax = respostas.claude_max === true;

  return {
    updated_at: agora(),
    profiles: {
      // Medido onde da; perguntado so onde muda a rota.
      anthropic: temMax ? 'max' : anthropicEnv ? 'api-paid' : 'none',
      // A CLI instalada e' condicao NECESSARIA e nao suficiente. Sem forma de
      // medir o plano (R6), `n/d` — e `n/d` e um valor que os consumidores ja
      // sabem tratar, ao contrario de um 'pro' inventado.
      claude_code: cli('claude').presente ? 'n/d' : 'none',
      openai: openaiEnv ? 'api-paid' : 'none',
      openai_plus: false,
      gemini: geminiEnv ? 'api-paid' : 'none',
      // Nao ha probe destes e nao se pergunta mais: nenhum muda a rota hoje.
      cursor: 'n/d',
      github: 'n/d',
    },
    budget_strategy: 'auto',
    detection: {
      anthropic_env: anthropicEnv,
      openai_env: openaiEnv,
      gemini_env: geminiEnv,
      // O que o probe VIU. Presenca e versao, nunca sessoes (R6).
      clis: (retrato && retrato.clis ? retrato.clis : []).map((c) => ({
        nome: c.nome,
        presente: c.presente,
        versao: c.versao || null,
        login: c.login,
      })),
      ollama: retrato && retrato.ollama ? { presente: retrato.ollama.presente, modelos: retrato.ollama.modelos.length } : null,
      gpu: retrato && retrato.gpu ? (retrato.gpu.name_short || retrato.gpu.name || 'n/d') : 'n/d',
      ram_mb: retrato ? retrato.ram_mb : null,
    },
    notes: 'Medido por `mooter init` (probe). Campos `n/d` sao os que a maquina nao pode saber sem espreitar sessoes — ver R6.',
  };
}

/**
 * Quantas perguntas e' que este perfil ainda obriga a fazer.
 * Existe para o teste poder guardar o numero: era 11, e um numero que ninguem
 * vigia volta a crescer.
 */
const PERGUNTAS = Object.freeze(['claude_max']);

module.exports = { construir, PERGUNTAS };
