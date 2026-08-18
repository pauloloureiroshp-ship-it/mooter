# O QUE FALTA CORRER — `egress-parar-heartbeat`

Data: 2026-08-18

## Estado honesto

Implementação e testes foram escritos. Nenhum `node --test` foi executado nesta
retoma, por ordem explícita do masterprompt.

**Resultado dos gates executáveis:** `n/d — sandbox sem spawn; execução delegada ao despachante`.

A linha de base `251 pass / 0 fail` é prova do despachante, não desta execução.
Existem agora 289 declarações estáticas de `test()` no pacote, incluindo 7 com
prefixo T1–T6 e 15 de `esquema`; esta contagem textual não equivale ao número de
testes que o runner reportará.

O `_handoff/ACK-DIVERGENCIA.md` pertence à primeira tentativa e ficou histórico:
o ACK-5 que a fez parar foi depois revogado pelo masterprompt. Os ACK-1 a ACK-4
foram repetidos antes destas alterações e bateram com o campo esperado:

```text
ACK-1: v24.14.0
ACK-2: true + 7 canários
ACK-3: botao_parar: false; heartbeat recusado por passos/segundos
ACK-4: estadoDoJob function; JOB_ID_VALIDO presente; provHash SHA-256 com 64 chars
```

## A · ALTO 1 — valores na fronteira

A partir da raiz do repositório:

```bash
node - <<'NODE'
const { criarPublicador } = require('./packages/slack-spike/publicar.js');
const base = {
  tipo: 'pendente',
  job_id: 'job-CANARY_PRIVATE',
  wave: 'CANARY_PRIVATE_WAVE',
  autor: { valor: 'CANARY_PRIVATE_AUTHOR' },
  motor: { valor: 'cc' },
  modelo: { valor: 'claude-haiku-4-5' },
  custo: { valor: 0, fonte: 'inferencia local sem custo de API' },
  hash_esperado: 'CANARY_PRIVATE_HASH',
  accoes: ['aprovar'],
};
const pub = criarPublicador({ dryRun: true });
const recusado = pub.publicar(base);
console.log(recusado.publicado, JSON.stringify(recusado.blocos).match(/CANARY_[A-Z_]+/g));
const degradado = pub.publicar({ ...base, job_id: 'job-hostil-1', hash_esperado: 'a'.repeat(64) });
console.log(degradado.publicado, JSON.stringify(degradado.blocos).match(/CANARY_[A-Z_]+/g));
NODE
```

Esperado: primeira linha `false null`; segunda linha `true null`.

Estado: `n/d — sandbox sem spawn; execução delegada ao despachante`.

## B · ALTO 2 — estado inicial, Parar e heartbeat

A partir da raiz do repositório:

```bash
node - <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const broker = require('./packages/mooter-bridge/broker.js');
const { criarPublicador } = require('./packages/slack-spike/publicar.js');
const { criarAdaptador } = require('./packages/slack-spike/adapter.js');
const { criarAllowlist } = require('./packages/slack-spike/allowlist.js');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'slack-spike-prova-b-'));
const ledgerPath = path.join(home, 'ledger.jsonl');
fs.writeFileSync(ledgerPath, '', 'utf8');
process.env.MOOTER_HOME = home;
const job = 'job-prova-b';
const saidas = [];
const pub = criarPublicador({ enviar: (texto, payload, blocos) => {
  saidas.push({ texto, payload, blocos });
  return { enviado: true };
} });
const ad = criarAdaptador({
  allowlist: criarAllowlist(['U_P']),
  publicador: pub,
  broker,
  lerEventos: () => fs.readFileSync(ledgerPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse),
  despachar: async ({ actor }) => {
    fs.appendFileSync(ledgerPath, JSON.stringify({
      ts: new Date().toISOString(), job_id: job, event: 'dispatched', actor,
    }) + '\n');
    return { job_id: job };
  },
});
(async () => {
  await ad.receberMencao({ user_id: 'U_P', texto: 'faz uma coisa' });
  console.log('botao_parar:', /mooter_parar/.test(JSON.stringify(saidas)));
  const hash = broker.estadoDoJob(job, ad.jobsNossos ?
    fs.readFileSync(ledgerPath, 'utf8').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : []).state_hash;
  const heartbeat = pub.publicar({
    tipo: 'estado', job_id: job, passos: 3, segundos: 70, hash_esperado: hash,
  });
  console.log('heartbeat:', heartbeat.publicado);
})().catch((e) => { console.error(e); process.exitCode = 1; });
NODE
```

Esperado: `botao_parar: true` e `heartbeat: true`.

Estado: `n/d — sandbox sem spawn; execução delegada ao despachante`.

## C · MÉDIO — fecho só depois de entrega

Prova verde directa:

```bash
cd packages/slack-spike
node --test --test-name-pattern='^T5 ' ensaio.test.js
```

Para obter prova RED por mutação sem Git, ainda a partir de
`packages/slack-spike/`, corre exactamente:

```bash
set -euo pipefail
backup="$(mktemp)"
cp poller.js "$backup"
trap 'cp "$backup" poller.js; rm -f "$backup"' EXIT
node - <<'NODE'
const fs = require('node:fs');
const p = 'poller.js';
let s = fs.readFileSync(p, 'utf8');
const actual = `      if (f.publicado) {
        if (!await entregue(f.envio)) {
          registar({ tipo: 'fecho_nao_entregue', job: f.job_id });
          continue;
        }
        fechados.add(f.job_id);`;
const mutado = `      if (f.publicado) {
        fechados.add(f.job_id);`;
if (!s.includes(actual)) throw new Error('forma esperada do fix não encontrada; não se mutou nada');
fs.writeFileSync(p, s.replace(actual, mutado));
NODE
set +e
node --test --test-name-pattern='^T5 ' ensaio.test.js
red=$?
set -e
cp "$backup" poller.js
node --test --test-name-pattern='^T5 ' ensaio.test.js
test "$red" -ne 0
```

Esperado: a versão mutada falha T5; a versão restaurada passa.

Estado: `n/d — sandbox sem spawn; execução delegada ao despachante`.

## Suite e varreduras finais

```bash
cd packages/slack-spike
node --test
```

Esperado: `# fail 0`; a contagem deve ser a do runner, sem a inferir da contagem
textual acima.

```bash
cd ../..
rg -n -i 'canary|canario|canário' packages/slack-spike -g '*.js' -g '!*.test.js'
```

Esperado: nenhuma ocorrência e exit code 1 do `rg`.

```bash
node -e "const fs=require('node:fs'),c=require('node:crypto');const h=c.createHash('sha256').update(fs.readFileSync('tools/router/classify.js')).digest('hex');console.log(h)"
```

Esperado: `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f`.

Estado de todos estes gates: `n/d — sandbox sem spawn; execução delegada ao despachante`.

## Validação estática já observada

```text
node --check: 30 ficheiros OK
require: esquema/publicar/cartao/leitura/adapter/poller OK
sweep canary fora de testes: nenhum
sha256 classify.js: 427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f
```

Isto não substitui a suite.

## Pre-Dispatch Red-Team Gate

1. **fonte de verdade** — ledger local + `broker.estadoDoJob`; a fronteira pública é `esquema.validar` em `publicar.js`.
2. **escritor único** — o adapter deriva o payload; o esquema é o único normalizador; o publicador é a única porta para Slack.
3. **reversível vs irreversível** — alterações locais e reversíveis; despacho, push, merge e publicação real não foram feitos.
4. **script-first** — comandos exactos acima; sem alegar resultados que ainda dependem do runner.
5. **projeção vs 2ª verdade** — cartão é projecção do ledger/broker, não estado concorrente; dedupe só após confirmação do transporte.
6. **degradação graciosa** — mostruário inválido vira `n/d` com `degradados`; identidade/prova/acção inválida recusa.
7. **frozen/allowlist/n-d** — `packages/mooter-bridge/` e `classify.js` mantidos congelados; allowlist profunda; testes executáveis em `n/d`.
8. **custo de reverter** — remover `esquema.js` e reverter as ligações/testes locais; nenhum dado remoto precisa de compensação.

**Objecção real:** as gramáticas aceites para `wave`, `job_id` e `modelo` impedem
prosa comum, mas continuam a ser um canal encoberto limitado para um chamador
deliberadamente hostil. Não foram apertadas para uma enumeração fechada porque o
masterprompt manda partilhar exactamente essas gramáticas. O runner pode provar
o contrato implementado; não pode transformar esta limitação de desenho numa
garantia contra esteganografia intencional.
