#!/usr/bin/env node
/**
 * prereg.mjs — pre-registo do corpus, por sha, ANTES de qualquer corrida.
 *
 *   node tools/nucleo/prereg.mjs            # regista o corpus actual
 *   node tools/nucleo/prereg.mjs --check    # so verifica se ha registo valido
 *
 * Porque isto e um mecanismo e nao um paragrafo: apertar o corpus depois de ver
 * qual candidato ganhou e fabricar discriminacao. O `medir.mjs` recusa correr sem
 * um pre-registo para o `corpus_sha` exacto, e o `verificar.mjs` confere-o do lado
 * de quem audita (C9: existe, bate com o ledger, e o ledger esta completo face ao
 * conjunto pregado). Mudar uma virgula no corpus muda o sha e obriga a um novo
 * registo, datado.
 *
 * LIMITE, dito por extenso porque uma versao anterior deste comentario chamou a
 * isto "irreversivel por omissao" e era falso: `flag:'wx'` protege contra
 * SOBRESCRITA, nao contra um `rm`. Este ficheiro e local e apagavel. A ancora
 * durvel contra cherry-pick e o `corpus.json` estar em git, com historico.
 *
 * O molde e o poke_lab/portao_demo.py: consulta o estado real no disco em vez de
 * acreditar em quem chama.
 *
 * Os candidatos NAO entram aqui de proposito. O que se pre-regista e o conjunto
 * de tarefas e os criterios de aceitacao; quem corre contra eles e decidido
 * depois, e nao pode mudar o que ja esta pregado.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { carregarCorpus } from './nucleo.mjs';

export const DIR_PREREG = path.join(process.env.MOOTER_HOME || path.join(os.homedir(), '.mooter'), 'medicoes');

/** Criterios de aceitacao, pregados junto com o corpus. */
export const CRITERIOS = {
  C1: 'todo registo valida measurement_v2, com tarefa_id e sem seed numerica',
  C2: 'cadeia: seq contiguo, prev_hash liga, record_hash cobre o corpo',
  C3: '>=2 candidatos distintos',
  C4: '>=1 tarefa em que o sucesso difere entre candidatos (o corpus nao e inerte)',
  C5: 'seed e determinismo declarados n/d — nada prometido por medir',
  C6: 'categoria e tier nao estao confundidos: >=1 categoria em >=2 tiers e >=1 tier com >=2 categorias',
  reportado_nao_gated: 'separa_modelos e separa_skill sao PUBLICADOS em separado. Se os modelos nao separarem, isso e o resultado e publica-se — nao se aperta o corpus para o esconder.',
};

export function caminhoPrereg(corpusSha) {
  return path.join(DIR_PREREG, `prereg-${corpusSha.slice(0, 12)}.json`);
}

export function lerPrereg(corpusSha) {
  const p = caminhoPrereg(corpusSha);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function distribuicao(tarefas, campo) {
  const m = {};
  for (const t of tarefas) m[t[campo]] = (m[t[campo]] || 0) + 1;
  return m;
}

export function registar(corpus, agoraIso) {
  const p = caminhoPrereg(corpus.corpus_sha);
  if (fs.existsSync(p)) return { ja_existia: true, caminho: p, prereg: JSON.parse(fs.readFileSync(p, 'utf8')) };
  const prereg = {
    schema: 'prereg_v1',
    corpus_sha: corpus.corpus_sha,
    corpus_versao: corpus.versao,
    n_tarefas: corpus.tarefas.length,
    rubrica: corpus.rubrica,
    distribuicao: {
      dificuldade: distribuicao(corpus.tarefas, 'dificuldade'),
      categoria: distribuicao(corpus.tarefas, 'categoria'),
      tier: distribuicao(corpus.tarefas, 'tier'),
    },
    tarefas: corpus.tarefas.map((t) => ({ id: t.id, dificuldade: t.dificuldade, categoria: t.categoria, tier: t.tier })),
    criterios: CRITERIOS,
    candidatos: 'por declarar — de proposito: pregam-se as tarefas, nao quem corre contra elas',
    registado_em: agoraIso,
  };
  fs.mkdirSync(DIR_PREREG, { recursive: true });
  // wx: falha se outro processo registou entretanto. Nunca sobrescreve.
  fs.writeFileSync(p, JSON.stringify(prereg, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return { ja_existia: false, caminho: p, prereg };
}

if (process.argv[1]?.endsWith('prereg.mjs')) {
  const corpus = carregarCorpus();
  if (process.argv.includes('--check')) {
    const p = lerPrereg(corpus.corpus_sha);
    if (!p) {
      process.stderr.write(`SEM PRE-REGISTO para corpus_sha ${corpus.corpus_sha.slice(0, 12)}\n  corre: node tools/nucleo/prereg.mjs\n`);
      process.exit(1);
    }
    process.stdout.write(`OK — pre-registado em ${p.registado_em} · ${p.n_tarefas} tarefas · sha ${corpus.corpus_sha.slice(0, 12)}\n`);
    process.exit(0);
  }
  const r = registar(corpus, new Date().toISOString());
  process.stdout.write(`${r.ja_existia ? 'JA EXISTIA' : 'REGISTADO'} · ${r.caminho}\n`);
  process.stdout.write(`corpus_sha ${corpus.corpus_sha}\n${r.prereg.n_tarefas} tarefas · dificuldade ${JSON.stringify(r.prereg.distribuicao.dificuldade)}\n`);
}
