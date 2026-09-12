import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 PR-H (D7) — dashboard "Savings depth": D7-2 all-Opus comparison is
// real; D7-1 (per-task-type) + D7-3 (misroute) are honest placeholders (no
// fabricated per-category data until the telemetry pipeline ships).
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const DASH = 'app/(app)/dashboard/page.tsx';

describe('Wave 12 PR-H — dashboard savings depth (D7)', () => {
  it('has a Savings depth section with the all-Opus comparison (real, in-scope vars)', () => {
    const s = read(DASH);
    expect(s).toContain('Savings depth');
    expect(s).toContain('all-Opus would cost');
    expect(s).toContain('you actually paid');
  });

  // 2026-08-29 — o sufixo `(est.)` saiu, e este teste seguiu-o em vez de o
  // seguir cegamente. O que ele sempre protegeu foi «esta cifra nao se
  // apresenta como facto medido», e `(est.)` era a versao fraca disso: tres
  // caracteres que nao dizem estimada A PARTIR DE QUE, e que nao apontam para
  // nada melhor. A proveniencia passou a vir de `_modelado.tsx`, que diz que o
  // numero e modelado a partir do COMPRIMENTO DO PROMPT e manda correr `mooter
  // recibo` para o medido. Trocar um teste de rotulo por um teste de mecanismo
  // so vale se o mecanismo for verificavel — por isso isto exige as duas
  // cifras marcadas, e nao a mera presenca do import.
  it('as duas cifras da comparação carregam a proveniência, não um sufixo', () => {
    const s = read(DASH);
    expect(s).toContain("from '../_modelado'");
    for (const rotulo of ['all-Opus would cost', 'you actually paid']) {
      const linha = s.split(/\r?\n/).find((l) => l.includes(`'${rotulo}'`));
      expect(linha, `sem linha para ${rotulo}`).toBeTruthy();
      expect(linha, `${rotulo} perdeu a proveniência`).toMatch(/modelado:\s*true/);
    }
    // E o sufixo velho não pode voltar por cima da marca nova: dois rótulos de
    // proveniência no mesmo número é o que ensina o leitor a ignorar ambos.
    expect(s).not.toContain('you actually paid (est.)');
  });

  it('per-task-type + misroute are honest placeholders (no fabricated numbers)', () => {
    const s = read(DASH);
    expect(s).toContain('Per-task-type savings');
    expect(s).toContain('Misroute report');
    // Wave 14 Day 1 reworded the honesty note to an actionable `mooter trail` CTA.
    expect(s).toMatch(/no fabricated numbers/);
  });
});
