import { MooterMarkTiny } from './MooterMark';
import { M } from '@/app/lib/canonical-metrics';

// StatuslineCard — the 3-line narrative statusline (IMPLEMENTATION_SPEC §6.1 / §11.2).
// Matches STATUSLINE_FORMAT_LINES. Reusable in hero + dashboard preview.
export interface StatuslineData {
  routedCheap: string;
  tier: string;
  model: string;
  conf: string;
  pack: string;
  bar5h: string;
  pct5h: string;
  bar7d: string;
  pct7d: string;
  resetIn: string;
  ctxPct: string;
  adapterOn: boolean;
  costTurn: string;
  alltime: string;
}

// Valores de AMOSTRA para a pre-visualizacao do componente — excepto os que
// tem fonte canonica, que derivam dela. Ate 2026-08-20 o `savedPct` era o
// literal '89%' enquanto o resto da landing publicava os 47% de
// `canonical-metrics.ts`: a mesma poupanca com dois numeros, no mesmo site.
// Achado pelo pilar P6 do Moo Pilot (landing/components/StatuslineCard.tsx:24).
// Os restantes campos nao tem fonte canonica nenhuma e ficam como amostra
// declarada — inventar consistencia entre numeros inventados seria pior.
// 2026-08-23: a maqueta deixou de mostrar poupanca de todo.
//
// Nao foi para passar a guarda de literais aqui ao lado — foi porque a guarda
// tem razao. O `savedPct` derivava de `M.savedPct`, e esse campo deixou de
// existir: uma auditoria encontrou CINCO numeros de poupanca a contradizerem-se
// neste projecto, e nenhum sobreviveu, porque zero ficheiros de telemetria
// registam tokens. Sem tokens nao ha custo medido; sem custo nao ha poupanca.
//
// Uma maqueta do statusline que mostra um numero que o statusline vai deixar de
// mostrar nao e uma pre-visualizacao — e uma promessa. O que fica no lugar e o
// que ESTA medido: quantos prompts classificados foram para tier barato.
const DEFAULTS: StatuslineData = {
  routedCheap: M.recomendadoBarato, // canonico, e o unico numero medido do cartao
  tier: 'T2',
  model: 'sonnet',
  conf: '0.84',
  pack: 'diagram-systems',
  bar5h: '▓▓▓▓░░░░░░',
  pct5h: '42% 5h',
  bar7d: '▓▓░░░░░░░░',
  pct7d: '18% 7d',
  resetIn: '2h14m',
  ctxPct: '23%',
  adapterOn: false,
  costTurn: '$0.04',
  alltime: '$4.21',
};

export default function StatuslineCard({ data }: { data?: Partial<StatuslineData> }) {
  const d = { ...DEFAULTS, ...data };
  const dim = 'var(--color-term-dim)';
  const fg = 'var(--color-term-fg)';
  return (
    <div
      className="num"
      style={{
        fontFamily: 'var(--mono)',
        fontVariantNumeric: 'tabular-nums',
        fontSize: 12.5,
        lineHeight: 1.85,
        color: fg,
        whiteSpace: 'pre',
        overflowX: 'auto',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <MooterMarkTiny size={14} />
        <span>
          routed cheap <span style={{ color: 'var(--color-green)' }}>{d.routedCheap}</span>
          {'  ·  '}
          <span style={{ color: 'var(--color-tier-2-term)' }}>{d.tier} {d.model}</span> · conf {d.conf}{'  ·  '}
          pack: <span style={{ color: 'var(--color-accent-2)' }}>{d.pack}</span>
        </span>
      </div>
      <div style={{ color: dim }}>
        {`   ${d.bar5h} ${d.pct5h}  ·  ${d.bar7d} ${d.pct7d}  ·  ↺ ${d.resetIn}`}
      </div>
      <div style={{ color: dim }}>
        {`   ctx ${d.ctxPct}  ·  ${d.adapterOn ? 'adapter 🔧 active' : 'adapter — baseline · mooter forge install'}  ·  ${d.costTurn} turn  ·  alltime ${d.alltime}`}
      </div>
    </div>
  );
}
