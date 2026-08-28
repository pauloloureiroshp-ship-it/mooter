import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Cartucho from '@/components/Cartucho';
import Btn from '@/components/Btn';
import { TIER_COLORS_WEB } from '@/lib/mooter-event';
import versionInfo from '@/app/version.json';
import InstallCommand from './InstallCommand';

export const metadata: Metadata = {
  title: 'Install mooter — one command',
  description: 'One command. Routing starts on your next prompt. Mooter installs as a Claude Code hook and maps your environment on first run.',
};

// O comando é o objecto que esta folha mede. Fica numa constante para a cota o
// poder contar em vez de alguém escrever o número à mão.
const INSTALL_CMD = 'bash <(curl -fsSL https://mooter.ai/install.sh)';

// Real install.sh flags (landing/public/install.sh, line 16) — no invented flags.
const FLAGS: Array<[string, string]> = [
  ['--dry-run', 'preview every change, write nothing'],
  ['--no-path', "skip the PATH shim in ~/.local/bin"],
  ['--force', 're-run a clean install over an existing one'],
  ['--channel=<name>', 'pin a release channel'],
];

// Transcribed from install.sh header (lines 7-14) — the 7 things it actually does.
const STEPS: string[] = [
  'verify Claude Code + Node 22 (degrades gracefully without Ollama / API key)',
  'copy the routing runtime to ~/.claude/tools/router/',
  'copy the mooter CLI to ~/.mooter/cli/',
  'drop the PATH shim at ~/.local/bin/mooter',
  'write the env file ~/.mooter/env (sourced by your shell)',
  'register hooks in ~/.claude/settings.json (non-destructive merge)',
  'pull qwen2.5:3b (~1.9 GB) for the free local T0 tier, if Ollama is present',
];

// O que a primeira corrida mapeia. Eram três `<Card>` com um emoji cada; a
// direcção de 2026-08-27 não tem caixas nem ícones decorativos — o que numera
// é a ordinal mono, e o que separa é a hairline.
const SONDAS: Array<[string, string]> = [
  ['Hardware probe', 'Detects your GPU, VRAM, and installed Ollama models.'],
  ['Subscription mapping', 'Reads your Anthropic / OpenAI / Google subscription tiers.'],
  ['Pack recommendations', 'Suggests 3 Moo Packs that fit your stack.'],
];

// What the classifier does with four representative prompts. Tiers are the real
// ladder (T0 local → T3 Opus); the floor for destructive prompts is honest.
const SMOKE: Array<[string, string, keyof typeof TIER_COLORS_WEB]> = [
  ['write a commit message for this change', 'T0/T1', 'T0'],
  ['my app crashes when I click submit on mobile', 'T2', 'T2'],
  ['design the multi-tenant auth architecture', 'T3', 'T3'],
  ['rm -rf the production database', 'T3 (floored)', 'T3'],
];

// Mirrors install.sh post-install "Next steps" (lines 389-395) — verbatim commands.
const NEXT: Array<[string, string, string, string]> = [
  ['01', 'Load the env', 'source ~/.mooter/env', 'Or just open a new terminal — routing is live from there.'],
  ['02', 'Verify the install', 'mooter doctor', 'Runs 10 checks against the runtime and your environment.'],
  ['03', 'Launch with routing', 'mooter', 'Opens Claude Code with the hook active on your next prompt.'],
  ['04', 'Uninstall anytime', 'mooter uninstall', 'Removes the shim, runtime and hooks. No residue.'],
];

// A frase das plataformas fica à letra; o número da margem é CONTADO dela, para
// que acrescentar ou tirar uma plataforma mova a cota sozinho.
const PLATAFORMAS_TXT = 'macOS, Linux, and Windows (via bash)';

// ── As cotas da folha ───────────────────────────────────────────────────
// Todos os números que aparecem na margem saem daqui, e todos saem de uma
// contagem do próprio ficheiro. Um número escrito à mão numa margem pode
// dessincronizar-se do conteúdo que anota — que é exactamente a doença que esta
// linguagem existe para não ter.
const N_FLAGS = FLAGS.length;
const N_STEPS = STEPS.length;
const N_SONDAS = SONDAS.length;
const N_SMOKE = SMOKE.length;
const N_PISO = SMOKE.filter(([, rota]) => rota.includes('floored')).length;
const N_NEXT = NEXT.length;
const N_PLATAFORMAS = PLATAFORMAS_TXT.split(',').length;
const CMD_CARACTERES = INSTALL_CMD.length;
const CMD_LINHAS = INSTALL_CMD.split('\n').length;

/**
 * Um grupo do desenho — o mesmo das folhas 002, 005 e 008. Era um `<Card>`:
 * fundo próprio e raio 14, ou seja uma CAIXA, que é o que a direcção de
 * 2026-08-27 tirou da linguagem. O que separa é a hairline; o rótulo é mono em
 * caixa-alta.
 */
function Grupo({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
      <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>{rotulo}</div>
      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', flex: 1 }}>{children}</div>
    </div>
  );
}

/**
 * Uma cota — a linha de medida de um desenho técnico, com marcas nas pontas e a
 * medida ao centro. É um dos três sítios onde a direcção de 2026-08-27 deixa
 * entrar o rosa (os outros dois são o `?` do wordmark e o CTA).
 *
 * Não é um SVG porque a medida tem de acompanhar a largura real do comando em
 * qualquer ecrã; um viewBox fixo esticava as marcas das pontas.
 */
function Cota({ children }: { children: ReactNode }) {
  const marca = { width: 1, height: 9, background: 'var(--color-accent)', flexShrink: 0 };
  const linha = { flex: 1, height: 1, background: 'var(--color-accent)' };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
      <span style={marca} />
      <span style={linha} />
      <span style={{ fontFamily: 'var(--mono)', fontSize: 9, letterSpacing: '0.1em', color: 'var(--color-accent)', whiteSpace: 'nowrap' }}>
        {children}
      </span>
      <span style={linha} />
      <span style={marca} />
    </div>
  );
}

/** Uma ordinal mono na goteira esquerda — o que numera um passo num desenho. */
function Ordinal({ children }: { children: ReactNode }) {
  return (
    <span style={{ fontFamily: 'var(--mono)', fontSize: 11, letterSpacing: '0.1em', color: 'var(--moo-faint)', fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  );
}

export default function InstallPage() {
  return (
    <div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', position: 'relative', overflow: 'hidden' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      <div className="install-wrap m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteúdo — e substitui
            o `<Eyebrow>` rosa mais a pílula da versão, que diziam a mesma coisa
            em dois sítios. A revisão vem de version.json, escrito pelo
            version-sync a partir da tag. */}
        <Cartucho o_que="INSTALL" desenho="012" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O ÚNICO momento extremo da folha (regra 10). Um. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            One command. Routing starts on your next prompt.
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '18px 0 0' }}>
            No proxy, no config files. Mooter installs as a Claude Code hook and maps your environment on first run.
            It probes your machine, registers the hook, and pulls the local models your hardware can run.
          </p>
        </div>

        {/* O comando, dimensionado. Era uma caixa: fundo próprio, contorno rosa e
            raio 12 — a caixa a fazer o argumento em vez do comando. Passa a duas
            hairlines e a uma cota, que é a forma que um desenho técnico tem de
            dizer «isto mede isto». O rosa fica na cota e no botão de copiar (o
            CTA da folha) — os dois sítios que a regra 5 permite. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            command
            <b>{CMD_LINHAS} line</b>
            {N_FLAGS} flags · safe to re-run
          </div>
          <div>
            <InstallCommand command={INSTALL_CMD} />
            <Cota>{CMD_CARACTERES} CAR · {CMD_LINHAS} LINHA</Cota>

            {/* As bandeiras eram quatro palavras soltas com a descrição escondida
                num `title=` — invisível no telemóvel e para um leitor de ecrã.
                Passam a legenda: bandeira à esquerda, o que faz à direita. */}
            <div style={{ marginTop: 32 }}>
              <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>flags</div>
              <div style={{ marginTop: 8 }}>
                {FLAGS.map(([flag, desc]) => (
                  <div
                    key={flag}
                    className="install-legenda"
                    style={{ display: 'grid', gridTemplateColumns: '190px 1fr', gap: 16, padding: '9px 0', borderTop: '1px solid var(--color-border)', alignItems: 'baseline' }}
                  >
                    <code style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-text)', minWidth: 0, overflowWrap: 'anywhere' }}>{flag}</code>
                    <span style={{ fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.5, minWidth: 0 }}>{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* O que o instalador faz, e o que a primeira corrida mapeia. Eram um
            `<Card>` e três `<Card>` com emoji; passam a dois grupos separados
            por hairline. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            the installer
            <b>{N_STEPS} steps</b>
            {N_SONDAS} probes on the first run
          </div>
          <div className="install-2col" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, alignItems: 'start' }}>
            <Grupo rotulo="what the installer does">
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {STEPS.map((s, i) => (
                  <li
                    key={s}
                    style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)', alignItems: 'baseline' }}
                  >
                    <Ordinal>{String(i + 1).padStart(2, '0')}</Ordinal>
                    <span style={{ fontSize: 13.5, lineHeight: 1.5, color: 'var(--color-text)', minWidth: 0 }}>{s}</span>
                  </li>
                ))}
              </ol>
              <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
                Safe to re-run. <span style={{ color: 'var(--color-text)' }}>--dry-run</span> previews every change before it touches your machine.
              </p>
            </Grupo>

            <Grupo rotulo="what the first run maps">
              {SONDAS.map(([title, body], i) => (
                <div
                  key={title}
                  style={{ display: 'grid', gridTemplateColumns: '30px 1fr', gap: 12, padding: '9px 0', borderTop: i === 0 ? 'none' : '1px solid var(--color-border)', alignItems: 'baseline' }}
                >
                  <Ordinal>{String(i + 1).padStart(2, '0')}</Ordinal>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
                    <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.5 }}>{body}</p>
                  </div>
                </div>
              ))}
            </Grupo>
          </div>
        </div>

        {/* O teste de fumo. Era um `<TerminalCard>` — o painel escuro era a maior
            caixa da folha, e o que mostra não é uma transcrição de terminal: é
            uma tabela de prompt → tier. Passa a tabela, com hairlines. A cor
            continua a ser a do TIER (dado), nunca o rosa. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            proof
            <b>{N_SMOKE} of {N_SMOKE}</b>
            {N_PISO} with a forced floor
          </div>
          <div>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>classify.js · smoke test</div>
            <div style={{ marginTop: 10 }}>
              {SMOKE.map(([prompt, rota, tier]) => (
                <div
                  key={prompt}
                  className="install-smoke"
                  style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: 16, padding: '11px 0', borderTop: '1px solid var(--color-border)', alignItems: 'baseline' }}
                >
                  <span style={{ fontFamily: 'var(--mono)', fontSize: 13, color: 'var(--color-text)', minWidth: 0, overflowWrap: 'anywhere', lineHeight: 1.5 }}>
                    <span style={{ color: 'var(--color-muted)' }}>&ldquo;</span>{prompt}<span style={{ color: 'var(--color-muted)' }}>&rdquo;</span>
                  </span>
                  <span className="install-smoke-rota" style={{ fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color: TIER_COLORS_WEB[tier], textAlign: 'right', whiteSpace: 'nowrap' }}>
                    → {rota}
                  </span>
                </div>
              ))}
            </div>
            <p style={{ marginTop: 16, fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6, maxWidth: 760 }}>
              Destructive prompts are floored at T3 — the classifier never downgrades a deploy or a delete.
            </p>
          </div>
        </div>

        {/* Os primeiros cinco minutos. Eram quatro `<Card>` com o comando dentro
            de um rectângulo escuro com contorno e raio 6 — caixa dentro de
            caixa. Passam a quatro linhas de tabela. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            getting started
            <b>{N_NEXT} steps</b>
            commands verbatim from the installer
          </div>
          <div>
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>your first five minutes</div>
            <div style={{ marginTop: 10 }}>
              {NEXT.map(([n, title, cmd, desc]) => (
                <div
                  key={n}
                  className="install-next"
                  style={{ display: 'grid', gridTemplateColumns: '34px 200px 1fr', gap: 16, padding: '12px 0', borderTop: '1px solid var(--color-border)', alignItems: 'baseline' }}
                >
                  <Ordinal>{n}</Ordinal>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>{title}</div>
                    <code style={{ display: 'block', marginTop: 4, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--color-text)', overflowX: 'auto', whiteSpace: 'nowrap' }}>{cmd}</code>
                  </div>
                  <span style={{ fontSize: 13, color: 'var(--color-muted)', lineHeight: 1.55, minWidth: 0 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* A seguir. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            next
            <b>{N_PLATAFORMAS} platforms</b>
            telemetry off by default
          </div>
          <div>
            <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
              <Btn href="/commands" size="lg">See the /mooter commands →</Btn>
              <span style={{ fontSize: 12.5, color: 'var(--color-muted)', fontFamily: 'var(--mono)', lineHeight: 1.6 }}>
                Runs on {PLATAFORMAS_TXT}. Telemetry stays off unless you run /mooter share.
              </span>
            </div>

            <div style={{ marginTop: 32, color: 'var(--color-muted)', fontFamily: 'var(--mono)', fontSize: 14, lineHeight: 1.7 }}>
              $ claude <span style={{ color: 'var(--color-text)' }}>&ldquo;rename this variable&rdquo;</span>
              <div>↳ mooter routed to <span style={{ color: 'var(--color-green)' }}>T0 local</span> · saved this call</div>
              <div style={{ marginTop: 8, fontStyle: 'italic', fontSize: 12 }}>
                *illustrative — mooter runs entirely in your terminal after install; no sign-in required.
              </div>
            </div>

            <p style={{ marginTop: 24, fontSize: 12, color: 'var(--color-muted)' }}>
              Community project · not affiliated with Anthropic.
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px){
          .install-wrap{ padding: 48px 20px 56px !important; }
          .install-2col{ grid-template-columns: 1fr !important; gap: 24px !important; }
          .install-legenda{ grid-template-columns: 1fr !important; gap: 2px !important; }
          .install-smoke{ grid-template-columns: 1fr !important; gap: 2px !important; }
          .install-smoke-rota{ text-align: left !important; }
          .install-next{ grid-template-columns: 34px 1fr !important; gap: 8px 12px !important; }
          .install-next > :last-child{ grid-column: 2 !important; }
        }
      `}</style>
    </div>
  );
}
