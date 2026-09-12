#!/bin/zsh
# 28-BENCH-SMOKE — prova que o B3/B6 funciona ANTES de gastar horas no N>=100.
cd "$(dirname "$0")/../.."
LOG="$(pwd)/_handoff/motor-mac-smoke-$(date +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1
echo "=== 28-BENCH-SMOKE · $(date) ==="
node --input-type=module -e "
import { b3, b6 } from './tools/cockpit/runner/bench-b3b6.mjs';
const m = 'granite4.2:3b';
console.log('--- B3 (1 rep por tarefa = 5 chamadas) ---');
const r3 = await b3({ model: m, reps: 1, log: (l) => console.log(l) });
console.log(JSON.stringify({ pct: r3.pct, porTarefa: r3.porTarefa }, null, 1));
console.log('--- B6 (2 reps) ---');
const r6 = await b6({ model: m, reps: 2, log: (l) => console.log(l) });
console.log(JSON.stringify({ parse: r6.parse_pct, schema: r6.schema_pct, enum: r6.enum_pct }, null, 1));
console.log(r3.n === 5 && r6.n === 2 ? '✅ SMOKE OK — o arnes corre' : '❌ SMOKE FALHOU');
"
echo "=== FIM · $(date) ==="
echo "Fecha esta janela."
