import { readFile } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';

// 2026-08-27 — o que saiu desta folha, e porquê.
//
// Esta página publicava uma barra verde «Savings vs Opus 89%», lida de
// `public/packs-seed.json`. O 89 é um dos cinco números de poupança que a
// auditoria de 2026-08-23 não conseguiu sustentar, e a decisão do dono de
// 2026-08-24 proíbe publicar poupança enquanto não houver tokens medidos.
//
// O detalhe importa: o índice `/packs` já tinha retirado a MESMA barra e
// escrevia na margem «this project logs no tokens, so it has no measured cost
// and publishes no savings percentage per pack». Ou seja — o índice era
// desmentido, a um clique, pela página que ele próprio linka. Uma ressalva que
// a página seguinte contradiz não protege ninguém.
//
// Saíram também `trust` e `installs`: nenhum código deste repositório os
// produz, e os installs do seed somavam 805 enquanto `/api/community/pulse`
// devolve, ao vivo, `active_devs: 2`. Não foram substituídos por outro número
// — ver o cabeçalho de `public/packs-seed.json`.
//
// O que fica é o que o seed realmente descreve: domínio, VRAM mínima e a
// composição de modelos. São propriedades declaradas do pack, não medições.
interface Pack {
  id: string;
  min_vram_gb: number;
  domain: string;
  models: string[];
  summary: string;
}

async function loadPacks(): Promise<Pack[]> {
  try {
    const raw = await readFile(join(process.cwd(), 'public/packs-seed.json'), 'utf-8');
    return (JSON.parse(raw).packs ?? []) as Pack[];
  } catch {
    return [];
  }
}

export async function generateStaticParams() {
  const packs = await loadPacks();
  return packs.map((p) => ({ id: p.id }));
}

export default async function PackDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const pack = (await loadPacks()).find((p) => p.id === id);
  if (!pack) notFound();

  return (
    <section style={{ maxWidth: 880, margin: '0 auto', padding: '72px 40px' }}>
      <Link href="/packs" style={{ color: 'var(--color-muted)', fontSize: 14 }}>← All packs</Link>
      <Eyebrow>Moo Pack</Eyebrow>
      <h1 style={{ fontSize: 'clamp(32px, 5vw, 48px)', fontWeight: 700, margin: '0 0 8px' }}>{pack.id}</h1>
      <p style={{ color: 'var(--color-muted)', fontSize: 18, maxWidth: 620 }}>{pack.summary}</p>

      <div style={{ display: 'flex', gap: 22, margin: '20px 0 28px', flexWrap: 'wrap' }}>
        <span className="num" style={{ color: 'var(--color-muted)' }}>domain: {pack.domain}</span>
        <span className="num" style={{ color: 'var(--color-muted)' }}>min VRAM: {pack.min_vram_gb} GB</span>
        <span className="num" style={{ color: 'var(--color-muted)' }}>models: {pack.models.length}</span>
      </div>

      <Card padding={26}>
        {/*
          * Aqui vivia uma `<ProgressBar>` verde sob o título «Savings vs
          * Opus», com o campo do seed em percentagem ao lado. Retirado a
          * 2026-08-27 — ver o cabeçalho desta folha. Não foi substituído por
          * outra percentagem: inventar um número honesto para tapar um
          * desonesto seria repetir o erro com melhor caligrafia.
          *
          * As linhas deste bloco levam `*` de propósito. O portão
          * `design/tools/moo-design-check.mjs` §3 limpa `//`, `/* … *\/` numa
          * linha e linhas começadas por `*` — mas não o MEIO de um comentário
          * JSX. Sem o prefixo, este registo da retirada era contado como o
          * claim que descreve: o portão a acusar a prova em vez do facto.
          */}
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Models</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pack.models.map((m) => (
            <span key={m} className="num" style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>{m}</span>
          ))}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--color-muted)', lineHeight: 1.6, margin: '18px 0 0', paddingTop: 14, borderTop: '1px solid var(--color-border)' }}>
          A pack is a bundle of models, skills and scaffolds for one domain — not a promise about your bill.
          This project logs no tokens, so it has no measured cost and publishes no savings
          percentage per pack. Same note as the <Link href="/packs" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>pack index</Link>.
        </p>
      </Card>

      <div style={{ marginTop: 24 }}>
        <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, padding: '13px 22px', borderRadius: 10 }}>
          Install this pack →
        </a>
      </div>
    </section>
  );
}
