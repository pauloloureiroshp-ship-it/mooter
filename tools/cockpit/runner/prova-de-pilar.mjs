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
 * RESULTADO MEDIDO — os QUATRO pilares mudos (2026-08-21, qwen2.5-coder:14b):
 *
 *     pilar   semeado          controlo         directa GUIADA   directa NEUTRA
 *     P8      "NO FINDING" 4   "NO FINDING" 4    13 tok certo      4 tok errado
 *     P9      "NO FINDING" 4   "NO FINDING" 4   169 tok certo      n/d
 *     P10     "NO FINDING" 4   "NO FINDING" 4   113 tok certo      n/d
 *     P6      "NO FINDING" 4   "NO FINDING" 4    99 tok certo      4 tok errado
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
  const achou = (marcas.length + linhas.length) > 0
    && marcas.every((m) => new RegExp(m).test(texto))
    && linhas.every((n) => new RegExp(`(^|[^0-9])${n}([^0-9]|$)`).test(texto));

  const acusouControlo = !/\b(NO FINDING|SEM ACHADO)\b/i.test(String(respostaControlo || ''));

  if (achou && !acusouControlo) {
    return { estado: "funciona", porque: `encontrou ${s.defeito || "o defeito"} no semeado e ficou calado no controlo` };
  }
  if (!achou && !acusouControlo) {
    return {
      estado: 'partido',
      porque: `nao encontrou ${s.defeito || 'o defeito'} no ficheiro semeado, e deu a MESMA resposta no controlo — nao discrimina`,
    };
  }
  if (achou && acusouControlo) {
    return { estado: 'dispara-por-reflexo', porque: 'acusou tambem o controlo limpo' };
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
