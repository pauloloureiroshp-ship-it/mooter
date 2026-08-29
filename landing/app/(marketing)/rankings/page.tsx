import { readFile } from 'fs/promises';
import { join } from 'path';
import type { Metadata } from 'next';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';
import RankingsExplorer from './RankingsExplorer';

// DES. 009 — os rankings, na gramática de papel milimétrico fixada a
// 2026-08-27. Era a última folha de marketing ainda no vocabulário antigo:
// `<Dotgrid>` (campo de pontos) + `<Eyebrow>` rosa por cima do título + dois
// parágrafos soltos a servir de anotação. A direcção é o inverso: uma grelha de
// 8px, hairline a separar em vez de caixa, e a anotação na MARGEM — mono, 10px,
// caixa-alta, à direita.
//
// O CONTEÚDO não mudou: o título, a lede, o parágrafo de honestidade e o
// explorador são exactamente os que já cá estavam. Isto é uma mudança de roupa.
//
// O que é NOVO são as margens, e por isso são contadas, não escritas: os quatro
// números vêm de `public/rankings-seed.json` — o mesmo ficheiro que o
// `RankingsExplorer` vai buscar no browser — lido aqui em tempo de build. Se o
// seed desaparecer ou mudar de forma, a margem passa a dizer `n/d` em vez de
// repetir um número que deixou de ser verdade. Uma folha cuja tese é «medido ou
// —, nunca inventado» não podia trazer a sua própria anotação escrita à mão.
//
// `RankingsExplorer.tsx` não foi tocado: tem a excepção declarada do portão (a
// única cifra de poupança do projecto, atrás de `seed.savings.measured`), e o
// registo dessa excepção vive em `moo-tokens.json` → `numero.claims_excepcoes`.

export const metadata: Metadata = {
  title: 'Rankings — the field, through mooter\'s routing lens',
  description:
    'Models ranked per task: quality-per-$, the tier mooter routes to, and the two columns a cloud aggregator does not have — local $0 and subscription $0. Measured or "—", never fabricated.',
};

const SECTION_BG = {
  background: 'var(--color-bg)',
  color: 'var(--color-text)',
  position: 'relative' as const,
  overflow: 'hidden' as const,
};

interface Contagem {
  /** `models_total` do seed — as linhas de cada tabela. */
  modelos: number | null;
  /** `categories.length` — as colunas do campo, uma tabela por categoria. */
  categorias: number | null;
  /** modelo × categoria: todas as células que a matriz tem. */
  celulas: number | null;
  /** as que têm `quality.measured` — as que NÃO mostram «—» na coluna Quality. */
  medidas: number | null;
}

const VAZIO: Contagem = { modelos: null, categorias: null, celulas: null, medidas: null };

/**
 * Conta o seed gerado. Nunca estima: em qualquer falha devolve tudo a `null`, e
 * a margem escreve `n/d`. O mesmo padrão de `packs/[id]/page.tsx`, que já lê
 * `public/packs-seed.json` a partir de `process.cwd()`.
 */
async function contarOSeed(): Promise<Contagem> {
  try {
    const raw = await readFile(join(process.cwd(), 'public/rankings-seed.json'), 'utf-8');
    const seed = JSON.parse(raw) as {
      models_total?: number;
      categories?: string[];
      rows?: Record<string, { quality?: { measured?: boolean } }[]>;
    };
    let celulas = 0;
    let medidas = 0;
    for (const linhas of Object.values(seed.rows ?? {})) {
      if (!Array.isArray(linhas)) continue;
      for (const l of linhas) {
        celulas++;
        if (l?.quality?.measured) medidas++;
      }
    }
    return {
      modelos: typeof seed.models_total === 'number' ? seed.models_total : null,
      categorias: Array.isArray(seed.categories) ? seed.categories.length : null,
      celulas: celulas || null,
      medidas: celulas ? medidas : null,
    };
  } catch {
    return VAZIO;
  }
}

export default async function RankingsPage() {
  const c = await contarOSeed();
  const campo = c.modelos !== null && c.categorias !== null ? `${c.modelos} × ${c.categorias}` : 'n/d';
  const cobertura = c.medidas !== null && c.celulas !== null ? `${c.medidas} of ${c.celulas}` : 'n/d';

  return (
    <div style={SECTION_BG}>
      {/* A grelha de 8px, faint. Substitui o `<Dotgrid>`: a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />
      <div className="m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="RANKINGS" desenho="009" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        {/* O ÚNICO momento extremo da folha (regra 10). Um.
            Era um `<Eyebrow>` rosa + um h1 de clamp(34px,5vw,52px); passa ao h1
            da gramática e o eyebrow sai — o cartucho já diz o que é a folha, e a
            faixa rosa duplicava-o em cor que a regra 5 reserva para outra coisa.
            O explorador, mais abaixo, é vivo mas não é extremo: é o instrumento
            desta folha, e desenha-se ao tamanho a que se lê uma tabela. */}
        <div style={{ padding: '48px 0 0' }}>
          <h1 className="moo-h1" style={{ margin: 0, maxWidth: 980 }}>
            Model rankings, per task
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '18px 0 0' }}>
            An aggregator ranks cloud models by price and speed. Mooter ranks them <em>per task</em> — quality-per-dollar,
            the tier we route to, and the two columns nobody else has: <strong style={{ color: 'var(--color-text)' }}>local
            $0</strong> and <strong style={{ color: 'var(--color-text)' }}>subscription $0</strong>.
          </p>
        </div>

        {/* Como se lê a tabela. Era o segundo parágrafo, solto por baixo do
            primeiro; passa a secção com a sua própria margem. O texto é o mesmo,
            palavra por palavra. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            how to read
            <b>{cobertura}</b>
            cells with a measurement · the rest show «—», never a zero
          </div>
          <div>
            <p style={{ color: 'var(--color-muted)', fontSize: 15, maxWidth: 700, lineHeight: 1.6, margin: 0 }}>
              Every number is counted from a cited benchmark or a real price. Where we have no measurement we show{' '}
              <strong style={{ color: 'var(--color-text)' }}>—</strong>, never an invented win. The highlighted row is the{' '}
              router&apos;s own pick for that task — not a marketing choice.
            </p>
          </div>
        </div>

        {/* O explorador. Não foi tocado — ver o cabeçalho desta folha. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            the field
            <b>{campo}</b>
            models × categories, counted from the generated seed
          </div>
          <div>
            <RankingsExplorer />
          </div>
        </div>
      </div>
    </div>
  );
}
