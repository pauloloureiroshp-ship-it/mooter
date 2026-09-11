import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Wave 12 PR-H (D7) — dashboard "Savings depth": D7-2 all-Opus comparison is
// real; D7-1 (per-task-type) + D7-3 (misroute) are honest placeholders (no
// fabricated per-category data until the telemetry pipeline ships).
const read = (p: string) => readFileSync(join(__dirname, '..', '..', p), 'utf8');
const DASH = 'app/(app)/dashboard/page.tsx';

describe('Wave 12 PR-H — dashboard savings depth (D7), retired by onboarding v2 W0', () => {
  // 2026-09-10 — this suite used to REQUIRE the "Savings depth" card and its
  // all-Opus comparison. The card is gone: all four of its figures came from
  // `decisions x $0.015`, a list price nobody paid, and the owner decision of
  // 2026-08-24 (ADR-onboarding-v2, R2) bans a savings number without tokens
  // measured on both sides. A test that demands the removed thing back is not
  // a guard, it is a ratchet in the wrong direction — so it is inverted here
  // and the honest successor lives in app/(app)/dashboard/kpis.test.ts.
  it('the Savings depth card and its all-Opus comparison are gone', () => {
    const s = read(DASH);
    expect(s).not.toContain('Savings depth');
    expect(s).not.toContain('all-Opus would cost');
    expect(s).not.toContain('you actually paid');
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
  // O que este teste sempre protegeu foi «esta cifra nao se apresenta como
  // facto medido». A forma mais forte disso deixou de ser marcar a cifra: e
  // nao ter cifra nenhuma. O que fica guardado e que nenhum simbolo de dolar
  // volta a aparecer como resultado de routing nesta pagina.
  it('nenhuma cifra de poupanca volta a aparecer na pagina', () => {
    const s = read(DASH);
    expect(s).not.toContain('modelado: true');
    expect(s).not.toMatch(/savingsUsd\.toFixed/);
    expect(s).not.toMatch(/naiveCost/);
  });

  it('per-task-type + misroute are honest placeholders (no fabricated numbers)', () => {
    const s = read(DASH);
    expect(s).toContain('Per-task-type savings');
    expect(s).toContain('Misroute report');
    // Wave 14 Day 1 reworded the honesty note to an actionable `mooter trail` CTA.
    expect(s).toMatch(/no fabricated numbers/);
  });
});
