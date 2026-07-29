'use strict';
/**
 * onda0-medir.js — Onda 0.3: a regua honesta, medida na maquina real.
 *
 * Compara o REGIME ANTIGO (todas as linhas assistant somadas, peso = saidas)
 * com o REGIME NOVO (dedup por requestId, peso = entradas+saidas) sobre os
 * ficheiros reais de ~/.claude/projects, e le o Codex de ~/.codex/sessions.
 *
 * Escreve _handoff/onda0-medicao.json. Nao altera nada. Nao estima nada:
 * tudo o que imprime foi contado neste disco.
 */
const path = require('path');
const fs = require('fs');

const q = require(path.join(__dirname, '..', 'packages', 'mooter-bridge', 'quota.js'));

function regimeAntigo(raiz, agora) {
  const desdeLonga = agora - 7 * 24 * 3600e3;
  const desdeCurta = agora - 5 * 3600e3;
  const pesoDe = (m) => (/opus/i.test(m) ? 5 : (/haiku/i.test(m) ? 0.25 : 1));
  const res = { longa: { saidas: 0, linhas: 0, peso: 0 }, curta: { saidas: 0, linhas: 0, peso: 0 } };
  let projs;
  try { projs = fs.readdirSync(raiz); } catch { return res; }
  for (const proj of projs) {
    const dir = path.join(raiz, proj);
    let ents; try { ents = fs.readdirSync(dir); } catch { continue; }
    for (const n of ents) {
      if (!n.endsWith('.jsonl')) continue;
      const f = path.join(dir, n);
      let st; try { st = fs.statSync(f); } catch { continue; }
      if (st.mtimeMs < desdeLonga) continue;
      let bruto; try { bruto = fs.readFileSync(f, 'utf8'); } catch { continue; }
      for (const linha of bruto.split('\n')) {
        if (!linha) continue;
        let m; try { m = JSON.parse(linha); } catch { continue; }
        if (!m || m.type !== 'assistant') continue;
        const msg = m.message || {}; const u = msg.usage;
        if (!u) continue;
        const t = Date.parse(m.timestamp || 0) || 0;
        const s = Number(u.output_tokens || 0);
        const w = (s / 1000) * pesoDe(String(msg.model || ''));
        if (!t || t >= desdeLonga) { res.longa.saidas += s; res.longa.linhas++; res.longa.peso += w; }
        if (t && t >= desdeCurta) { res.curta.saidas += s; res.curta.linhas++; res.curta.peso += w; }
      }
    }
  }
  res.longa.peso = Number(res.longa.peso.toFixed(1));
  res.curta.peso = Number(res.curta.peso.toFixed(1));
  return res;
}

const agora = Date.now();
const raiz = q.raizSessoes();
if (!raiz) { console.error('FAIL: sem ~/.claude/projects nesta maquina'); process.exit(1); }

const antigo = regimeAntigo(raiz, agora);
const novo = q.medir({ agora });
const p = q.pressao(novo, null);
const nivelDe = (peso) => { const v = peso / 4000; return v >= 0.85 ? 'critico' : (v >= 0.6 ? 'alto' : (v >= 0.3 ? 'medio' : 'baixo')); };
const codex = q.medirCodex({ agora });

const rel = {
  medido_em: new Date(agora).toISOString(),
  fonte: novo.fonte,
  regime_antigo: {
    formula: 'todas as linhas assistant, peso = saidas/1000 x familia',
    longa: antigo.longa, curta: antigo.curta,
    nivel_com_ref_4000: nivelDe(antigo.longa.peso),
  },
  regime_novo: {
    formula: 'dedup por requestId, peso = (entradas+saidas)/1000 x familia',
    longa: {
      peso: novo.longa.peso, entradas: novo.longa.entradas, saidas: novo.longa.saidas,
      turnos_unicos: novo.longa.turnos, linhas_brutas: novo.longa.linhas_brutas,
      factor_inflacao: novo.longa.dedup.factor, suspeitas_25941: novo.longa.suspeitas,
      aviso_saidas: novo.longa.aviso_saidas || null,
    },
    curta: { peso: novo.curta.peso, turnos_unicos: novo.curta.turnos, factor_inflacao: novo.curta.dedup.factor },
    pressao: { valor: p.valor, nivel: p.nivel, referencia: p.referencia },
  },
  codex,
  nota: 'referencia 4000/400 e ajustavel e NAO e um limite publicado; este relatorio existe para a recalibrar com dados, nao com palpites',
};
fs.writeFileSync(path.join(__dirname, 'onda0-medicao.json'), JSON.stringify(rel, null, 2));

console.log('=== ONDA 0.3 — MEDICAO REAL ===');
console.log('factor de inflacao (7d): ' + novo.longa.dedup.factor + 'x  (' + novo.longa.linhas_brutas + ' linhas -> ' + novo.longa.turnos + ' turnos unicos)');
console.log('peso semana ANTIGO: ' + antigo.longa.peso + '  -> nivel ' + nivelDe(antigo.longa.peso));
console.log('peso semana NOVO:   ' + novo.longa.peso + '  -> nivel ' + p.nivel + ' (pressao ' + p.valor + ')');
console.log('suspeitas #25941:   ' + novo.longa.suspeitas + ' de ' + novo.longa.turnos + ' turnos' + (novo.longa.aviso_saidas ? '  !! GUARD ACTIVO' : ' (guard inactivo, como esperado)'));
console.log('codex: ' + (codex.disponivel ? ('DISPONIVEL - 7d: in ' + codex.longa.entradas + ' / out ' + codex.longa.saidas + ' / cache ' + codex.longa.cache_lido + ' / turnos ' + codex.longa.turnos) : ('n/d - ' + codex.porque)));
console.log('relatorio: _handoff/onda0-medicao.json');
