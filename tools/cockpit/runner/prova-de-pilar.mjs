/**
 * prova-de-pilar.mjs — um pilar calado esta certo, ou esta partido?
 *
 * O PROBLEMA QUE ISTO RESOLVE.
 *
 * O relatorio de classes (`classes-da-fila.mjs`) apanhou tres pilares ACTIVOS a
 * responder `sem-achado` em 100% de 455 rondas cada — 1365 rondas de GPU com
 * output zero. Mas silencio e ambiguo: ou nao ha mesmo nada, ou o detector nao
 * detecta. Contar rondas nunca distingue os dois.
 *
 * A unica coisa que distingue e SEMEAR um defeito do tipo exacto que o pilar diz
 * procurar, e ver se ele o encontra. Com um CONTROLO limpo ao lado, porque um
 * pilar que acusa tudo tambem nao serve.
 *
 *     semeado    controlo    leitura
 *     acha       calado      o pilar FUNCIONA — o silencio em producao e correcto
 *     calado     calado      o pilar esta PARTIDO — diz sempre a mesma coisa
 *     acha       acha        dispara por reflexo — nao discrimina
 *     calado     acha        incoerente — investigar o fixture
 *
 * RESULTADO MEDIDO — os CINCO pilares testados (2026-08-21, qwen2.5-coder:14b):
 *
 *     pilar   semeado          controlo         directa GUIADA   directa NEUTRA
 *     P8      "NO FINDING" 4   "NO FINDING" 4    13 tok certo      4 tok errado
 *     P9      "NO FINDING" 4   "NO FINDING" 4   169 tok certo      n/d
 *     P10     "NO FINDING" 4   "NO FINDING" 4   113 tok certo      n/d
 *     P6      "NO FINDING" 4   "NO FINDING" 4    99 tok certo      4 tok errado
 *     P7      "NO FINDING" 4   "NO FINDING" 4   ERRADO            4 tok errado
 *
 * O P7 e o unico onde ate a GUIADA falha: identifica correctamente o `slice` da
 * linha 13, mas atribui-o ao campo errado (`ultimo_ts` L27 em vez de `total`
 * L24). E o unico dos cinco que produziu alguma coisa em producao — 3 achados em
 * 493 rondas — e os tres sao FALSOS **e** fora do que ele pergunta: falam de
 * condicoes booleanas invertidas quando o enunciado pergunta por nomes que
 * prometem mais do que entregam. Um deles cita `context-pack.mjs:1153` a dizer
 * que falta uma guarda — e a guarda esta escrita nessa mesma linha.
 *
 * Resposta byte a byte identica no semeado e no controlo, nos quatro: **zero
 * discriminacao**. Nao e do harness (o mesmo prompt a mao devolve o mesmo) nem
 * do modelo (perguntado com a GUIADA acerta nos quatro, a primeira, e cita as
 * linhas certas).
 *
 * A VARIAVEL, isolada com o P8 e confirmada com o P6: **e a NEUTRA que falha.**
 * A guiada AFIRMA que o defeito existe; a neutra oferece "pode nao haver nada" —
 * e nos dois pilares onde se testaram as duas, a neutra da 4 tokens e a saida.
 * Nao e o numero de passos: uma pergunta directa de UM passo falha na mesma
 * assim que a saida esta disponivel. Uma hipotese anterior — "procedimento de N
 * passos com saida no fim convida ao curto-circuito" — foi REFUTADA por isso.
 *
 * O que isto NAO resolve, e por isso nao ha correccao a propor: um pilar tem de
 * poder responder "nao ha nada aqui", senao volta o estado que produziu 82% de
 * ruido. A saida e obrigatoria e e ela que o modelo toma.
 *
 * ⚠️ O P6 parecia diferente e nao era. O ledger dele mostra 89 `citacao-ok` +
 * 37 `refutado` — parecia variar. Nao varia: 480 das 483 rondas dizem
 * literalmente NO FINDING e ha ZERO achados. O enunciado dele exige `PROOF:`
 * SEMPRE, mesmo sem achado, portanto 130 rondas emitem uma citacao que nao cita
 * nada — e e o verificador a classificar essa citacao inutil que produz o split
 * que fazia o pilar parecer vivo.
 *
 * Uso:
 *   node tools/cockpit/runner/prova-de-pilar.mjs --escrever <dir> [--pilar P9]
 */

import fs from 'node:fs';
import path from 'node:path';

import { SEM_ACHADO_RE } from './evidence-verifier.mjs';

/**
 * Os pares de prova, por pilar.
 *
 * `semeado` tem UM defeito do tipo que o pilar declara procurar; `controlo` tem
 * a mesma forma e nenhum. Nenhum dos dois pode dizer que e um fixture — um
 * comentario a apontar o defeito ensina a resposta e invalida a prova. (Foi
 * preciso reescrever o primeiro par por causa disso.)
 */
export const PARES = {
  P8: {
    procura: 'campo escrito num objecto e nunca lido no mesmo excerto',
    semeado: {
      caminho: 'tools/cockpit/runner/alocador.mjs',
      defeito: '`tempo_estimado_s` escrito na linha 32 e nunca mais referido',
      // TODAS as marcas tem de aparecer na resposta para contar como encontrado.
      marcas: ['tempo_estimado_s'],
      texto: `/**
 * alocador.mjs — decide quanto da GPU cabe a cada job.
 *
 * Parte do runner: monta o plano de VRAM de cada job antes de ele entrar na fila.
 * O plano viaja para o conductor, que o ordena e despacha.
 */

import os from 'node:os';

export const VRAM_TOTAL_GB = 24;
export const RESERVA_SISTEMA_GB = 2;

/** Quanto sobra depois da reserva do sistema. */
export function vramDisponivel(totalGb = VRAM_TOTAL_GB) {
  return Math.max(0, totalGb - RESERVA_SISTEMA_GB);
}

/** Monta o plano de alocacao para um job. */
export function planoDeAlocacao(job, { totalGb = VRAM_TOTAL_GB, agora = 0 } = {}) {
  const disponivel = vramDisponivel(totalGb);

  const plano = {
    modelo: job.modelo || 'qwen2.5-coder:14b',
    vram_gb: Math.min(job.vram_pedida_gb || 8, disponivel),
    prioridade: job.urgente ? 1 : 5,
    tempo_estimado_s: Math.round((job.tokens_esperados || 2000) / 40),
    criado_em: agora,
  };

  if (plano.vram_gb <= 0) {
    return { ok: false, motivo: 'sem VRAM disponivel', modelo: plano.modelo };
  }

  if (plano.prioridade === 1 && plano.vram_gb < 4) {
    plano.vram_gb = Math.min(4, disponivel);
  }

  return {
    ok: true,
    modelo: plano.modelo,
    vram_gb: plano.vram_gb,
    prioridade: plano.prioridade,
    criado_em: plano.criado_em,
    host: os.hostname(),
  };
}
`,
    },
    controlo: {
      caminho: 'tools/cockpit/runner/medidor.mjs',
      texto: `/**
 * medidor.mjs — resume as amostras de GPU de uma ronda.
 *
 * Le o que o sampler escreveu e devolve a media, o maximo e se a placa saturou.
 */

import os from 'node:os';

export const JANELA_S = 300;
export const MINIMO_AMOSTRAS = 3;

/** Quantas amostras cabem na janela. */
export function amostrasNaJanela(intervaloS, janelaS = JANELA_S) {
  return Math.max(0, Math.floor(janelaS / Math.max(1, intervaloS)));
}

/** Resume as amostras de uma ronda. */
export function resumirRonda(amostras, { janelaS = JANELA_S, agora = 0 } = {}) {
  const cabem = amostrasNaJanela(5, janelaS);

  const resumo = {
    total: amostras.length,
    soma_util: amostras.reduce((s, a) => s + (a.util_pct || 0), 0),
    maximo: amostras.reduce((m, a) => Math.max(m, a.util_pct || 0), 0),
    janela_s: janelaS,
    criado_em: agora,
  };

  if (resumo.total < MINIMO_AMOSTRAS) {
    return { ok: false, motivo: 'amostras a menos', janela_s: resumo.janela_s };
  }

  const media = resumo.soma_util / resumo.total;
  const saturado = resumo.maximo >= 95;

  return {
    ok: true,
    media_pct: Math.round(media),
    maximo_pct: resumo.maximo,
    total: resumo.total,
    janela_s: resumo.janela_s,
    criado_em: resumo.criado_em,
    cabem_na_janela: cabem,
    saturado,
    host: os.hostname(),
  };
}
`,
    },
  },

  P9: {
    procura: 'duas guardas/transformacoes que fazem o mesmo trabalho',
    semeado: {
      caminho: 'tools/cockpit/runner/rotulos.mjs',
      defeito: 'as guardas das linhas 12 e 24 sao o mesmo trabalho, so muda o nome da variavel',
      // O P9 manda "cite BOTH line numbers": as duas sao obrigatorias.
      linhas: [12, 24],
      texto: "/**\n * rotulos.mjs — nomes legiveis para o painel.\n *\n * Converte identificadores internos em texto que uma pessoa le, e garante que\n * nada vazio chega ao ecra.\n */\n\nconst MAX_ROTULO = 48;\n\n/** O nome do device, pronto para o painel. */\nexport function nomeDoDevice(nome) {\n  if (!nome || String(nome).trim() === '') return 'device-sem-nome';\n  return String(nome).trim().slice(0, MAX_ROTULO);\n}\n\n/** Quantos segundos passaram, arredondados para cima. */\nexport function idadeEmSegundos(desdeMs, agoraMs) {\n  const bruto = (agoraMs - desdeMs) / 1000;\n  return Math.max(0, Math.ceil(bruto));\n}\n\n/** O rotulo do pilar, pronto para o painel. */\nexport function rotuloDoPilar(rotulo) {\n  if (!rotulo || String(rotulo).trim() === '') return 'pilar-sem-nome';\n  return String(rotulo).trim().slice(0, MAX_ROTULO);\n}\n\n/** A percentagem, limitada entre 0 e 100. */\nexport function percentagem(valor) {\n  if (!Number.isFinite(valor)) return null;\n  return Math.min(100, Math.max(0, Math.round(valor)));\n}\n\n/** Junta os pedacos numa linha so, sem separadores a dobrar. */\nexport function linhaDoPainel(pedacos) {\n  return pedacos.filter(Boolean).join(' · ');\n}\n",
    },
    controlo: {
      caminho: 'tools/cockpit/runner/limites.mjs',
      texto: "/**\n * limites.mjs — os tectos e pisos que o painel aplica antes de mostrar.\n *\n * Cada funcao aqui faz uma verificacao diferente; nenhuma repete o trabalho de\n * outra.\n */\n\nconst MAX_LINHA = 96;\n\n/** O texto cabe na linha do painel? */\nexport function cabeNaLinha(texto) {\n  if (String(texto).length > MAX_LINHA) return `${String(texto).slice(0, MAX_LINHA - 1)}…`;\n  return String(texto);\n}\n\n/** Quantos segundos passaram, arredondados para cima. */\nexport function idadeEmSegundos(desdeMs, agoraMs) {\n  const bruto = (agoraMs - desdeMs) / 1000;\n  return Math.max(0, Math.ceil(bruto));\n}\n\n/** A percentagem, limitada entre 0 e 100. */\nexport function percentagem(valor) {\n  if (!Number.isFinite(valor)) return null;\n  return Math.min(100, Math.max(0, Math.round(valor)));\n}\n\n/** Os gigabytes, com uma casa decimal. */\nexport function gigabytes(bytes) {\n  if (bytes < 0) return null;\n  return Math.round((bytes / 1024 / 1024 / 1024) * 10) / 10;\n}\n\n/** O custo em dolares, sempre com duas casas. */\nexport function dolares(centimos) {\n  if (!Number.isInteger(centimos)) return null;\n  return (centimos / 100).toFixed(2);\n}\n\n/** Junta os pedacos numa linha so, sem separadores a dobrar. */\nexport function linhaDoPainel(pedacos) {\n  return pedacos.filter(Boolean).join(' · ');\n}\n",
    },
  },

  P10: {
    procura: 'instrucao a uma pessoa que nenhum comando do excerto executa',
    semeado: {
      caminho: 'docs/runbook-conector.md',
      defeito: 'a linha 41 manda confirmar o deploy na Vercel a mao, e nenhum comando o faz',
      // O P10 manda "Cite its line" — a linha e a barra que ele proprio poe.
      linhas: [41],
      texto: '# Runbook — publicar uma versão do conector\n\nSequência completa, do checkout limpo até à extensão instalada.\n\n## 1. Preparar\n\nActualiza as dependências antes de tudo:\n\n```sh\nnpm ci --no-audit --no-fund\n```\n\nCorre a suite inteira e confirma que fica verde:\n\n```sh\nnpm test\n```\n\n## 2. Versionar\n\nSobe o número de versão no manifest:\n\n```sh\nnpm version patch --no-git-tag-version\n```\n\nVerifica que o `manifest.json` e o `package.json` ficaram com o mesmo número:\n\n```sh\nnode tools/version-sync.mjs --check\n```\n\n## 3. Empacotar\n\nGera o `.mcpb`:\n\n```sh\nnpm run pack:mcpb\n```\n\nConfirma no painel da Vercel que o deploy do site de download ficou verde antes de anunciar a versão.\n\n## 4. Publicar\n\nPublica no registo:\n\n```sh\nnpm publish --access public\n```\n\nMarca a tag no git:\n\n```sh\ngit tag -s "v$(node -p "require(\'./package.json\').version")" -m "release"\n```\n',
    },
    controlo: {
      // ⚠️ O controlo TEM instrucoes — todas com o comando ao lado. Um runbook
      // sem instrucao nenhuma tambem daria NO FINDING, mas pela razao errada, e
      // o ensaio nao distinguiria nada.
      caminho: 'docs/runbook-bateria.md',
      texto: '# Runbook — correr a bateria local\n\nTudo o que este runbook pede a uma pessoa tem, logo a seguir, o comando que o faz.\n\n## 1. Preparar\n\nInstala as dependências:\n\n```sh\nnpm ci --no-audit --no-fund\n```\n\nConfirma que o Ollama está a responder:\n\n```sh\ncurl -sf http://127.0.0.1:11434/api/tags > /dev/null && echo vivo\n```\n\n## 2. Correr\n\nCorre a suite do runner:\n\n```sh\nnpm run test:cockpit-runner\n```\n\nVerifica que o classificador não mudou:\n\n```sh\nsha256sum tools/router/classify.js\n```\n\n## 3. Medir\n\nActualiza o relatório de classes da fila:\n\n```sh\nnode tools/cockpit/runner/classes-da-fila.mjs\n```\n\nConfirma que a reconciliação fechou a zero:\n\n```sh\nnode tools/cockpit/runner/classes-da-fila.mjs | grep "desvio 0"\n```\n\n## 4. Arrumar\n\nLimpa o estado temporario:\n\n```sh\nrm -rf "$TMPDIR/moo-tmp"\n```\n',
    },
  },

  P6: {
    procura: 'numero mostrado ao utilizador sem origem visivel na mesma linha',
    semeado: {
      caminho: 'landing/components/SavingsCard.tsx',
      defeito: 'a linha 36 mostra uma percentagem cravada, sem origem na mesma linha',
      // O P6 manda acabar com `PROOF: <ficheiro>:<linha>` — a linha e obrigatoria.
      linhas: [36],
      texto: 'import { Card } from \'./Card\';\nimport { formatUsd } from \'../lib/format\';\n\ntype Props = {\n  savedUsd: number;\n  runs: number;\n  medianMs: number;\n};\n\n/** O cartao de poupanca do painel. */\nexport function SavingsCard({ savedUsd, runs, medianMs }: Props) {\n  const perRun = runs > 0 ? savedUsd / runs : 0;\n\n  return (\n    <Card title="Poupanca">\n      <dl className="grid grid-cols-2 gap-3">\n        <div>\n          <dt>Poupado</dt>\n          <dd>{formatUsd(savedUsd)}</dd>\n        </div>\n        <div>\n          <dt>Rondas</dt>\n          <dd>{runs}</dd>\n        </div>\n        <div>\n          <dt>Por ronda</dt>\n          <dd>{formatUsd(perRun)}</dd>\n        </div>\n        <div>\n          <dt>Mediana</dt>\n          <dd>{medianMs} ms</dd>\n        </div>\n      </dl>\n\n      <p className="mt-4 text-sm text-muted">\n        Ate hoje, o roteador manteve 89% do trabalho fora da nuvem.\n      </p>\n    </Card>\n  );\n}\n',
    },
    controlo: {
      // Todos os numeros mostrados tem a origem NA MESMA LINHA — props, uma
      // funcao de formatacao, ou uma constante importada. Um componente sem
      // numero nenhum tambem daria NO FINDING, mas pela razao errada.
      caminho: 'landing/components/CostCard.tsx',
      texto: 'import { Card } from \'./Card\';\nimport { formatUsd, formatPct } from \'../lib/format\';\nimport { TARGET_LOCAL_PCT } from \'../lib/limits\';\n\ntype Props = {\n  spentUsd: number;\n  jobs: number;\n  p95Ms: number;\n  localPct: number;\n};\n\n/** O cartao de custo do painel. */\nexport function CostCard({ spentUsd, jobs, p95Ms, localPct }: Props) {\n  const perJob = jobs > 0 ? spentUsd / jobs : 0;\n\n  return (\n    <Card title="Custo">\n      <dl className="grid grid-cols-2 gap-3">\n        <div>\n          <dt>Gasto</dt>\n          <dd>{formatUsd(spentUsd)}</dd>\n        </div>\n        <div>\n          <dt>Jobs</dt>\n          <dd>{jobs}</dd>\n        </div>\n        <div>\n          <dt>Por job</dt>\n          <dd>{formatUsd(perJob)}</dd>\n        </div>\n        <div>\n          <dt>p95</dt>\n          <dd>{p95Ms} ms</dd>\n        </div>\n      </dl>\n\n      <p className="mt-4 text-sm text-muted">\n        Local: {formatPct(localPct)} — alvo {formatPct(TARGET_LOCAL_PCT)}.\n      </p>\n    </Card>\n  );\n}\n',
    },
  },

  P7: {
    procura: 'nome que diz total/all/every produzido a partir de uma fonte cortada',
    semeado: {
      caminho: 'tools/cockpit/runner/resumo-fila.mjs',
      defeito: 'a linha 24 chama-lhe total, mas a producao na linha 13 tem um slice',
      // O P7 manda 'cite BOTH lines': o nome E a producao. Uma so e meia resposta.
      linhas: [24, 13],
      texto: "/**\n * resumo-fila.mjs — o cartao da fila de triagem no painel.\n */\n\nimport fs from 'node:fs';\n\n/** Nunca mais do que isto por leitura — o painel nao aguenta mais. */\nexport const MAX_LINHAS = 500;\n\nfunction lerRecibos(caminho) {\n  const bruto = fs.readFileSync(caminho, 'utf8');\n  const todas = bruto.split('\\n').filter(Boolean);\n  return todas.slice(-MAX_LINHAS).map((l) => JSON.parse(l));\n}\n\n/** Monta o que o painel mostra sobre a fila. */\nexport function resumoDaFila(caminho) {\n  const recibos = lerRecibos(caminho);\n\n  const achados = recibos.filter((r) => r.conclusao === 'achado');\n  const porTriar = achados.filter((r) => !r.decidido);\n\n  return {\n    total: recibos.length,\n    achados: achados.length,\n    por_triar: porTriar.length,\n    ultimo_ts: recibos.length ? recibos[recibos.length - 1].ts : null,\n  };\n}\n\n/** A linha de texto que aparece por baixo do cartao. */\nexport function legenda(resumo) {\n  if (!resumo.total) return 'sem recibos neste device';\n  return `${resumo.por_triar} por triar de ${resumo.achados} achados`;\n}\n",
    },
    controlo: {
      // Mesma forma, mesmo slice, mesmo MAX_LINHAS — mas os nomes DIZEM o que
      // produzem: `total_no_ficheiro` vem da lista inteira, `lidos_nesta_janela`
      // vem da cortada. Um ficheiro sem slice nenhum tambem daria NO FINDING,
      // mas pela razao errada.
      caminho: 'tools/cockpit/runner/resumo-motor.mjs',
      texto: "/**\n * resumo-motor.mjs — o cartao do motor local no painel.\n */\n\nimport fs from 'node:fs';\n\n/** Nunca mais do que isto por leitura — o painel nao aguenta mais. */\nexport const MAX_LINHAS = 500;\n\nfunction lerEventos(caminho) {\n  const bruto = fs.readFileSync(caminho, 'utf8');\n  const todos = bruto.split('\\n').filter(Boolean);\n  return { todos, recentes: todos.slice(-MAX_LINHAS).map((l) => JSON.parse(l)) };\n}\n\n/** Monta o que o painel mostra sobre o motor. */\nexport function resumoDoMotor(caminho) {\n  const { todos, recentes } = lerEventos(caminho);\n\n  const falhas = recentes.filter((e) => e.estado === 'falhou');\n  const lentos = recentes.filter((e) => e.dur_s > 30);\n\n  return {\n    total_no_ficheiro: todos.length,\n    lidos_nesta_janela: recentes.length,\n    falhas_na_janela: falhas.length,\n    lentos_na_janela: lentos.length,\n    ultimo_ts: recentes.length ? recentes[recentes.length - 1].ts : null,\n  };\n}\n\n/** A linha de texto que aparece por baixo do cartao. */\nexport function legenda(resumo) {\n  if (!resumo.lidos_nesta_janela) return 'sem eventos neste device';\n  return `${resumo.falhas_na_janela} falhas em ${resumo.lidos_nesta_janela} lidos`;\n}\n",
    },
  },

  P1: {
    procura: 'a mesma chamada, com os mesmos argumentos, em duas linhas',
    semeado: {
      caminho: 'tools/router/cache-precos.js',
      defeito: 'lerJson(TABELA) nas linhas 21 e 28 — chamada identica, argumentos identicos',
      linhas: [21, 28],
      texto: "'use strict';\n/**\n * cache-precos.js — resolve o preco de um modelo a partir da tabela do repo.\n */\n\nconst fs = require('fs');\nconst path = require('path');\n\nconst TABELA = path.join(__dirname, 'pricing.json');\n\nfunction lerJson(caminho) {\n  try {\n    return JSON.parse(fs.readFileSync(caminho, 'utf8'));\n  } catch {\n    return null;\n  }\n}\n\n/** O preco de entrada, por milhao de tokens. */\nfunction precoEntrada(modelo) {\n  const tabela = lerJson(TABELA);\n  if (!tabela || !tabela[modelo]) return null;\n  return tabela[modelo].in;\n}\n\n/** O preco de saida, por milhao de tokens. */\nfunction precoSaida(modelo) {\n  const tabela = lerJson(TABELA);\n  if (!tabela || !tabela[modelo]) return null;\n  return tabela[modelo].out;\n}\n\n/** O custo de um job, em dolares. */\nfunction custoDoJob(modelo, tokensIn, tokensOut) {\n  const entrada = precoEntrada(modelo);\n  const saida = precoSaida(modelo);\n  if (entrada === null || saida === null) return null;\n  return ((tokensIn * entrada) + (tokensOut * saida)) / 1e6;\n}\n\nmodule.exports = { lerJson, precoEntrada, precoSaida, custoDoJob };\n",
    },
    controlo: {
      // A MESMA funcao chamada duas vezes, com argumentos DIFERENTES
      // (`lerJson(TECTOS)` e `lerJson(QUOTAS)`). Se o controlo nao tivesse
      // repeticao nenhuma, bastava contar nomes de funcao para acertar — e o
      // pilar tem de comparar ARGUMENTOS.
      caminho: 'tools/router/cache-limites.js',
      texto: "'use strict';\n/**\n * cache-limites.js — resolve os tectos de uso a partir dos ficheiros do repo.\n */\n\nconst fs = require('fs');\nconst path = require('path');\n\nconst TECTOS = path.join(__dirname, 'limits.json');\nconst QUOTAS = path.join(__dirname, 'quotas.json');\n\nfunction lerJson(caminho) {\n  try {\n    return JSON.parse(fs.readFileSync(caminho, 'utf8'));\n  } catch {\n    return null;\n  }\n}\n\n/** O tecto de tokens por job. */\nfunction tectoDeTokens(perfil) {\n  const tectos = lerJson(TECTOS);\n  if (!tectos || !tectos[perfil]) return null;\n  return tectos[perfil].tokens;\n}\n\n/** A quota diaria, em dolares. */\nfunction quotaDiaria(perfil) {\n  const quotas = lerJson(QUOTAS);\n  if (!quotas || !quotas[perfil]) return null;\n  return quotas[perfil].usd_dia;\n}\n\n/** Quantos jobs ainda cabem hoje. */\nfunction jobsRestantes(perfil, gastoUsd, custoMedioUsd) {\n  const quota = quotaDiaria(perfil);\n  if (quota === null || custoMedioUsd <= 0) return null;\n  return Math.max(0, Math.floor((quota - gastoUsd) / custoMedioUsd));\n}\n\nmodule.exports = { lerJson, tectoDeTokens, quotaDiaria, jobsRestantes };\n",
    },
  },

  P2: {
    procura: 'valor-semente (0, vazio) que chega a saida sem ser substituido',
    semeado: {
      caminho: 'tools/router/contagem-tokens.js',
      defeito: '`custo = 0` na linha 28 sai como `custo_usd` na linha 34',
      // So a linha do INIT e exigida. A linha de saida e legitimamente ambigua
      // — o `return {` (31) ou o campo (34) — e exigir uma delas seria reprovar
      // uma resposta certa. O `SEED VISIBLE` cobre o veredicto.
      linhas: [28],
      marcas: ['SEED VISIBLE'],
      texto: "'use strict';\n/**\n * contagem-tokens.js — soma o que cada ronda gastou.\n */\n\n/** Soma os tokens de saida de um conjunto de recibos. */\nfunction somarSaida(recibos) {\n  let saida = 0;\n  for (const r of recibos || []) {\n    if (typeof r.tokens_out === 'number') saida += r.tokens_out;\n  }\n  return saida;\n}\n\n/** Quantas rondas nao chegaram a chamar o motor. */\nfunction contarVazias(recibos) {\n  let vazias = 0;\n  for (const r of recibos || []) {\n    if (!r.motor_ok) vazias += 1;\n  }\n  return vazias;\n}\n\n/** O resumo que o painel mostra. */\nfunction resumo(recibos) {\n  const saida = somarSaida(recibos);\n  const vazias = contarVazias(recibos);\n  let custo = 0;\n  if (saida > 0) custo = (saida / 1e6) * 0.6;\n\n  return {\n    tokens_saida: saida,\n    rondas_vazias: vazias,\n    custo_usd: custo,\n    rondas: (recibos || []).length,\n  };\n}\n\nmodule.exports = { somarSaida, contarVazias, resumo };\n",
    },
    controlo: {
      // Tem acumuladores a zero na mesma — mas nenhum SAI: servem para decidir,
      // e o que sai e a decisao. Um ficheiro sem `= 0` tambem daria a resposta
      // certa, mas pela razao errada.
      caminho: 'tools/router/guarda-ritmo.js',
      texto: "'use strict';\n/**\n * guarda-ritmo.js — decide se a ronda seguinte pode arrancar.\n *\n * Os acumuladores daqui servem para DECIDIR; nenhum deles sai no resultado, que\n * e sempre uma decisao e a razao dela.\n */\n\nconst MAX_SEGUIDAS = 3;\nconst MAX_VAZIAS = 8;\n\n/** Ja houve falhas seguidas que cheguem para travar? */\nfunction travaPorFalhas(recibos) {\n  let seguidas = 0;\n  for (const r of (recibos || []).slice().reverse()) {\n    if (r.verdict === 'falhou') seguidas += 1;\n    else break;\n  }\n  if (seguidas >= MAX_SEGUIDAS) {\n    return { travar: true, porque: 'falhas seguidas a mais' };\n  }\n  return { travar: false, porque: null };\n}\n\n/** Ja houve rondas vazias que cheguem para travar? */\nfunction travaPorVazias(recibos) {\n  let vazias = 0;\n  for (const r of recibos || []) {\n    if (!r.motor_ok) vazias += 1;\n  }\n  if (vazias >= MAX_VAZIAS) {\n    return { travar: true, porque: 'o motor nao responde ha demasiadas rondas' };\n  }\n  return { travar: false, porque: null };\n}\n\n/** A decisao final: arrancar ou nao, e porque. */\nfunction podeArrancar(recibos) {\n  for (const guarda of [travaPorFalhas, travaPorVazias]) {\n    const r = guarda(recibos);\n    if (r.travar) return { arrancar: false, porque: r.porque };\n  }\n  return { arrancar: true, porque: null };\n}\n\nmodule.exports = { travaPorFalhas, travaPorVazias, podeArrancar };\n",
    },
  },

  P3: {
    procura: 'comentario que afirma um numero diferente do que o codigo usa',
    semeado: {
      caminho: 'tools/cockpit/runner/batimento.mjs',
      defeito: 'o comentario da linha 7 diz 30 segundos; a linha 8 usa 90',
      linhas: [7, 8],
      marcas: ['DIVERGE'],
      texto: "/**\n * batimento.mjs — o pulso que cada device escreve enquanto trabalha.\n */\n\nimport fs from 'node:fs';\n\n/** Damos 30 segundos de folga antes de chamar orfao a um lock. */\nexport const ORFAO_APOS_S = 90;\n\n/** Escreve o pulso, sem nunca rebentar o loop por causa dele. */\nexport function escreverPulso(caminho, estado) {\n  try {\n    fs.writeFileSync(caminho, JSON.stringify({ ...estado, ts: Date.now() }));\n    return true;\n  } catch {\n    return false;\n  }\n}\n\n/** O batimento esta velho? */\nexport function estaOrfao(pulsoMs, agoraMs) {\n  const idadeS = (agoraMs - pulsoMs) / 1000;\n  return idadeS > ORFAO_APOS_S;\n}\n\n/** Liberta o lock se o dono ja nao der sinal. */\nexport function reaproveitar(caminho, agoraMs) {\n  let pulso;\n  try {\n    pulso = JSON.parse(fs.readFileSync(caminho, 'utf8'));\n  } catch {\n    return { libertado: false, porque: 'sem pulso legivel' };\n  }\n  if (!estaOrfao(pulso.ts, agoraMs)) {\n    return { libertado: false, porque: 'o dono ainda da sinal' };\n  }\n  try {\n    fs.rmSync(caminho);\n    return { libertado: true, porque: null };\n  } catch (err) {\n    return { libertado: false, porque: String(err && err.message) };\n  }\n}\n",
    },
    controlo: {
      // Mesma forma, mesmo tipo de comentario com numero — mas o numero BATE
      // (45 e 45). Um ficheiro sem comentarios numericos tambem daria THEY
      // MATCH, e nao provava que o pilar sabe comparar.
      caminho: 'tools/cockpit/runner/reserva.mjs',
      texto: "/**\n * reserva.mjs — quando o device cede a maquina ao dono.\n */\n\nimport fs from 'node:fs';\n\n/** Damos 45 segundos de folga antes de retomar depois de uma reserva. */\nexport const RETOMA_APOS_S = 45;\n\n/** Escreve o pedido de reserva, sem nunca rebentar o loop por causa dele. */\nexport function pedirReserva(caminho, quem) {\n  try {\n    fs.writeFileSync(caminho, JSON.stringify({ quem, ts: Date.now() }));\n    return true;\n  } catch {\n    return false;\n  }\n}\n\n/** Ja passou tempo que chegue para retomar? */\nexport function podeRetomar(reservaMs, agoraMs) {\n  const idadeS = (agoraMs - reservaMs) / 1000;\n  return idadeS > RETOMA_APOS_S;\n}\n\n/** Levanta a reserva se o tempo passou. */\nexport function levantar(caminho, agoraMs) {\n  let reserva;\n  try {\n    reserva = JSON.parse(fs.readFileSync(caminho, 'utf8'));\n  } catch {\n    return { levantada: false, porque: 'sem reserva legivel' };\n  }\n  if (!podeRetomar(reserva.ts, agoraMs)) {\n    return { levantada: false, porque: 'a reserva ainda esta de pe' };\n  }\n  try {\n    fs.rmSync(caminho);\n    return { levantada: true, porque: null };\n  } catch (err) {\n    return { levantada: false, porque: String(err && err.message) };\n  }\n}\n",
    },
  },

  P5: {
    procura: 'dois returns com os mesmos campos, so a mudar textos e nomes',
    semeado: {
      caminho: 'tools/cockpit/runner/portas.mjs',
      defeito: 'sete returns com a forma {ok, motivo, valor}; o primeiro na linha 11',
      linhas: [11, 14],
      texto: "/**\n * portas.mjs — as verificacoes que o runner faz antes de aceitar um job.\n */\n\nexport const MAX_TOKENS = 8000;\nexport const MAX_FICHEIROS = 12;\n\n/** O job cabe no tecto de tokens? */\nexport function cabeEmTokens(job) {\n  if (!job || typeof job.tokens !== 'number') {\n    return { ok: false, motivo: 'job sem contagem de tokens', valor: null };\n  }\n  if (job.tokens > MAX_TOKENS) {\n    return { ok: false, motivo: `${job.tokens} tokens acima do tecto`, valor: job.tokens };\n  }\n  return { ok: true, motivo: null, valor: job.tokens };\n}\n\n/** O job toca em poucos ficheiros que cheguem? */\nexport function cabeEmFicheiros(job) {\n  if (!job || !Array.isArray(job.ficheiros)) {\n    return { ok: false, motivo: 'job sem lista de ficheiros', valor: null };\n  }\n  if (job.ficheiros.length > MAX_FICHEIROS) {\n    return { ok: false, motivo: `${job.ficheiros.length} ficheiros a mais`, valor: job.ficheiros.length };\n  }\n  return { ok: true, motivo: null, valor: job.ficheiros.length };\n}\n\n/** Corre as portas todas e devolve a primeira que fecha. */\nexport function passaNasPortas(job) {\n  for (const porta of [cabeEmTokens, cabeEmFicheiros]) {\n    const r = porta(job);\n    if (!r.ok) return r;\n  }\n  return { ok: true, motivo: null, valor: null };\n}\n",
    },
    controlo: {
      // Sete returns tambem — mas de formas genuinamente diferentes: objectos
      // de campos distintos, strings, numeros e null.
      caminho: 'tools/cockpit/runner/relatos.mjs',
      texto: '/**\n * relatos.mjs — o que o runner devolve a quem lhe pergunta pelo estado.\n */\n\nexport const JANELA_S = 300;\n\n/** Quanto tempo falta ate a proxima ronda. */\nexport function proximaRonda(ultimaMs, agoraMs) {\n  const passou = Math.max(0, Math.round((agoraMs - ultimaMs) / 1000));\n  return { faltam_s: Math.max(0, JANELA_S - passou), passou_s: passou };\n}\n\n/** O estado da GPU, para o cartao do painel. */\nexport function estadoDaGpu(amostra) {\n  if (!amostra) return null;\n  return {\n    util_pct: amostra.util_pct,\n    fonte: amostra.fonte,\n    vram_gb: amostra.vram_inuse_gb,\n    saturada: amostra.util_pct >= 95,\n  };\n}\n\n/** Quem esta a segurar o lock, se alguem. */\nexport function donoDoLock(lock) {\n  if (!lock) return null;\n  return `${lock.pid}@${lock.host}`;\n}\n\n/** A linha de resumo que vai para o log. */\nexport function linhaDeLog(pilar, veredicto, duracaoS) {\n  return `${pilar} ${veredicto} · ${duracaoS}s`;\n}\n\n/** Quantas rondas cabem na janela, dado o ritmo observado. */\nexport function rondasNaJanela(duracaoMediaS) {\n  if (!(duracaoMediaS > 0)) return 0;\n  return Math.floor(JANELA_S / duracaoMediaS);\n}\n',
    },
  },

  P11: {
    procura: 'numero numa mensagem ao dono diferente do que o codigo usa',
    semeado: {
      caminho: 'packages/mooter-bridge/aviso-fila.js',
      defeito: 'a mensagem da linha 23 diz 100; a constante da linha 6 vale 200',
      // O ficheiro tem TAMBEM um par que BATE (linha 26 '48 horas' contra a
      // linha 7 `ESPERA_LONGA_H = 48`). Sem esse engodo, o pilar acertava
      // marcando qualquer mensagem com numero.
      linhas: [23, 6],
      marcas: ['DIVERGE'],
      texto: "'use strict';\n/**\n * aviso-fila.js — o que o painel diz ao dono sobre a fila de triagem.\n */\n\nconst FILA_GRANDE = 200;\nconst ESPERA_LONGA_H = 48;\n\n/** A fila ja pede atencao? */\nfunction filaPedeAtencao(porTriar) {\n  return porTriar >= FILA_GRANDE;\n}\n\n/** O achado ja esta a espera ha tempo de mais? */\nfunction esperaDemais(desdeMs, agoraMs) {\n  const horas = (agoraMs - desdeMs) / 3600000;\n  return horas >= ESPERA_LONGA_H;\n}\n\n/** A frase que aparece por baixo do cartao da fila. */\nfunction avisoDaFila(porTriar, maisAntigoMs, agoraMs) {\n  if (filaPedeAtencao(porTriar)) {\n    return `${porTriar} achados por triar — acima de 100, o painel deixa de ser util`;\n  }\n  if (esperaDemais(maisAntigoMs, agoraMs)) {\n    return 'ha achados a espera ha mais de 48 horas';\n  }\n  return null;\n}\n\n/** O que o cartao mostra, com a razao sempre ao lado. */\nfunction cartaoDaFila(porTriar, maisAntigoMs, agoraMs) {\n  const aviso = avisoDaFila(porTriar, maisAntigoMs, agoraMs);\n  return {\n    por_triar: porTriar,\n    aviso,\n    porque: aviso ? 'limiar do painel atingido' : null,\n  };\n}\n\nmodule.exports = { filaPedeAtencao, esperaDemais, avisoDaFila, cartaoDaFila };\n",
    },
    controlo: {
      // Mesma forma, dois pares mensagem-constante, e os DOIS batem (8 e 8,
      // 35 e 35). Um ficheiro sem mensagens numericas tambem daria THEY MATCH,
      // mas nao provava que o pilar sabe comparar.
      caminho: 'packages/mooter-bridge/aviso-motor.js',
      texto: "'use strict';\n/**\n * aviso-motor.js — o que o painel diz ao dono sobre o motor local.\n */\n\nconst VAZIAS_SEGUIDAS = 8;\nconst LENTA_S = 35;\n\n/** O motor ja passou rondas vazias que cheguem? */\nfunction motorParadoDemais(vaziasSeguidas) {\n  return vaziasSeguidas >= VAZIAS_SEGUIDAS;\n}\n\n/** A ronda demorou mais do que devia? */\nfunction rondaLenta(duracaoS) {\n  return duracaoS >= LENTA_S;\n}\n\n/** A frase que aparece por baixo do cartao do motor. */\nfunction avisoDoMotor(vaziasSeguidas, duracaoS) {\n  if (motorParadoDemais(vaziasSeguidas)) {\n    return `${vaziasSeguidas} rondas seguidas sem achado — acima de 8, o motor pode estar mudo`;\n  }\n  if (rondaLenta(duracaoS)) {\n    return 'a ultima ronda passou dos 35 segundos';\n  }\n  return null;\n}\n\n/** O que o cartao mostra, com a razao sempre ao lado. */\nfunction cartaoDoMotor(vaziasSeguidas, duracaoS) {\n  const aviso = avisoDoMotor(vaziasSeguidas, duracaoS);\n  return {\n    vazias_seguidas: vaziasSeguidas,\n    aviso,\n    porque: aviso ? 'limiar do painel atingido' : null,\n  };\n}\n\nmodule.exports = { motorParadoDemais, rondaLenta, avisoDoMotor, cartaoDoMotor };\n",
    },
  },
};

/** Escreve o par de prova de um pilar num repo de ensaio. Devolve os caminhos. */
export function escreverPar(pilar, destino, { writeImpl = fs.writeFileSync, mkdirImpl = fs.mkdirSync } = {}) {
  const par = PARES[pilar];
  if (!par) throw new Error(`sem par de prova para ${pilar} (ha: ${Object.keys(PARES).join(', ')})`);
  const out = {};
  for (const papel of ['semeado', 'controlo']) {
    const f = par[papel];
    const abs = path.join(destino, f.caminho);
    mkdirImpl(path.dirname(abs), { recursive: true });
    writeImpl(abs, f.texto);
    out[papel] = abs;
  }
  return out;
}

/**
 * O veredicto, a partir do que as duas rondas devolveram.
 *
 * `achouNoSemeado` tem de ser verificado contra o NOME do campo semeado, nao
 * contra "houve achado": um pilar que acha outra coisa qualquer no ficheiro
 * semeado nao encontrou o defeito, encontrou ruido.
 */
export function veredicto({ pilar, respostaSemeado, respostaControlo }) {
  const par = PARES[pilar];
  if (!par) throw new Error(`sem par de prova para ${pilar}`);
  const s = par.semeado;
  const texto = String(respostaSemeado || '');

  // Duas formas de marcar o que conta como "encontrou":
  //   `marcas` — cadeias que a resposta tem de conter (ex.: o nome do campo)
  //   `linhas` — numeros de linha que a resposta tem de citar
  // TODAS tem de bater. O P9 manda citar as DUAS linhas; aceitar uma so seria
  // aceitar meia resposta.
  const marcas = s.marcas || [];
  const linhas = s.linhas || [];

  // ⚠️ UMA RESPOSTA QUE DIZ "NAO HA NADA" NUNCA E UM ACHADO, apanhe ela as
  // marcas que apanhar. Isto tem de ser avaliado ANTES de `achou`, e nao depois.
  //
  // Medido a 2026-08-25, contra o Ollama real, ao correr os dez pares: o P6 foi
  // graduado `funciona` tendo respondido, literalmente,
  //
  //     NO FINDING
  //
  //     PROOF: landing/components/SavingsCard.tsx:36
  //
  // O enunciado do P6 exige `PROOF:` SEMPRE, mesmo sem achado — patologia ja
  // descrita no cabecalho deste ficheiro, onde se conta que 130 rondas dele
  // emitiam uma citacao que nao cita nada. A marca do par e `linhas: [36]`, o
  // numero aparece na citacao obrigatoria, e o ramo `achou && !acusouControlo`
  // devolvia `funciona` sem nunca perguntar se o semeado estava calado.
  //
  // A variavel ja existia; estava so a ser consultada tarde de mais.
  //
  // Isto NAO e academico: este e o instrumento que decide se um pilar entra na
  // rotacao. Foi assim que o P11 entrou — passou o ensaio a 22/08 e em UM dia
  // deu 87 achados, 76 dos quais falhavam o proprio enunciado. Um ensaio que
  // aceita `NO FINDING` como aprovacao nao esta a medir sensibilidade: esta a
  // medir se o numero da linha calha aparecer no texto.
  const caladoNoSemeado = SEM_ACHADO_RE.test(String(respostaSemeado || ''));

  const achou = (marcas.length + linhas.length) > 0
    && !caladoNoSemeado
    && marcas.every((m) => new RegExp(m).test(texto))
    && linhas.every((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(texto));

  // ⚠️ Cada pilar tem a SUA saida honesta — `THEY MATCH` (P3), `NO SEED EXITS`
  // (P2), `EVERY CALL ONCE` (P1), `SHAPE IS UNIQUE` (P5)... A primeira versao
  // disto so conhecia `NO FINDING`, e por isso deu `dispara-por-reflexo` ao P3 e
  // ao P2 — que tinham respondido CERTO no controlo. **Um metodo que nao conhece
  // o vocabulario dos pilares reprova exactamente os que funcionam.**
  //
  // O `SEM_ACHADO_RE` do `evidence-verifier` ja enumera todas as saidas:
  // reutiliza-se, nao se reescreve. Foi o proprio ensaio a apanhar isto, ao
  // reprovar os dois unicos pilares sãos de nove.
  const acusouControlo = !SEM_ACHADO_RE.test(String(respostaControlo || ''));

  // `caladoNoSemeado` (acima) tambem distingue, nos ramos de baixo, ficar CALADO
  // de achar OUTRA coisa. Sao dois estados diferentes, e a primeira versao disto
  // colapsava-os num `incoerente` que mandava rever um fixture que estava bom.
  const alvo = s.defeito || 'o defeito';

  if (achou && !acusouControlo) {
    return { estado: 'funciona', porque: `encontrou ${alvo} no semeado e ficou calado no controlo` };
  }
  if (achou && acusouControlo) {
    return { estado: 'dispara-por-reflexo', porque: 'encontrou o defeito, mas acusou tambem o controlo limpo' };
  }
  if (!achou && caladoNoSemeado && !acusouControlo) {
    return {
      estado: 'partido',
      porque: `nao encontrou ${alvo} no ficheiro semeado, e deu a MESMA resposta no controlo — nao discrimina`,
    };
  }
  if (!achou && !caladoNoSemeado && acusouControlo) {
    // O pior estado dos seis, e o menos obvio: PRODUZ nos dois ficheiros, e em
    // nenhum acerta. Passa por vivo em qualquer contagem de rondas, enche a fila,
    // e o defeito que devia apanhar continua la.
    return {
      estado: 'falso-em-ambos',
      porque: `produziu achado no semeado E no controlo, e no semeado NAO e ${alvo}`,
    };
  }
  if (!achou && !caladoNoSemeado && !acusouControlo) {
    return {
      estado: 'erra-o-alvo',
      porque: `calou-se no controlo (bem) mas o que achou no semeado nao e ${alvo}`,
    };
  }
  return { estado: 'incoerente', porque: 'calado no semeado e a acusar o controlo — rever o fixture' };
}

function principal() {
  const i = process.argv.indexOf('--escrever');
  if (i === -1) {
    console.log('uso: node tools/cockpit/runner/prova-de-pilar.mjs --escrever <dir> [--pilar P8]');
    return;
  }
  const destino = process.argv[i + 1];
  const pi = process.argv.indexOf('--pilar');
  const pilar = pi === -1 ? 'P8' : process.argv[pi + 1];
  const out = escreverPar(pilar, destino);
  console.log(`par de prova do ${pilar} escrito:`);
  console.log(`  semeado  : ${out.semeado}   (defeito: ${PARES[pilar].semeado.defeito})`);
  console.log(`  controlo : ${out.controlo}`);
  console.log(`\ncorre o pilar contra ${destino} com MOOTER_REPO e foco em ${pilar}.`);
}

if (process.argv[1] && process.argv[1].endsWith('prova-de-pilar.mjs')) principal();
