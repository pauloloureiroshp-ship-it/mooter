'use strict';
/**
 * calibrar-faixas.js — B5: substituir os defaults decorativos por faixas que
 * podem MESMO disparar, derivadas do histórico real desta máquina.
 *
 * Regra: uma faixa que nunca alarma é enfeite; uma que alarma sempre treina a
 * ignorar. Cada valor abaixo tem uma razão medida, escrita no próprio ficheiro.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const f = path.join(os.homedir(), '.mooter', 'preferences.json');
let p = {};
try { p = JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* primeiro uso */ }

p.board_faixas = {
  _nota: 'Calibrado em 2026-07-27 com o historico real (355 eventos, 86 jobs). Ajustavel a qualquer momento.',
  // 1000/dia nunca dispararia. Abaixo de 4 entregas num dia de trabalho = bloqueio real.
  entregas_por_dia: [4, 100],
  // mediana medida hoje: 10,175 s em 7 jobs. 45 s e' 4x a mediana — acima disso e' a lentidao sentida.
  lead_time_primeiro_token_s: [0, 45],
  // hoje 15,58%. 20 mantem margem sem tolerar degradacao.
  taxa_falha_pct: [0, 20],
  // [0,100] era decorativo: nunca poderia alarmar. Hoje 8,33%.
  taxa_interrupcao_pct: [0, 25],
  // o criterio de sucesso do M2: o MEO nao deve ser chamado mais de 1x/dia.
  interrupcoes_por_dia: [0, 1],
  // mediana 0,851 min. 20 min sem recuperar ja e' meia manha perdida.
  tempo_recuperacao_min: [0, 20],
  keep_rate_pct: [50, 100],
  // jobs cloud reais medidos: 0,28 a 0,81 USD. 0,6 apanha o Opus indevido sem alarmar no Sonnet.
  custo_por_tarefa_entregue_usd: [0, 0.6],
  // a meta e' 50%, mas hoje esta em 38,4%: 45 evita alarme permanente enquanto sobe.
  // ⚠️ subir para 50 assim que passar de 45 de forma estavel.
  trabalho_zero_pct: [45, 100],
  pressao_quota: [0, 0.85],
  wip_actual: [0, 3],
};

fs.mkdirSync(path.dirname(f), { recursive: true });
fs.writeFileSync(f, JSON.stringify(p, null, 2));
console.log('faixas gravadas em ' + f);

// VERIFICACAO: o board tem de as ler e declarar a origem como calibrada
const board = require(path.join(__dirname, '..', 'packages', 'mooter-bridge', 'board.js'));
(async () => {
  const s = typeof board.scorecardAsync === 'function' ? await board.scorecardAsync({}) : board.scorecard({});
  let calibradas = 0; let defaults = 0;
  for (const [nome, m] of Object.entries(s.metricas || {})) {
    const origem = String(m.faixa_origem || '');
    if (/calibr/i.test(origem)) calibradas++; else defaults++;
    console.log('  ' + nome.padEnd(32) + ' faixa=' + JSON.stringify(m.faixa)
      + '  estado=' + m.estado + '  origem=' + (origem.slice(0, 40) || 'n/d'));
  }
  console.log('\ncalibradas: ' + calibradas + '  ·  ainda default: ' + defaults);
  console.log('excepcoes agora: ' + (s.excepcoes || []).map((e) => e.metrica + ' (' + e.dono + ')').join(', ') || 'nenhuma');
  console.log('pode_ir_dormir: ' + JSON.stringify(s.pode_ir_dormir));
})();
