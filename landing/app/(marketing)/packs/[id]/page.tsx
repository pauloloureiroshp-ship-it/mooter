import { readFile } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import Cartucho from '@/components/Cartucho';
import versionInfo from '@/app/version.json';

// DES. 019 — a folha de um pack, na gramática de papel milimétrico fixada a
// 2026-08-27. Era uma folha de CAIXAS: um `<Eyebrow>` rosa por cima do título,
// um `<Card>` com fundo próprio e raio 14 à volta dos modelos, e cada modelo
// dentro da sua própria caixinha com fundo e borda. A regra é o inverso: o que
// separa é a hairline, a anotação vive na MARGEM, e o rosa fica só para o `?`
// do wordmark, para as cotas e para o CTA (aqui, o botão Install).
//
// A conversão é de ROUPA, não de pessoa: as afirmações, os números e os links
// são exactamente os que já cá estavam. O que mudou foi a forma — a metadata
// que era uma tira de texto corrido passa a ficha técnica com uma linha por
// propriedade, e os modelos passam a lista numerada (uma peça, um número), que
// é o que um desenho técnico faz com uma composição.
//
// ── 2026-08-27 — o que saiu desta folha, e porquê. Este registo FICA. ──
//
// Esta página publicava uma barra verde «Savings vs Opus», lida de
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

  // A ficha técnica. É a MESMA metadata que a folha já mostrava numa tira de
  // texto corrido — domínio, VRAM mínima, número de modelos — só que uma
  // propriedade por linha, que é como se lê uma ficha. Nada acrescentado: os
  // três valores saem dos três campos do seed, e `models` é contado.
  const ficha: [string, string][] = [
    ['domain', pack.domain],
    ['min VRAM', `${pack.min_vram_gb} GB`],
    ['models', String(pack.models.length)],
  ];

  return (
    <div style={{ background: 'var(--color-bg)', color: 'var(--color-text)', position: 'relative', overflow: 'hidden' }}>
      {/* A grelha de 8px, faint. Substitui o Dotgrid — a direcção fixada a
          2026-08-27 é papel milimétrico, e um desenho técnico assenta numa
          grelha, não num campo de pontos. */}
      <div className="moo-mm" aria-hidden="true" />

      <div className="m-pad m-pad-y" style={{ padding: '64px 40px 72px', maxWidth: 1280, margin: '0 auto', position: 'relative' }}>
        {/* O cartucho identifica a folha antes de qualquer conteúdo. A revisão
            vem de version.json, escrito pelo version-sync a partir da tag. */}
        <Cartucho o_que="PACK DETAIL" desenho="019" revisao={`v${versionInfo.version}`} data="2026-08-28" />

        <div style={{ paddingTop: 26 }}>
          <Link href="/packs" className="moo-label" style={{ color: 'var(--color-muted)', textDecoration: 'none' }}>
            ← All packs
          </Link>
        </div>

        {/* O ÚNICO momento extremo da folha. Um: o id do pack em corpo de
            título. O `<Eyebrow>` rosa que estava por cima passa a rótulo mono
            faint — o mesmo texto, sem a cor que a regra 5 reserva para o
            wordmark, para as cotas e para o CTA. */}
        <div style={{ padding: '22px 0 0' }}>
          <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Moo Pack</div>
          <h1
            className="moo-h1"
            style={{ margin: '10px 0 0', maxWidth: 980, fontFamily: 'var(--mono)', overflowWrap: 'break-word' }}
          >
            {pack.id}
          </h1>
          <p style={{ color: 'var(--color-muted)', fontSize: 17, maxWidth: 720, lineHeight: 1.55, margin: '16px 0 0' }}>
            {pack.summary}
          </p>
        </div>

        {/* A ficha. A cota da margem é o campo `min_vram_gb` deste pack — o
            mesmo valor que a linha «min VRAM» desenha logo à direita, para que
            margem e conteúdo não possam divergir. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            spec sheet
            <b>{pack.min_vram_gb} GB</b>
            min VRAM declared in the seed
          </div>
          <div>
            <dl style={{ margin: 0, maxWidth: 460 }}>
              {ficha.map(([k, v]) => (
                <div
                  key={k}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'baseline',
                    gap: 16,
                    borderTop: '1px solid var(--color-border)',
                    padding: '10px 0',
                  }}
                >
                  <dt className="moo-label" style={{ color: 'var(--moo-faint)' }}>{k}</dt>
                  <dd
                    className="num"
                    style={{ margin: 0, fontFamily: 'var(--mono)', fontSize: 13.5, textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}
                  >
                    {v}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </div>

        {/* Os modelos. Eram etiquetas com fundo próprio, borda e raio 8 — ou
            seja, caixinhas. Passam a lista de peças: um número de ordem, um
            nome, hairline entre linhas. A cota da margem é `models.length`,
            contado do array que a lista desenha. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            models
            <b>{pack.models.length}</b>
            declared composition, not a measurement
          </div>
          <div>
            {/*
              * Aqui vivia uma `<ProgressBar>` verde sob o título «Savings vs
              * Opus», com o campo do seed em percentagem ao lado. Retirado a
              * 2026-08-27 — ver o cabeçalho desta folha. Não foi substituído por
              * outra percentagem: inventar um número honesto para tapar um
              * desonesto seria repetir o erro com melhor caligrafia.
              *
              * As linhas deste bloco levam `*` de propósito. O portão
              * `design/tools/moo-design-check.mjs` §3 limpa comentários de linha,
              * comentários de bloco numa linha só e linhas começadas por `*` —
              * mas não o MEIO de um comentário JSX. Sem o prefixo, este registo
              * da retirada era contado como o claim que descreve: o portão a
              * acusar a prova em vez do facto.
              */}
            <div className="moo-label" style={{ color: 'var(--moo-faint)' }}>Models</div>
            <ol style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, maxWidth: 460 }}>
              {pack.models.map((m, i) => (
                <li
                  key={m}
                  style={{
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: 12,
                    borderTop: '1px solid var(--color-border)',
                    padding: '9px 0',
                  }}
                >
                  {/* O número da peça no conjunto — posição real na composição
                      declarada, não um adorno. */}
                  <span
                    aria-hidden="true"
                    style={{ fontFamily: 'var(--mono)', fontSize: 10, letterSpacing: '.14em', color: 'var(--moo-faint)', flexShrink: 0 }}
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span
                    className="num"
                    style={{ fontFamily: 'var(--mono)', fontSize: 13.5, minWidth: 0, overflowWrap: 'anywhere' }}
                  >
                    {m}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        {/* A ressalva, e o único sítio rosa da folha. Sem cota: não há aqui
            número honesto para pôr na margem — e a regra é rótulo só, nunca um
            número inventado para encher. */}
        <div className="moo-secao m-stack">
          <div className="moo-marg">
            caveat
            <b>metadata</b>
            declared by the pack — not your number
          </div>
          <div style={{ maxWidth: 640 }}>
            <p style={{ fontSize: 13.5, color: 'var(--color-muted)', lineHeight: 1.65, margin: 0 }}>
              A pack is a bundle of models, skills and scaffolds for one domain — not a promise about your bill.
              This project logs no tokens, so it has no measured cost and publishes no savings
              percentage per pack. Same note as the{' '}
              <Link href="/packs" style={{ color: 'var(--color-muted)', textDecoration: 'underline', textUnderlineOffset: 3 }}>
                pack index
              </Link>
              .
            </p>

            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 20, paddingTop: 18 }}>
              {/* O CTA é um dos três sítios onde o rosa é permitido. */}
              <a
                href="/install"
                style={{
                  display: 'inline-block',
                  background: 'var(--color-accent)',
                  color: '#1A0E0E',
                  fontWeight: 600,
                  fontSize: 13,
                  padding: '11px 20px',
                  borderRadius: 6,
                  textDecoration: 'none',
                }}
              >
                Install this pack →
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
