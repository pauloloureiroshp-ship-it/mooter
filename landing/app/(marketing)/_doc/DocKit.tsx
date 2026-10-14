import type { CSSProperties, ReactNode } from 'react';
import Link from 'next/link';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';
import type { QA } from '@/app/lib/jsonld';

// DocKit — as peças das páginas de resposta (/vs/*, /guides/*, /faq, /about).
//
// Mesma gramática de papel milimétrico das folhas existentes: cartucho no topo,
// um h1, secções com margem telegráfica (`moo-secao` / `moo-marg`), hairlines em
// vez de caixas. Nada aqui define cor, raio ou curva: tudo vem dos tokens, que é
// o que o portão `moo-design-check` verifica.

const MUTED = 'var(--color-muted)';
const LINK: CSSProperties = { color: 'var(--color-text)', textDecoration: 'underline', textUnderlineOffset: 3 };

export const P: CSSProperties = { color: MUTED, fontSize: 15, lineHeight: 1.7, margin: '0 0 14px' };

export function Ext({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" style={LINK}>
      {children}
    </a>
  );
}

export function Int({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} style={LINK}>
      {children}
    </Link>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code style={{ fontFamily: 'var(--mono)', color: 'var(--color-text)', fontSize: '0.92em' }}>{children}</code>;
}

export function Pre({ children }: { children: string }) {
  return (
    <div
      style={{
        fontFamily: 'var(--mono)',
        fontSize: 13.5,
        color: 'var(--color-term-fg)',
        background: 'var(--color-term-bg)',
        border: '1px solid var(--color-term-border)',
        borderRadius: 8,
        padding: '14px 16px',
        whiteSpace: 'pre',
        overflowX: 'auto',
        margin: '0 0 14px',
      }}
    >
      {children}
    </div>
  );
}

export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul style={{ ...P, paddingLeft: 20, listStyle: 'disc' }}>
      {items.map((it, i) => (
        <li key={i} style={{ marginBottom: 8 }}>
          {it}
        </li>
      ))}
    </ul>
  );
}

/** A folha: cartucho, h1 e a resposta nas duas primeiras linhas. */
export function DocPage({
  sheet,
  desenho,
  date,
  h1,
  lede,
  children,
}: {
  sheet: string;
  desenho: string;
  date: string;
  h1: string;
  lede: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="m-pad m-pad-y" style={{ position: 'relative', maxWidth: 1180, margin: '0 auto', padding: '72px 40px' }}>
      <div className="moo-mm" aria-hidden="true" />
      <Cartucho o_que={sheet} desenho={desenho} revisao={`v${versionInfo.version}`} data={date} />
      <div style={{ position: 'relative', padding: '48px 0 0' }}>
        <h1 className="moo-h1" style={{ margin: '0 0 14px', maxWidth: 980 }}>
          {h1}
        </h1>
        <p style={{ color: MUTED, fontSize: 17, maxWidth: 760, lineHeight: 1.55, margin: 0 }}>{lede}</p>
      </div>
      {children}
    </section>
  );
}

/** Uma secção com a margem telegráfica à esquerda. */
export function Sec({
  marg,
  value,
  note,
  title,
  children,
}: {
  marg: string;
  value: string;
  note: string;
  title?: string;
  children: ReactNode;
}) {
  return (
    <div className="moo-secao m-stack">
      <div className="moo-marg">
        {marg}
        <b>{value}</b>
        {note}
      </div>
      <div style={{ maxWidth: 820, minWidth: 0 }}>
        {title ? (
          <h2 style={{ fontFamily: 'var(--font-sans)', fontSize: 24, fontWeight: 600, letterSpacing: '-0.02em', margin: '0 0 14px' }}>
            {title}
          </h2>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/** Tabela de factos: a primeira coluna é o tema, as outras são as ferramentas. */
export function FactTable({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="m-scroll-x" style={{ overflowX: 'auto', borderTop: '1px solid var(--moo-line-strong, var(--color-border-light))' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13.5, minWidth: 720 }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th
                key={i}
                scope="col"
                style={{
                  textAlign: 'left',
                  padding: '14px 12px',
                  fontFamily: 'var(--mono)',
                  fontSize: 11,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  fontWeight: i === 1 ? 600 : 500,
                  color: i === 1 ? 'var(--color-text)' : 'var(--moo-faint)',
                  borderBottom: '1px solid var(--color-border-light)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ borderTop: '1px solid var(--color-border)' }}>
              {row.map((cell, ci) =>
                ci === 0 ? (
                  <th key={ci} scope="row" style={{ padding: '12px', textAlign: 'left', verticalAlign: 'top', fontWeight: 600, color: 'var(--color-text)', width: '18%' }}>
                    {cell}
                  </th>
                ) : (
                  <td key={ci} style={{ padding: '12px', verticalAlign: 'top', lineHeight: 1.55, color: MUTED }}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Perguntas e respostas visíveis — as mesmas strings que vão para o FAQPage. */
export function FaqList({ items, links }: { items: QA[]; links?: Record<string, ReactNode> }) {
  return (
    <div>
      {items.map((it) => (
        <div key={it.q} style={{ borderTop: '1px solid var(--color-border)', padding: '14px 0 4px' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, margin: '0 0 6px', color: 'var(--color-text)' }}>{it.q}</h3>
          <p style={{ ...P, margin: '0 0 10px' }}>
            {it.a}
            {links?.[it.q] ? <> {links[it.q]}</> : null}
          </p>
        </div>
      ))}
    </div>
  );
}
