// redigir.mjs — tira o texto dos prompts reais do dono do pacote, sem apagar prova nenhuma.
//
//   node redigir.mjs <pasta-do-pacote> [--aplicar]
//
// Faz TRÊS passagens, porque a primeira versão deste ficheiro só fazia a terceira e deixou
// 15 agulhas vivas em 4 ficheiros — apanhado pelo teste de agulhas, não pela leitura.
//
//   1. CAMPOS INTEIROS  `prompt_preview` (truncatura de 80 chars do prompt cru) e `result_text`
//      (a resposta do modelo, que CITA o prompt de volta). Nenhum dos dois é lido por análise
//      nenhuma — verificado em P1/*.mjs, P3/run.mjs e lib/conferir-cartoes.mjs.
//   2. PREFIXOS         qualquer prefixo de ≥ 24 chars de um prompt real, do mais longo para o
//      mais curto. É como a truncatura aparece noutros sítios.
//   3. INTEIROS         o prompt completo, na forma crua e na forma escapada de JSON.
//
// O marcador é determinístico: [[redigido sha256:XXXXXXXXXXXX chars:NNN]]. Quem tiver o
// original recalcula o sha e confirma que é o mesmo texto, sem ele estar publicado.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const PKG = process.argv[2];
const APLICAR = process.argv.includes('--aplicar');
if (!PKG) { console.error('uso: node redigir.mjs <pasta-do-pacote> [--aplicar]'); process.exit(2); }

const marcador = (s) => `[[redigido sha256:${crypto.createHash('sha256').update(String(s), 'utf8').digest('hex').slice(0, 12)} chars:${String(s).length}]]`;

// ── os prompts reais ────────────────────────────────────────────────────────
const lerArr = (p) => { try { const c = JSON.parse(fs.readFileSync(p, 'utf8')); return Array.isArray(c) ? c : (c.prompts || Object.values(c).find(Array.isArray) || []); } catch { return []; } };
const reais = [];
for (const x of lerArr(path.join(PKG, 'P1-decidir-custa-zero', 'corpus-63.json'))) {
  if (/sept|transcript/i.test(String(x.source || ''))) { const s = String(x.prompt || x.text || ''); if (s) reais.push(s); }
}
for (const x of lerArr(path.join(PKG, 'P3-obediencia', 'corpus-20.json'))) { const s = String(x.prompt || x.text || ''); if (s) reais.push(s); }
const unicos = [...new Set(reais)].sort((a, b) => b.length - a.length);

// prefixos de >= 24 chars, do mais longo para o mais curto, sem duplicados
// MIN = 24, MAS o prompt inteiro entra sempre, mesmo que seja mais curto do que isso.
// A primeira versao usava `for (n = p.length; n >= 24; n--)`, que para um prompt de 22 chars
// NAO CORRE NENHUMA VEZ — dois prompts curtos («[[redigido sha256:358e51119479 chars:22]]», 22 chars) sobreviveram
// intactos e so o teste de agulhas os apanhou.
const MIN = 24;
const prefixos = [];
for (const p of unicos) {
  prefixos.push(p);
  for (let n = p.length - 1; n >= MIN; n--) prefixos.push(p.slice(0, n));
}
const prefUnicos = [...new Set(prefixos)].sort((a, b) => b.length - a.length);

// ── varrer ──────────────────────────────────────────────────────────────────
const CAMPOS = new Set(['prompt_preview', 'result_text']);
const alvos = [];
(function anda(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '.git') anda(p); continue; }
    if (/\.(json|jsonl|log|txt|md|mjs|js|ps1)$/i.test(e.name)) alvos.push(p);
  }
})(PKG);

const limpaCampos = (v) => {
  if (Array.isArray(v)) return v.map(limpaCampos);
  if (v && typeof v === 'object') {
    const o = {};
    for (const [k, val] of Object.entries(v)) o[k] = CAMPOS.has(k) && typeof val === 'string' && val.length ? marcador(val) : limpaCampos(val);
    return o;
  }
  return v;
};

let tocados = 0, subs = 0; const relatorio = [];
for (const f of alvos) {
  let s; try { s = fs.readFileSync(f, 'utf8'); } catch { continue; }
  const s0 = s;
  let n = 0;

  // passagem 1 — campos inteiros, com parse para garantir que continua valido
  if (/\.jsonl$|\.log$/i.test(f)) {
    const linhas = s.split('\n');
    let mudou = false;
    for (let i = 0; i < linhas.length; i++) {
      const l = linhas[i]; if (!l.trim().startsWith('{')) continue;
      let j; try { j = JSON.parse(l); } catch { continue; }
      const antes = JSON.stringify(j); const depois = JSON.stringify(limpaCampos(j));
      if (antes !== depois) { linhas[i] = depois; mudou = true; n++; }
    }
    if (mudou) s = linhas.join('\n');
  } else if (/\.json$/i.test(f)) {
    try { const j = JSON.parse(s); const d = JSON.stringify(limpaCampos(j), null, 1); if (d !== JSON.stringify(j, null, 1)) { s = d; n++; } } catch { /* n/d */ }
  }

  // passagens 2 e 3 — prefixos (inclui o prompt inteiro) na forma crua e escapada
  for (const p of prefUnicos) {
    if (s.includes(p)) { s = s.split(p).join(marcador(p)); n++; continue; }
    const esc = JSON.stringify(p).slice(1, -1);
    if (esc !== p && s.includes(esc)) { s = s.split(esc).join(marcador(p)); n++; }
  }

  if (s !== s0) {
    tocados++; subs += n;
    relatorio.push(`${String(n).padStart(4)}  ${path.relative(PKG, f).split('\\').join('/')}`);
    if (APLICAR) {
      if (/\.json$/i.test(f)) { try { JSON.parse(s); } catch (e) { console.error('ABORTA (JSON invalido): ' + f + ' :: ' + e.message); process.exit(1); } }
      if (/\.jsonl$|\.log$/i.test(f)) {
        for (const [i, l] of s.split('\n').entries()) { if (!l.trim().startsWith('{')) continue; try { JSON.parse(l); } catch (e) { console.error(`ABORTA (JSONL invalido): ${f} linha ${i + 1} :: ${e.message}`); process.exit(1); } }
      }
      fs.writeFileSync(f, s);
    }
  }
}

console.log(`prompts reais: ${unicos.length} · prefixos gerados: ${prefUnicos.length}`);
console.log(`ficheiros tocados: ${tocados} · substituicoes: ${subs}${APLICAR ? '' : '   (SECO — nada escrito)'}`);
for (const l of relatorio) console.log('  ' + l);
