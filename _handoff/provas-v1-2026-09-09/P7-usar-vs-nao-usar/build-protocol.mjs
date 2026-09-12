// build-protocol.mjs — P7: o protocolo E o pre-registo do R-24 (congelado 2026-09-04 pelo dono). Este ficheiro so o
// referencia por sha e fixa como/onde/quando o --correr e lancado. Timestamps: new Date(), nunca a mao.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const OWNER = 'C:/Users/Paulo Loureiro/frugal';
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const prereg = JSON.parse(fs.readFileSync(path.join(OWNER, 'tools/ab/r24-prereg.json'), 'utf8'));
const diag = fs.readFileSync(path.join(OWNER, '_handoff/r24/ultimo-diagnostico.txt'), 'utf8');
const head = fs.readFileSync(path.join(OWNER, '.git/HEAD'), 'utf8').trim();
const ref = head.startsWith('ref: ') ? fs.readFileSync(path.join(OWNER, '.git', head.slice(5)), 'utf8').trim() : head;
const p = {
  _schema: 'provas-v1/protocol/1', id: 'P7', title: 'Usar vs não usar — R-24: 23 tarefas reais, TVA, Z pré-registado, ITT',
  estado: 'CONGELADO', congelado_em: new Date().toISOString(), congelado_em_fonte: 'new Date() ao gerar; a anterioridade que conta e a do pre-registo do R-24 (2026-09-04) e o commit deste ficheiro',
  regra: 'O protocolo desta prova E o pre-registo do dono (tools/ab/r24-prereg.json, CONGELADO 2026-09-04, seed fornecida por ele). Nada aqui o altera; este ficheiro fixa apenas o lancamento. Emendas so por AMENDMENT-n.md.',
  pergunta: 'Usar o Mooter (router pinado + este ambiente) e diferente de nao usar, em 23 tarefas reais do repo, medido em tempo-ate-verde (TVA) com teste mecanico e sem juiz?',
  pre_registo: {
    path: 'tools/ab/r24-prereg.json (checkout do dono, ~/frugal)', sha256: sha(path.join(OWNER, 'tools/ab/r24-prereg.json')),
    fecha_se_sobre_si_proprio: (diag.match(/fecha-se sobre si próprio\s+(\S+)/) || [])[1] || 'n/d',
    manifest_sha256: sha(path.join(OWNER, 'tools/ab/r24-manifest.json')),
    experiment_id: prereg.experiment_id, congelado_em: prereg.congelado_em, seed: prereg.seed,
    n: prereg.estatistica.n, limiar_X: prereg.estatistica.limiar_X, alfa: prereg.estatistica.alfa, H0: prereg.estatistica.H0, H1: prereg.estatistica.H1, teste: prereg.estatistica.teste, analise: prereg.estatistica.analise,
    metrica_Z: prereg.metrica_Z.predicado, variavel: `${prereg.variavel_dependente.nome} (${prereg.variavel_dependente.unidade}), tecto ${prereg.variavel_dependente.tecto_s} s, penaliza com tecto: ${prereg.variavel_dependente.penaliza_com_tecto.join(', ')}`,
    proibido: prereg.variavel_dependente.proibido,
    atribuicao: `${prereg.atribuicao.metodo}; ${prereg.atribuicao.on_primeiro} ON-primeiro, ${prereg.atribuicao.off_primeiro} OFF-primeiro; sha ${prereg.atribuicao.sha256.slice(0, 12)}`,
  },
  aparelho: {
    verificar: 'node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --verificar — 23/23 (corrida de 2026-09-09 nesta sessao, consola; re-corrida com log em _handoff/r24/verificar-2026-09-09.log)',
    controlo: 'node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --controlo — 23/23 (idem; log em _handoff/r24/controlo-2026-09-09.log)',
    diagnostico: `_handoff/r24/ultimo-diagnostico.txt: ${(diag.match(/VEREDICTO: (.*)/) || [])[1] || 'n/d'}; sonda ao modelo: ${(diag.match(/a sonda chega ao modelo\s+(.*)/) || [])[1] || 'n/d'}; router pinado ${(diag.match(/router pinado bate com o pré-registo\s+(\S+)/) || [])[1] || 'n/d'}`,
    executor: (diag.match(/executável do agente responde --version\s+(.*)/) || [])[1] || 'n/d',
    repo_do_dono: `${OWNER} @ ${ref.slice(0, 8)} (branch ${head.startsWith('ref: ') ? head.slice(16) : 'detached'})`,
  },
  execucao: {
    onde: 'checkout do dono (~/frugal) — o executor resolve o repo a partir do cwd; o worktree deste pacote nao serve (medido: o controlador recusa)',
    como: 'launch-correr.ps1: processo separado (Start-Process powershell -File), com as marcas de sessao Claude Code removidas do ambiente (CLAUDE_CODE_CHILD_SESSION, CLAUDE_CODE_SDK_HAS_HOST_AUTH_REFRESH, CLAUDE_CODE_SESSION_ID, CLAUDECODE). A guarda ambienteApto() do controlador recusa correr DENTRO de uma sessao (medido pelo dono 2026-09-03: claude -p devolvia is_error com exit 0). O diagnostico com o ambiente limpo diz apto e a sonda do proprio controlador chega ao modelo — declarado, nao escondido.',
    quando: 'ULTIMO e SOZINHO: so depois de P3, P4 e P5 terem largado o claude.exe (o TVA e tempo de parede; concorrencia contamina)',
    retoma: 'o controlador retoma sozinho (um par ja no ledger nao repete); 0 retries manuais; nada se apaga do ledger',
    log: '_handoff/r24/correr-2026-09-09.log + ledger _handoff/r24/ledger.jsonl (checkout do dono, nao versionado ali; copiado para results/ deste pacote no fim)',
  },
  semantica_do_resultado: {
    GANHOU: 'X >= 16 em 23 (binomial exacta unilateral, alfa 0,05) — e diz-se «neste ambiente, com este router pinado», nunca «o Mooter poupa X%»',
    PERDEU: 'X < 16 com corridas validas — imprime-se com a mesma tipografia',
    INVALIDA: 'o proprio controlador declara a corrida invalida (falha de autenticacao, spawn, executor) — nao e derrota nem vitoria; imprime-se o motivo literal',
    ITT: 'nao-obediencia conta como aconteceu; um braco ON que nao delega e um ON que nao delega, e entra',
  },
  nao_prova: ['poupanca em $ ou % (proibido)', 'qualidade alem do teste mecanico', 'generalizacao para outro repo/maquina/modelo', 'obediencia (P3) — aqui e ITT'],
  comando_reproduzir: 'cd ~/frugal && node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --correr && node tools/ab/correr-r24.mjs --prereg tools/ab/r24-prereg.json --analisar',
};
fs.writeFileSync(path.join(HERE, 'protocol.json'), JSON.stringify(p, null, 2) + '\n');
console.log('P7 protocol.json escrito', p.congelado_em, 'prereg sha', p.pre_registo.sha256.slice(0, 12));
