import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { M } from '../lib/canonical-metrics';

// Wave 11 PR-A — honest hero copy (D1-1) + OAuth-error banner (D2-4).
const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('Wave 11 PR-A landing', () => {
  it('D1-1 hero drops banned "Same results", uses honest real numbers, cites the benchmark', () => {
    // Wave 33.7 — the old "up to 90% less cost on T0-heavy sessions" claim was
    // replaced with the author's real measured number (47% across 658 calls),
    // transparently caveated as one machine, not a community average. The
    // "Same results" over-claim stays banned.
    const src = read('app/page.tsx');
    expect(src).not.toContain('Same results');
    expect(src).not.toContain('up to 90% less cost');
    // 2026-08-23 — este teste exigia `M.savedPct === '47%'` sob o comentario
    // "the canonical value is still the honest 47%". Nao era honesto: os 47%
    // derivavam de tres literais que nenhum script regenerava, e uma auditoria
    // encontrou CINCO numeros de poupanca a contradizerem-se no mesmo projecto.
    //
    // Fixar o valor era o defeito. O que se testa agora e a REGRA que sobreviveu:
    // esta pagina nao publica poupanca, porque nao ha custo medido de que a
    // derivar (zero ficheiros de telemetria registam tokens).
    expect(src).toContain('canonical-metrics');
    expect(src).not.toMatch(/saved vs all-Opus/);
    expect(src).not.toMatch(/\d+% saved/);
    // O que a pagina DEVE dizer: o que foi medido, com o seu denominador.
    expect(src).toContain('classified prompts');
    expect(M.recomendadoBarato).toMatch(/^\d+\/\d+$/);
    // E a ressalva viaja com o numero, sempre.
    expect(M.ressalva).toMatch(/no tokens|não há valor|nao ha valor/i);
    expect(src).toContain('href="/methodology"');
  });

  it('banned "Same results" claim is absent from the OG image + PWA manifest', () => {
    // Wave 60 — the honesty guard previously only covered the hero; the banned
    // over-claim was still live in the social card + install metadata. Keep both
    // honest ("comparable quality on routine tasks") so it can't regress.
    expect(read('app/api/og/route.tsx')).not.toContain('Same results');
    expect(read('app/manifest.ts')).not.toContain('Same results');
    // pilar/site — the SEO <meta description> in layout.tsx is seen by Google and
    // was previously ungated; it carried the banned "same results" over-claim.
    const layout = read('app/layout.tsx');
    expect(layout).not.toContain('same results');
    expect(layout).not.toContain('Same results');
  });

  // Wave 60 estendeu a guarda da FRASE ao cartao social e ao manifesto. O NUMERO
  // ficou de fora, e foi por ai que a landing passou meses a publicar tres
  // percentagens de poupanca diferentes: 47% em canonical-metrics.ts, 89% em
  // components/StatuslineCard.tsx e 90.2% cravado como default em
  // app/api/og/route.tsx. Os dois sitios que derivaram sao exactamente os dois
  // que este ficheiro nunca olhou — um por estar fora de `app/`, o outro por so
  // ser verificado para a frase banida.
  //
  // Esta guarda deixa de nomear ficheiros: varre a arvore. Uma regra que so
  // vale onde o teste ja mordeu nao e uma regra, e uma cicatriz.
  it('nenhum ficheiro da landing publica uma percentagem de poupanca cravada', () => {
    const SAVING_LITERAL = /(saved|savings|poupanc)[A-Za-z]*\s*[:=]\s*['"`]\s*\d+(?:[.,]\d+)?\s*%/i;
    const raiz = join(__dirname, '..', '..');
    const ignorar = new Set(['node_modules', '.next', 'dist', 'coverage', '.git']);
    const ficheiros: string[] = [];
    const andar = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (ignorar.has(e.name)) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) andar(p);
        else if (/\.(tsx?|jsx?)$/.test(e.name) && !/\.test\./.test(e.name)) ficheiros.push(p);
      }
    };
    andar(join(raiz, 'app'));
    andar(join(raiz, 'components'));

    // Linha a linha, e as de comentario nao contam. Duas razoes, ambas medidas:
    //
    //  · SEM EXCEPCAO NENHUMA. A primeira versao desta guarda perdoava qualquer
    //    ficheiro que MENCIONASSE `canonical-metrics`, com a ideia de que quem
    //    deriva pode ter uma amostra ao lado. Verificado a mao: bastava um
    //    COMENTARIO com essas palavras para desarmar a guarda por completo — o
    //    literal '89%' voltava ao StatuslineCard e a suite passava a verde.
    //    Uma guarda que se desliga com um comentario nao e uma guarda.
    //    E a excepcao nem era precisa: `canonical-metrics.ts` DERIVA `savedPct`
    //    como numero calculado, nao tem literal nenhum para perdoar.
    //  · E OS COMENTARIOS NAO SAO PUBLICACAO. Sem os saltar, este proprio
    //    ficheiro — que precisa de escrever o defeito para o explicar — seria o
    //    primeiro infractor.
    const infractores = ficheiros.filter((p) => readFileSync(p, 'utf8')
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l))
      .some((l) => SAVING_LITERAL.test(l)))
      .map((p) => p.slice(raiz.length + 1));

    expect(infractores).toEqual([]);
  });

  it('D2-4 homepage surfaces an auth-error banner', () => {
    const page = read('app/page.tsx');
    expect(page).toContain('<AuthErrorBanner />');
    const banner = read('app/_components/AuthErrorBanner.tsx');
    expect(banner).toContain("get('auth') === 'error'");
    expect(banner).toContain('No account was created');
  });
});
