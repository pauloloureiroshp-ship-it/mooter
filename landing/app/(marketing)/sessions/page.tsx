import Cartucho from '@/components/Cartucho';
import Btn from '@/components/Btn';
import versionInfo from '@/app/version.json';

// Wave 60 — design-mock parity for the sessions page (SessionsArtboard).
// HONESTY NOTE: the mock framed this as "coming soon", but `mooter sessions`
// (watch / quota / handoff + 9 subcommands) actually ships in packages/cli today
// (SYNC.md, packages/cli/src/commands/sessions.ts). Reverting to "coming soon"
// would be a false claim, so we keep the honest "live in the CLI" framing and
// the real command descriptions from the prior page — only the *web* board is
// still terminal-first. Numbers are descriptive, none fabricated.
//
// 2026-08-28 · a folha passa para a gramatica de Papel Milimetrico (DES. 016).
// Saiu o `<Dotgrid>` (campo de pontos) pela grelha de 8px, saiu o `<Eyebrow>`
// rosa — que o cartucho substitui, como em DES. 003 e DES. 005 — e saiu a caixa
// do chip de estado. O CONTEUDO nao mudou: as tres descricoes, a frase de estado
// e o rodape estao palavra por palavra como estavam.

const BULLETS: { cmd: string; text: string }[] = [
  {
    cmd: 'mooter sessions watch',
    text: 'Live cross-session board: age, prompts, tier mix, ~saved, branch, and the active workflow — every Claude Code session discovered from local transcripts.',
  },
  {
    cmd: 'mooter sessions quota',
    text: 'An honest 5-hour usage forecast — a local rate projection, not a server quota, so it never pretends to know Anthropic limits it cannot see.',
  },
  {
    cmd: 'mooter sessions handoff <id>',
    text: 'A context summary so another session can pick up the thread. No prompt text leaves the machine.',
  },
];

// Os numeros da margem sao CONTADOS da tabela acima, nunca escritos a mao — a
// mesma disciplina de DES. 005. Acrescentar um comando muda a cota sozinho; uma
// cota que se possa dessincronizar do conteudo e exactamente o defeito que esta
// linguagem existe para nao ter.
const N_COMANDOS = BULLETS.length;
const VERBOS = BULLETS.map((b) => b.cmd.split(' ')[2]).join(' · ');

export default function SessionsPage() {
  return (
    <div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', position: 'relative', overflow: 'hidden', minHeight: '78vh' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direccao fixada a
          2026-08-27 e papel milimetrico, e um desenho tecnico assenta numa
          grelha, nao num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      <div className="sessions-wrap m-pad m-pad-y" style={{ position: 'relative', padding: '64px 40px 72px', maxWidth: 1080, margin: '0 auto' }}>
        {/* O cartucho identifica a folha antes de qualquer conteudo — e substitui
            o `<Eyebrow>` rosa que dizia a mesma coisa por baixo. A revisao vem de
            version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="AS SESSOES" desenho="016" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O UNICO momento extremo da folha (regra 4). Um. O ponto vivo do
            estado, mais abaixo, desce a anotacao de 7px — indicador de estado
            num desenho, nao um segundo momento a disputar o mesmo ecra. */}
        <div style={{ position: 'relative', padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: '0 0 14px', maxWidth: 880 }}>
            Every session, one screen.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, lineHeight: 1.6, maxWidth: 700, margin: 0 }}>
            If you run Claude Code seriously, you have three or four sessions open and they are blind to
            each other. Mooter discovers them all from the local transcripts and gives the routing
            intelligence a cross-session view — so routing advice reflects everything you do, not just
            this terminal.
          </p>
        </div>

        {/* Os comandos. Era uma lista com o indice em ROSA — o rosa esta reservado
            ao `?` do wordmark, as linhas de cota e ao CTA — e o comando dentro de
            um `<code>` com fundo e raio, ou seja uma caixinha por linha. Passa a
            lista de pecas: numero mono faint, designacao, descricao, hairline a
            separar. A margem e telegrafica: o que a seccao E, o numero que a
            governa, a ressalva. Nunca prosa. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            commands
            <b>{N_COMANDOS} commands</b>
            {VERBOS}
          </div>
          <div>
            {BULLETS.map((b, i) => (
              <div
                key={b.cmd}
                className="ses-linha"
                style={{ display: 'grid', gridTemplateColumns: '32px 236px 1fr', gap: 16, padding: '13px 0', borderTop: '1px solid var(--color-border)', alignItems: 'baseline' }}
              >
                <span className="moo-label" aria-hidden="true" style={{ color: 'var(--moo-faint)' }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <code style={{ fontFamily: 'var(--mono)', fontSize: 13.5, color: 'var(--color-text)' }}>{b.cmd}</code>
                <span style={{ fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.55 }}>{b.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* O estado. Era um chip: fundo proprio, borda e raio 12 — uma caixa a
            dar enfase ao que ja e a frase mais importante da folha. Fica a mesma
            frase, palavra por palavra, sobre uma hairline. O ponto continua a
            pulsar (`.moo-pulso`, da familia de movimento de moo-ui.css: so
            opacidade, e a guarda de prefers-reduced-motion e global no ficheiro
            gerado). */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            status
            <b>live in the CLI</b>
            the web board is terminal-first
          </div>
          <div>
            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 16, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span
                className="moo-pulso"
                aria-hidden="true"
                style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--color-green)', flexShrink: 0 }}
              />
              <span style={{ fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-muted)' }}>
                live in the CLI today · web board <span style={{ color: 'var(--color-text)' }}>terminal-first for now</span>
              </span>
            </div>
          </div>
        </div>

        {/* O rodape. Mesmo botao, mesma linha de licenca — so deixam de flutuar
            soltos no fim da folha e passam a ter margem como todas as seccoes. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            license
            <b>MIT</b>
            open source · v{versionInfo.version}
          </div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <Btn href="/" variant="secondary" size="md">
              ← Back home
            </Btn>
            <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)' }}>
              open source · MIT · v{versionInfo.version}
            </span>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px){
          .sessions-wrap{ padding: 48px 20px 56px !important; }
          .ses-linha{ grid-template-columns: 1fr !important; gap: 4px !important; }
        }
      `}</style>
    </div>
  );
}
