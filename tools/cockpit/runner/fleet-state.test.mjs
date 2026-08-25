import test from 'node:test';
import path from 'node:path';
import assert from 'node:assert/strict';

import {
  buildFleetState,
  readLedger,
  ownerDay,
  freshness,
  OWNER_TZ,
  STALE_AFTER_S,
  emptyStreak,
} from './fleet-state.mjs';
import { parseIoreg, sampleGpu } from './gpu-sampler.mjs';
import { originAllowed, hostAllowed, panelCandidates } from './f10-server.mjs';

const T0 = Date.parse('2026-08-16T16:24:25Z');

function fakeFs(files) {
  return {
    read: (p) => {
      if (!(p in files)) throw new Error(`ENOENT ${p}`);
      return files[p];
    },
    exists: (p) => p in files,
  };
}

function jsonl(...objs) {
  return objs.map((o) => JSON.stringify(o)).join('\n') + '\n';
}

// ---------------------------------------------------------------- ledger

test('readLedger conta linhas corrompidas em vez de as engolir', () => {
  const fs_ = fakeFs({ '/l': `${JSON.stringify({ ts: 'x' })}\nnao-e-json\n` });
  const out = readLedger('/l', { readImpl: fs_.read });
  assert.equal(out.receipts.length, 1);
  assert.equal(out.corrompidas, 1);
  assert.equal(out.existe, true);
});

test('readLedger declara ledger inexistente sem rebentar', () => {
  const out = readLedger('/nao-existe', { readImpl: () => { throw new Error('ENOENT'); } });
  assert.deepEqual(out, { receipts: [], corrompidas: 0, existe: false });
});

// ---------------------------------------------------------------- owner tz

test('ownerDay usa o fuso do dono, nao o do host', () => {
  // 2026-08-16T02:00Z ainda e dia 15 em Sao Paulo (UTC-3).
  assert.equal(ownerDay(Date.parse('2026-08-16T02:00:00Z')), '2026-08-15');
  assert.equal(ownerDay(Date.parse('2026-08-16T16:00:00Z')), '2026-08-16');
  assert.equal(OWNER_TZ, 'America/Sao_Paulo');
});

// ---------------------------------------------------------------- freshness

test('freshness: recibo recente e vivo', () => {
  const f = freshness('2026-08-16T16:24:00Z', T0);
  assert.equal(f.estado, 'vivo');
  assert.equal(f.idade_s, 25);
});

test('freshness: silencio longo nunca fica verde', () => {
  assert.equal(freshness('2026-08-16T16:20:00Z', T0).estado, 'stale');
  assert.equal(freshness('2026-08-16T15:00:00Z', T0).estado, 'morto');
});

test('freshness: idade desconhecida e morto, nunca vivo', () => {
  assert.equal(freshness(null, T0).estado, 'morto');
  assert.equal(freshness('nao-e-data', T0).estado, 'morto');
  assert.ok(STALE_AFTER_S > 0);
});

// ---------------------------------------------------------------- fleet.json

test('fleet.json separa volume de trabalho por veredicto', () => {
  const files = {
    '/ledger': jsonl(
      { ts: '2026-08-16T16:24:20Z', verdict: 'citacao-ok' },
      { ts: '2026-08-16T16:24:22Z', verdict: 'refutado' },
      { ts: '2026-08-16T16:24:24Z', verdict: 'sem-citacao' },
      { ts: '2026-08-16T16:24:25Z', verdict: 'sem-achado' },
    ),
    '/state': JSON.stringify({ device: 'mac-mini', pilar_atual: 'P3', modelo: 'qwen2.5-coder:14b' }),
  };
  const fs_ = fakeFs(files);
  const s = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    now: T0,
    readImpl: fs_.read,
    existsImpl: fs_.exists,
    engineAlive: true,
  });
  assert.equal(s.recibos.total, 4);
  assert.equal(s.recibos.citacao_ok, 1);
  assert.equal(s.recibos.refutado, 1);
  assert.equal(s.recibos.sem_citacao, 1);
  assert.equal(s.recibos.sem_achado, 1);
  assert.equal(s.usd, 0);
  assert.equal(s.running, true, 'sem STOP => a correr');
  assert.equal(s.frescura.estado, 'vivo');
});

test('o ledger antigo (174 recibos sem veredicto) nao pode passar por trabalho', () => {
  const legacy = jsonl(
    ...Array.from({ length: 174 }, (_, i) => ({
      ts: '2026-08-16T16:24:25Z',
      evidencia: 'ollama:qwen2.5-coder:14b nao-verificado',
      resultado_resumo: `Comando: show ip route ${i}`,
    })),
  );
  const fs_ = fakeFs({ '/ledger': legacy, '/state': '{}' });
  const s = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    now: T0,
    readImpl: fs_.read,
    existsImpl: fs_.exists,
  });
  assert.equal(s.recibos.total, 174);
  assert.equal(s.recibos.citacao_ok, 0, '174 recibos, zero citacoes verificaveis');
  assert.equal(s.recibos.sem_veredicto, 174);
});

test('STOP presente => running false', () => {
  const fs_ = fakeFs({ '/ledger': '', '/state': '{}', '/STOP': '1' });
  const s = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    now: T0,
    readImpl: fs_.read,
    existsImpl: fs_.exists,
  });
  assert.equal(s.running, false);
  assert.equal(s.engine, 'down', 'motor nao confirmado nunca aparece vivo');
});

test('estado ilegivel degrada para null, nao para um valor inventado', () => {
  const fs_ = fakeFs({ '/ledger': '', '/state': '{{{ lixo' });
  const s = buildFleetState({
    ledgerPath: '/ledger',
    statePath: '/state',
    stopFile: '/STOP',
    now: T0,
    readImpl: fs_.read,
    existsImpl: fs_.exists,
  });
  assert.equal(s.pilar_atual, null);
  assert.equal(s.modelo_atual, null);
  assert.equal(s.frescura.estado, 'morto');
});

test('DETECTOR: 31 apontamentos entram pela porta propria, ligam o alerta e nao alteram o funil do modelo', () => {
  const base = path.resolve('detector-home');
  const repo = path.resolve('detector-repo');
  const apontamentos = Array.from({ length: 31 }, (_, i) => ({
    file: `tools/f${i}.mjs`, line: i + 1, rule: 'catch-neutro', msg: `verifica ${i}`,
  }));
  const files = {
    '/ledger': jsonl({
      ts: '2026-08-16T16:24:20Z', chave: 'modelo-1', pilar: 'P2',
      ficheiro: 'tools/modelo.mjs', janela: '1-2', evidencia: 'tools/modelo.mjs:1 => x',
      resultado_resumo: 'ACHADO: modelo', conclusao: 'achado', verdict: 'citacao-ok',
    }),
    '/state': '{}',
    [path.join(base, 'ancora-achados.json')]: JSON.stringify(apontamentos),
    [path.join(base, 'ancora-manifesto.json')]: JSON.stringify({
      gerado_em: '2026-08-25T20:34:50Z', repo, apontamentos: 31, ficheiros_no_ambito: 289,
    }),
  };
  const fs_ = fakeFs(files);
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP', triagemPath: '/triagem',
    baseDir: base, repoRoot: repo, now: T0, readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.detector.estado, 'ok');
  assert.equal(s.triagem.detector.apontamentos, 31);
  assert.equal(s.triagem.detector.por_triar, 31);
  assert.equal(s.triagem.por_triar_modelo, 1);
  assert.equal(s.triagem.por_triar, 32);
  assert.equal(s.triagem.achados, 1, 'o funil do modelo nao absorve regex');
  assert.equal(s.por_triar.filter((x) => x.origem === 'detector-deterministico').length, 31);
  assert.equal(s.por_triar.filter((x) => x.origem === 'modelo-local').length, 1);
  assert.equal(s.alerta_achados, true);
});

test('DETECTOR: ausencia ou ancora ilegivel publica n/d, nunca zero', () => {
  const base = path.resolve('detector-nd');
  const repo = path.resolve('detector-repo');
  const manifesto = JSON.stringify({
    gerado_em: '2026-08-25T20:34:50Z', repo, apontamentos: 1, ficheiros_no_ambito: 289,
  });
  const construir = (extra) => {
    const fs_ = fakeFs({ '/ledger': '', '/state': '{}', ...extra });
    return buildFleetState({
      ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP', baseDir: base, repoRoot: repo,
      now: T0, readImpl: fs_.read, existsImpl: fs_.exists,
    });
  };
  const ausente = construir({ [path.join(base, 'ancora-manifesto.json')]: manifesto });
  assert.equal(ausente.triagem.detector.estado, 'n/d');
  assert.match(ausente.triagem.detector.porque, /missing/);
  assert.equal(ausente.triagem.por_triar, null);
  assert.equal(ausente.alerta_achados, null);

  const ilegivel = construir({
    [path.join(base, 'ancora-achados.json')]: '{ lixo',
    [path.join(base, 'ancora-manifesto.json')]: manifesto,
  });
  assert.equal(ilegivel.triagem.detector.estado, 'n/d');
  assert.match(ilegivel.triagem.detector.porque, /unreadable/);
  assert.equal(ilegivel.triagem.detector.apontamentos, null);
  assert.equal(ilegivel.triagem.por_triar, null);
});

test('DETECTOR: zero so existe com ancora e manifesto validos do repo servido', () => {
  const base = path.resolve('detector-zero');
  const repo = path.resolve('detector-repo');
  const files = {
    '/ledger': '', '/state': '{}',
    [path.join(base, 'ancora-achados.json')]: '[]',
    [path.join(base, 'ancora-manifesto.json')]: JSON.stringify({
      gerado_em: '2026-08-25T20:34:50Z', repo, apontamentos: 0, ficheiros_no_ambito: 289,
    }),
  };
  const fs_ = fakeFs(files);
  const s = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP', baseDir: base, repoRoot: repo,
    now: T0, readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.triagem.detector.estado, 'ok');
  assert.equal(s.triagem.detector.apontamentos, 0);
  assert.equal(s.triagem.por_triar, 0);
  assert.equal(s.alerta_achados, false);

  files[path.join(base, 'ancora-manifesto.json')] = JSON.stringify({
    gerado_em: '2026-08-25T20:34:50Z', repo: path.resolve('outro-repo'), apontamentos: 0,
  });
  const cruzado = buildFleetState({
    ledgerPath: '/ledger', statePath: '/state', stopFile: '/STOP', baseDir: base, repoRoot: repo,
    now: T0, readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(cruzado.triagem.detector.estado, 'n/d');
  assert.match(cruzado.triagem.detector.porque, /another repository/);
});

// ---------------------------------------------------------------- gpu

test('parseIoreg extrai utilizacao e VRAM reais', () => {
  const sample = '"Device Utilization %"=74 "In use system memory"=16050000000 "Alloc system memory"=18850000000';
  const g = parseIoreg(sample);
  assert.equal(g.util_pct, 74);
  assert.equal(g.vram_inuse_gb, 16.05);
  assert.equal(g.fonte, 'ioreg:IOAccelerator');
});

test('parseIoreg devolve n/d em vez de zero quando nao ha amostra', () => {
  const g = parseIoreg('');
  assert.equal(g.util_pct, null);
  assert.equal(g.fonte, 'n/a');
});

test('numa plataforma sem amostrador conhecido diz porque nao mediu', async () => {
  // win32/linux passaram a ter caminho (nvidia-smi) — ver fleet-beacon.test.mjs.
  const g = await sampleGpu({ platform: 'aix', runImpl: async () => assert.fail('nao corre') });
  assert.equal(g.util_pct, null);
  assert.match(g.motivo, /no sampler for aix/);
});

test('sampleGpu com ioreg em falha nao inventa numero', async () => {
  const g = await sampleGpu({ platform: 'darwin', runImpl: async () => null });
  assert.equal(g.util_pct, null);
  assert.match(g.motivo, /ioreg failed/);
});

// ---------------------------------------------------------------- endpoint

test('play/stop so aceitam origem da propria maquina', () => {
  assert.equal(originAllowed(undefined), true, 'curl/shell local, sem browser');
  assert.equal(originAllowed('http://127.0.0.1:4290'), true, 'o cockpit servido em loopback');
  assert.equal(originAllowed('http://localhost:5173'), true);
  assert.equal(originAllowed('https://site-qualquer.com'), false, 'drive-by control');
  assert.equal(originAllowed('http://evil.127.0.0.1.nip.io'), false);
});

test('Origin "null" e recusado — e a origem de um iframe sandboxed de qualquer site', () => {
  // Custou-nos permitir isto para o painel abrir de file://. O painel passou a
  // ser servido por http de loopback, e a conveniencia so oferecia ao mundo um
  // kill-switch remoto.
  assert.equal(originAllowed('null'), false);
});

test('hostAllowed fecha DNS rebinding: o Host denuncia o nome do atacante', () => {
  assert.equal(hostAllowed('127.0.0.1:4290'), true);
  assert.equal(hostAllowed('localhost:4290'), true);
  assert.equal(hostAllowed('[::1]:4290'), true);
  assert.equal(hostAllowed('rebind.attacker.com:4290'), false);
  assert.equal(hostAllowed('evil.127.0.0.1.nip.io:4290'), false);
  assert.equal(hostAllowed(undefined), false, 'sem Host => recusado');
});

test('o painel prefere a copia canonica do repo a prototipo untracked', () => {
  const [first, second] = panelCandidates('/repo');
  assert.match(first.split(path.sep).join('/'), /tools\/cockpit\/moo-pilot-shell\.html$/);
  assert.match(second.split(path.sep).join('/'), /moo-pilot-preview\.html$/);
});

// ── correcções que vieram do gauntlet adversarial (F9) ───────────────────────

test('recibo datado no futuro nao pode prender o cockpit em verde', () => {
  const futuro = new Date(T0 + 3600_000).toISOString();
  const f = freshness(futuro, T0);
  assert.equal(f.estado, 'morto');
  assert.match(f.motivo, /future/);
});

test('a tolerancia de relogio nao transforma desvio pequeno em falha', () => {
  const quase = new Date(T0 + 2000).toISOString();
  assert.equal(freshness(quase, T0).estado, 'vivo');
});

test('um ts corrompido no ledger nao pode rebentar o endpoint', () => {
  const fs_ = fakeFs({
    '/l': jsonl({ ts: 'nao-e-data', verdict: 'citacao-ok' }, { ts: '2026-08-16T16:24:20Z', verdict: 'citacao-ok' }),
    '/s': '{}',
  });
  const s = buildFleetState({
    ledgerPath: '/l', statePath: '/s', stopFile: '/STOP', now: T0,
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.recibos.total, 2);
  assert.equal(s.recibos.hoje, 1, 'a linha ilegivel e excluida do "hoje", nao rebenta');
});

test('a janela de "vivo" nao pode ser varias vezes maior que a ronda real', () => {
  // Uma ronda + sleep no pior caso ronda os 45s. 180s davam 3 minutos de verde
  // sobre um loop morto com o endpoint ainda de pe.
  assert.ok(STALE_AFTER_S <= 90, `STALE_AFTER_S=${STALE_AFTER_S} e demasiado permissivo`);
});

test('rondas vazias seguidas disparam alarme — GPU ocupada nao e trabalho', () => {
  const vazias = Array.from({ length: 12 }, () => ({ ts: '2026-08-16T16:24:20Z', verdict: 'sem-achado' }));
  const fs_ = fakeFs({ '/l': jsonl(...vazias), '/s': '{}' });
  const s = buildFleetState({
    ledgerPath: '/l', statePath: '/s', stopFile: '/STOP', now: T0,
    readImpl: fs_.read, existsImpl: fs_.exists,
  });
  assert.equal(s.recibos.vazias_seguidas, 12);
  assert.equal(s.recibos.alarme_ocioso, true);
});

test('emptyStreak conta so a corrida actual, nao o historico todo', () => {
  assert.equal(emptyStreak([
    { verdict: 'sem-achado' }, { verdict: 'citacao-ok' }, { verdict: 'sem-achado' }, { verdict: 'sem-citacao' },
  ]), 2);
  assert.equal(emptyStreak([{ verdict: 'citacao-ok' }]), 0);
});
