import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Cartucho from '@/components/Cartucho';
import MonoNum from '@/components/MonoNum';
import versionInfo from '@/app/version.json';
import WorkflowChip from './WorkflowChip';
import WorkflowPipeline from './WorkflowPipeline';

export const metadata: Metadata = {
  title: 'Workflow — live visibility, local & free',
  description:
    'Watch your workflow live. The same idea as Claude Code dynamic workflows, run locally and free. A persistent statusline chip shows every agent, the progress, and the token spend as the run advances.',
};

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

/**
 * Um grupo do desenho — o mesmo da folha 002. Era um `<Card>`: fundo proprio,
 * raio 14 e, num dos casos, um gradiente rosa. A direccao de 2026-08-27 nao tem
 * caixas: o que separa e a hairline, e o rotulo e mono em caixa-alta.
 */
function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  );
}

export default function WorkflowPage() {
  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direccao fixada a
          2026-08-27 e papel milimetrico, e um desenho tecnico assenta numa
          grelha, nao num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />
      <div className="workflow-wrap m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteudo. A revisao
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="WORKFLOW" desenho="008" revisao={`v${versionInfo.version}`} data="2026-08-27" />

        {/* O UNICO momento extremo da folha (regra 10). Um. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            Watch your workflow live.
          </h1>
          <h2 style={{ fontSize: 'clamp(20px, 2.6vw, 28px)', fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, margin: '16px 0 14px', maxWidth: 760 }}>
            Same idea as Claude Code&apos;s dynamic workflows. Local. Free.
          </h2>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: 0 }}>
            A persistent chip in your statusline shows every agent in the run, the progress, and the token spend —
            updating live as the workflow advances.
          </p>
        </div>

        {/* O chip e o oleoduto. A margem e telegrafica: o que a seccao E, o
            numero que a governa, a ressalva. Nunca prosa. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            visibility
            <b>7 agents</b>
            sheet animation — not a real run
          </div>
          <div>
            <div style={{ maxWidth: 560 }}>
              <WorkflowChip />
              <div style={{ marginTop: 8, fontSize: 12, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
                ↑ live · dots advance every 500ms as agents complete
              </div>
            </div>
            <div style={{ marginTop: 32 }}>
              <WorkflowPipeline />
            </div>
          </div>
        </div>

        {/* Mesma forma, duas contas. Eram dois cartoes — um deles com gradiente
            rosa a favor do lado nosso, que e a caixa a fazer o argumento em vez
            do numero. Passam a duas colunas separadas por hairline. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            two bills
            <b>1 run</b>
            local measured · cloud estimated
          </div>
          <div>
            <div className="workflow-cards" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'stretch' }}>
              <Grupo rotulo="Claude Code · dynamic workflows">
                <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)', marginBottom: 16 }}>cloud-run · billed per token</div>
                <WorkflowChip cloud />
                <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>cloud list-price estimate</span>
                  <span className="num" style={{ color: 'var(--color-tier-3)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>$0.45</span>
                </div>
              </Grupo>

              <Grupo rotulo="Mooter Workflow Engine · Wave 28">
                <div style={{ fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)', marginBottom: 16 }}>local-run · shipped 2026-06-07</div>
                <WorkflowChip />
                <div style={{ marginTop: 'auto', paddingTop: 18, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <span className="moo-label" style={{ color: 'var(--moo-faint)' }}>measured local cost</span>
                  <span className="num" style={{ color: 'var(--color-green)', fontSize: 26, fontWeight: 600, fontFamily: 'var(--mono)', fontVariantNumeric: 'tabular-nums' }}>$0.0028</span>
                </div>
              </Grupo>
            </div>

            {/* 2026-08-27 · este parágrafo gritava, em rosa, um «160× gap».
                O «same shape, different bill» continua verdade; o 160× não é uma
                medição de nada. Sai de dividir um número MEDIDO ($0,0028, custo
                real da corrida local) por um ESTIMADO ($0,45, tokens modelados a
                preço de tabela). Um rácio de base mista não é auditável, e a
                decisão de 2026-08-24 proíbe publicar multiplicadores de poupança
                sem tokens medidos — sem excepção para «um rácio, não é uma
                percentagem». A ressalva que estava por baixo («one run, one
                machine») limitava a AMOSTRA e não a ARITMÉTICA, que era o defeito.
                Os dois valores ficam — cada um colado à sua natureza no rótulo do
                cartão — e o leitor faz a divisão que quiser, sabendo o que divide.
                (Revisto com kimi-k2.6 a 2026-08-27, que chegou à mesma conclusão
                de forma independente.) */}
            <p style={{ marginTop: 20, fontSize: 13, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6, maxWidth: 760 }}>
              Same shape, different bill. This run stayed on your machine and cost{' '}
              <MonoNum color="var(--color-green)">$0.0028</MonoNum>, measured. The cloud column is{' '}
              <MonoNum color="var(--color-tier-3)">$0.45</MonoNum> estimated at list price — modelled, not billed.
              We publish no ratio between the two: one is measured and the other is not, and dividing them
              would invent a number. One run, one machine — not a fleet average.
            </p>
          </div>
        </div>
      </div>
      <style>{`@media (max-width: 760px){ .workflow-cards{ grid-template-columns: 1fr !important; } .workflow-wrap{ padding: 48px 20px 56px !important; } }`}</style>
    </div>
  );
}
