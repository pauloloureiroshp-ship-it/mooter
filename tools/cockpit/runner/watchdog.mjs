#!/usr/bin/env node
/**
 * watchdog.mjs — quem vigia o vigia, e escreve o resultado onde ele nao pode mentir.
 *
 * O `ai.mooter.f10.plist` tem `KeepAlive`: se o processo morre, o launchd
 * relanca-o. Isso cobre UM caso — o processo desaparecer. Nao cobre o que
 * acontece mais: o processo VIVO e o endpoint inutil (a porta aceita e nao
 * responde, o JSON vem sem payload, o ledger nao se le). Do lado do launchd
 * isso e um servico saudavel; do lado do dono e um cockpit em branco.
 *
 * Duas decisoes:
 *
 *  1. O UPTIME VAI PARA O PROPRIO LEDGER. Um numero de disponibilidade que vive
 *     so na memoria do processo vigiado nao vale nada: ele reinicia e o numero
 *     nasce a 100%. `~/.mooter/watchdog.jsonl` e append-only e sobrevive ao
 *     reinicio, portanto o uptime e calculavel a posteriori por quem quiser.
 *  2. NAO REINICIA NADA. So mede e escreve. Relancar um servidor que escreve no
 *     ledger e uma decisao do dono — e um watchdog que reinicia sozinho
 *     esconde exactamente o padrao que ele existe para tornar visivel.
 *
 * Determinístico e $0: um GET a loopback e uma linha appendada.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

export const PORTA = 4290;
export const REGISTO = 'watchdog.jsonl';
/** Falhas seguidas a partir das quais o painel tem de gritar. */
export const FALHAS_PARA_ALERTA = 3;
/** Janela por omissao do calculo de uptime. */
export const JANELA_H = 24;

/** Uma sondagem. Nunca lanca: um watchdog que rebenta e pior do que nenhum. */
export async function sondar({
  base = `http://127.0.0.1:${PORTA}`, fetchImpl = fetch, timeoutMs = 6000, agora = Date.now(),
} = {}) {
  const t0 = Date.now();
  try {
    const r = await fetchImpl(`${base}/fleet.json`, {
      cache: 'no-store', signal: AbortSignal.timeout(timeoutMs),
    });
    const ms = Date.now() - t0;
    if (r.status === 503 || r.status === 429) {
      // O endpoint respondeu e pediu para esperar. Isso e o contrario de estar
      // avariado, e contar como falha faria o uptime mentir para baixo.
      return { ts: new Date(agora).toISOString(), ok: true, estado: 'throttled', http: r.status, ms };
    }
    if (!r.ok) return { ts: new Date(agora).toISOString(), ok: false, estado: 'http', http: r.status, ms };
    const b = await r.json();
    const util = !!b && typeof b === 'object' && 'recibos' in b && 'running' in b;
    return util
      ? { ts: new Date(agora).toISOString(), ok: true, estado: 'vivo', http: 200, ms }
      // 200 com payload inutil e o caso que o KeepAlive nao ve: o processo esta
      // vivo e o cockpit esta em branco.
      : { ts: new Date(agora).toISOString(), ok: false, estado: 'payload-inutil', http: 200, ms };
  } catch (e) {
    return {
      ts: new Date(agora).toISOString(), ok: false, estado: 'sem-resposta',
      http: null, ms: Date.now() - t0, porque: String((e && e.message) || e).slice(0, 120),
    };
  }
}

/** Acrescenta ao registo. Append-only: um historico reescrito nao e historico. */
export function registar(linha, { mooDir = path.join(os.homedir(), '.mooter'), appendImpl = fs.appendFileSync } = {}) {
  appendImpl(path.join(mooDir, REGISTO), `${JSON.stringify(linha)}\n`);
}

/**
 * O uptime da janela, e as falhas SEGUIDAS no fim dela.
 *
 * `n/d` sem sondagens: 0 sondagens nao sao 0% de disponibilidade — sao a
 * ausencia de medicao, e imprimir 0% seria afirmar uma avaria que ninguem viu.
 */
export function uptime(linhas, { horas = JANELA_H, agora = Date.now() } = {}) {
  const t0 = agora - horas * 3600 * 1000;
  const janela = (linhas || []).filter((l) => l && Date.parse(l.ts) >= t0);
  if (!janela.length) {
    return { pct: null, sondagens: 0, falhas: 0, seguidas: 0, alerta: false, porque: `n/d — nenhuma sondagem nas ultimas ${horas} h` };
  }
  const ok = janela.filter((l) => l.ok).length;
  let seguidas = 0;
  for (let i = janela.length - 1; i >= 0 && !janela[i].ok; i -= 1) seguidas += 1;
  return {
    pct: Math.round((ok / janela.length) * 1000) / 10,
    sondagens: janela.length,
    falhas: janela.length - ok,
    seguidas,
    alerta: seguidas >= FALHAS_PARA_ALERTA,
    porque: seguidas >= FALHAS_PARA_ALERTA
      ? `${seguidas} falhas SEGUIDAS — o endpoint nao esta a servir`
      : `${ok}/${janela.length} sondagens boas nas ultimas ${horas} h`,
  };
}

export function lerRegisto({ mooDir = path.join(os.homedir(), '.mooter'), readImpl = fs.readFileSync } = {}) {
  try {
    return readImpl(path.join(mooDir, REGISTO), 'utf8').trim().split('\n').filter(Boolean)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  } catch { return []; }
}

async function main() {
  const r = await sondar();
  try { registar(r); } catch (e) { process.stderr.write(`nao consegui registar: ${e.message}\n`); }
  const u = uptime(lerRegisto());
  if (process.argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ sondagem: r, uptime: u }, null, 2)}\n`);
  } else {
    process.stdout.write(
      `watchdog F10: ${r.estado}${r.http ? ` (HTTP ${r.http})` : ''} em ${r.ms} ms\n` +
      `  uptime ${u.pct == null ? 'n/d' : `${u.pct}%`} · ${u.porque}\n`,
    );
  }
  process.exit(u.alerta ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
