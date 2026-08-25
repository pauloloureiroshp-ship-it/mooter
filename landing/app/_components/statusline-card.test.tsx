/**
 * StatuslineCard.test.tsx — a metrica ausente nao pode ler-se como medida.
 *
 * Achado da triagem de 2026-08-25 (StatuslineCard.tsx:78): o cartao imprimia
 * «routed cheap » com o valor em branco quando `d.routedCheap` vinha falso ou
 * nulo. O tipo diz `string`, mas `data` e `Partial<>` e um `undefined`
 * explicito atravessa o spread — o TypeScript nao apanha isto em runtime, e o
 * resultado saia em VERDE, que e a cor que este projecto usa para "medido".
 */
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StatuslineCard from '../../components/StatuslineCard';

describe('StatuslineCard · routed cheap', () => {
  it('com valor, mostra o numero', () => {
    const html = renderToStaticMarkup(<StatuslineCard data={{ routedCheap: '47%' }} />);
    expect(html).toContain('routed cheap');
    expect(html).toContain('47%');
    expect(html).not.toContain('n/d');
  });

  it('com `undefined` explicito, diz n/d — nunca uma afirmacao em branco', () => {
    const html = renderToStaticMarkup(<StatuslineCard data={{ routedCheap: undefined }} />);
    expect(html).toContain('n/d');
  });

  it('com string vazia, tambem diz n/d', () => {
    const html = renderToStaticMarkup(<StatuslineCard data={{ routedCheap: '   ' }} />);
    expect(html).toContain('n/d');
  });

  it('o n/d nunca sai na cor de "medido"', () => {
    const html = renderToStaticMarkup(<StatuslineCard data={{ routedCheap: undefined }} />);
    const trecho = html.slice(Math.max(0, html.indexOf('n/d') - 200), html.indexOf('n/d'));
    expect(trecho).not.toContain('--color-green');
  });
});
