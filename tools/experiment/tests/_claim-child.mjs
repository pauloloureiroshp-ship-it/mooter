// _claim-child.mjs — um processo que tenta reclamar um slot. Usado pelo teste 03
// para provar que o O_CREAT|O_EXCL ('wx') é o que garante ≤1 token por slot
// entre PROCESSOS — o existsSync é só a mensagem simpática.
//
// Para a corrida ser determinística (e não uma lotaria de microsegundos), o fs
// injectado dorme `delayMs` DEPOIS do existsSync do .intent e ANTES do
// openSync: todos os processos vêem «não existe», todos avançam, e só o 'wx'
// decide. Sem 'wx' ficariam todos com token — e o diário com N intents.
//
// argv: root waveId slotId delayMs promptHash manifestHash nowMs (relógio injectado, o mesmo do pai)

import fs from 'node:fs';
import * as J from '../journal.mjs';

const [root, waveId, slotId, delayMsRaw, promptHash, manifestHash, nowMsRaw] = process.argv.slice(2);
const nowMs = Number(nowMsRaw);
const delayMs = Number(delayMsRaw) || 0;

const proxy = new Proxy(fs, {
  get(target, prop) {
    if (prop === 'existsSync') {
      return (p) => {
        const r = target.existsSync(p);
        if (String(p).endsWith('.intent') && delayMs > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
        return r;
      };
    }
    return target[prop];
  },
});

try {
  const ctx = J.openJournal({ root, waveId, fs: proxy, now: () => nowMs });
  const r = J.commitIntent(ctx, { slot_id: slotId, prompt_hash: promptHash, manifest_hash: manifestHash });
  process.stdout.write(JSON.stringify({ ok: true, pid: process.pid, attempt_token: r.attempt_token }) + '\n');
} catch (e) {
  process.stdout.write(JSON.stringify({ ok: false, pid: process.pid, code: e && e.code, message: String(e && e.message).slice(0, 200) }) + '\n');
}
