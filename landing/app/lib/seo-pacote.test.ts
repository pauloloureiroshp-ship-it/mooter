import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import sitemap from '../sitemap';
import { GET as llmsTxt } from '../llms.txt/route';
import { FAQ } from './doc-facts';
import { faqLd, organizationLd } from './jsonld';
import { ORGANIZATION, PAGES, SITE, urlFor } from './site-pages';

// O pacote do Prisma (14/10) é uma lista LACRADA no pré-registro. Estes testes
// guardam o que a lista promete: as 13 URLs de antes continuam as mesmas, entram
// exactamente 5, o lastmod não é a hora do build, e o IndexNow não envia nada
// sem o sim do Paulo.

const LANDING = resolve(import.meta.dirname, '..', '..');

const EXISTING = [
  '/', '/install', '/commands', '/compare', '/packs', '/under-the-hood', '/cockpit',
  '/security', '/sessions', '/spawn', '/methodology', '/changelog', '/privacy',
];
const NEW = [
  '/vs/claude-code-router', '/vs/litellm', '/guides/cut-claude-code-costs-with-local-models', '/faq', '/about',
];

describe('sitemap', () => {
  const entries = sitemap();

  it('são as 13 URLs de antes, pela mesma ordem, mais exactamente 5 novas', () => {
    expect(entries.map((e) => e.url)).toEqual([...EXISTING, ...NEW].map((p) => `${SITE}${p}`));
  });

  it('lastmod é uma data YYYY-MM-DD real, não a hora do build', () => {
    for (const e of entries) {
      expect(typeof e.lastModified).toBe('string');
      expect(e.lastModified as string).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(new Date(e.lastModified as string).toISOString().slice(0, 10)).toBe(e.lastModified);
    }
  });

  it('é determinístico: duas chamadas dão o mesmo resultado', () => {
    expect(sitemap()).toEqual(entries);
  });

  it('/compare, as novas e só elas têm a data de hoje do pacote', () => {
    const touched = PAGES.filter((p) => p.lastModified === '2026-10-14').map((p) => p.path);
    expect(touched.sort()).toEqual(['/compare', ...NEW].sort());
  });
});

describe('/llms.txt', () => {
  it('é text/plain, não vazio, e lista todas as URLs do sitemap', async () => {
    const res = llmsTxt();
    expect(res.headers.get('content-type')).toMatch(/^text\/plain/);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(200);
    for (const p of PAGES) expect(body).toContain(urlFor(p.path));
  });
});

describe('Organization', () => {
  it('sameAs tem o GitHub e o VS Marketplace, e não a reserva do npm', () => {
    expect(organizationLd['@type']).toBe('Organization');
    expect(ORGANIZATION.sameAs.some((u) => u.startsWith('https://github.com/pauloloureiroshp-ship-it/mooter'))).toBe(true);
    expect(ORGANIZATION.sameAs.some((u) => u.includes('marketplace.visualstudio.com'))).toBe(true);
    expect(ORGANIZATION.sameAs.some((u) => u.includes('npmjs.com'))).toBe(false);
  });
});

describe('FAQ', () => {
  it('o FAQPage espelha as perguntas visíveis, sem respostas vazias', () => {
    const ld = faqLd(FAQ);
    expect(ld['@type']).toBe('FAQPage');
    expect(ld.mainEntity).toHaveLength(FAQ.length);
    for (const q of FAQ) {
      expect(q.q.trim().length).toBeGreaterThan(5);
      expect(q.a.trim().length).toBeGreaterThan(20);
    }
  });

  it('nenhuma resposta promete valor em dólares', () => {
    for (const q of FAQ) expect(q.a).not.toMatch(/\$\s?\d/);
  });
});

describe('páginas novas', () => {
  const loaders: Record<string, () => Promise<{ metadata: { alternates?: { canonical?: string } } }>> = {
    '/vs/claude-code-router': () => import('../(marketing)/vs/claude-code-router/page'),
    '/vs/litellm': () => import('../(marketing)/vs/litellm/page'),
    '/guides/cut-claude-code-costs-with-local-models': () => import('../(marketing)/guides/cut-claude-code-costs-with-local-models/page'),
    '/faq': () => import('../(marketing)/faq/page'),
    '/about': () => import('../(marketing)/about/page'),
  };
  it.each(NEW)('%s declara a si própria como canonical', async (path) => {
    const mod = await loaders[path]();
    expect(mod.metadata.alternates?.canonical).toBe(path);
  });
});

describe('IndexNow', () => {
  const scriptUrl = pathToFileURL(join(LANDING, 'scripts', 'indexnow-ping.mjs')).href;
  const loadScript = async () => (await import(/* @vite-ignore */ scriptUrl)) as {
    findKey: (dir?: string) => string;
    buildPayload: (a: { host?: string; key: string; urls: string[] }) => { keyLocation: string; urlList: string[] };
    urlsFromSitemap: (xml: string) => string[];
  };

  it('a chave pública está na raiz e o corpo é exactamente a chave', async () => {
    const { findKey } = await loadScript();
    const key = findKey();
    expect(key).toMatch(/^[0-9a-f]{32}$/);
    expect(readFileSync(join(LANDING, 'public', `${key}.txt`), 'utf8')).toBe(key);
  });

  it('só existe um ficheiro de chave em public/', () => {
    const files = readdirSync(join(LANDING, 'public')).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(files).toHaveLength(1);
  });

  it('recusa URLs fora do host e listas vazias', async () => {
    const { buildPayload } = await loadScript();
    expect(() => buildPayload({ key: 'k'.repeat(16), urls: ['https://example.com/x'] })).toThrow(/fora de/);
    expect(() => buildPayload({ key: 'k'.repeat(16), urls: [] })).toThrow(/vazia/);
    const ok = buildPayload({ key: 'k'.repeat(16), urls: ['https://mooter.ai/faq'] });
    expect(ok.keyLocation).toBe(`https://mooter.ai/${'k'.repeat(16)}.txt`);
  });

  it('sem --send é dry-run; com --send mas sem o sim, recusa antes de qualquer rede', () => {
    const dir = mkdtempSync(join(tmpdir(), 'indexnow-'));
    const xml = join(dir, 'sitemap.xml');
    writeFileSync(xml, '<urlset><url><loc>https://mooter.ai/faq</loc></url></urlset>');
    const script = join(LANDING, 'scripts', 'indexnow-ping.mjs');
    const env = { ...process.env, INDEXNOW_SIM_DO_PAULO: '', INDEXNOW_ENDPOINT: 'http://127.0.0.1:9/never' };
    const dry = execFileSync('node', [script, '--sitemap', xml], { env, encoding: 'utf8' });
    expect(dry).toContain('DRY-RUN');
    const refused = spawnSync('node', [script, '--sitemap', xml, '--send'], { env, encoding: 'utf8' });
    expect(refused.status).toBe(3);
    const noSource = spawnSync('node', [script], { env, encoding: 'utf8' });
    expect(noSource.status).toBe(2);
  });
});

describe('/setup', () => {
  it('é um redirect permanente (308) para /install, declarado na config', () => {
    const cfg = readFileSync(join(LANDING, 'next.config.ts'), 'utf8');
    expect(cfg).toMatch(/source:\s*'\/setup',\s*destination:\s*'\/install',\s*permanent:\s*true/);
  });
});
