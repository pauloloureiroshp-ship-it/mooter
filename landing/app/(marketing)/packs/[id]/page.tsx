import { readFile } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Eyebrow from '@/components/Eyebrow';
import Card from '@/components/Card';
import ProgressBar from '@/components/ProgressBar';

interface Pack {
  id: string;
  trust: number;
  installs: number;
  min_vram_gb: number;
  domain: string;
  savings_pct: number;
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
        <span className="num" style={{ color: 'var(--color-green)' }}>trust {pack.trust}</span>
        <span className="num" style={{ color: 'var(--color-muted)' }}>{pack.installs} installs</span>
        <span className="num" style={{ color: 'var(--color-muted)' }}>domain: {pack.domain}</span>
        <span className="num" style={{ color: 'var(--color-muted)' }}>min VRAM: {pack.min_vram_gb} GB</span>
      </div>

      <Card padding={26}>
        <div style={{ fontWeight: 600, marginBottom: 12 }}>Savings vs Opus</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ProgressBar pct={pack.savings_pct} color="var(--color-green)" height={14} />
          <span className="num" style={{ width: 56 }}>{pack.savings_pct}%</span>
        </div>
        <div style={{ fontWeight: 600, margin: '20px 0 8px' }}>Models</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {pack.models.map((m) => (
            <span key={m} className="num" style={{ fontSize: 12.5, padding: '5px 10px', borderRadius: 8, background: 'var(--color-surface-2)', border: '1px solid var(--color-border)' }}>{m}</span>
          ))}
        </div>
      </Card>

      <div style={{ marginTop: 24 }}>
        <a href="/install" style={{ background: 'var(--color-accent)', color: '#1A0E0E', fontWeight: 600, padding: '13px 22px', borderRadius: 10 }}>
          Install this pack →
        </a>
      </div>
    </section>
  );
}
