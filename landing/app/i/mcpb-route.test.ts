import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Onboarding v2 · W2 — o `.mcpb` servido em `/i/<token>.mcpb`.
// A landing corre vitest em node-env sem Next: o que se pode guardar aqui, e o
// que interessa guardar, e a MECANICA — que RPC e chamado, e que cabecalhos
// saem. As duas coisas que este teste protege ja foram defeitos noutros sitios.

const src = readFileSync(join(__dirname, '[token]', 'route.ts'), 'utf8');

describe('/i/<token>.mcpb (onboarding v2 W2)', () => {
  it('o download do bundle faz PEEK, nunca REDEEM', () => {
    // Se o download consumisse o codigo de uso unico, a pessoa ficava com o
    // ficheiro e sem codigo para colar — e o erro aparecia no passo seguinte,
    // longe da causa.
    const bloco = src.slice(src.indexOf('async function serveMcpb'), src.indexOf('export async function GET'));
    expect(bloco).toContain('peek_install_token');
    expect(bloco).not.toContain('redeem_install_token');
  });

  it('o caminho do script continua a fazer REDEEM (nao foi trocado por engano)', () => {
    const bloco = src.slice(src.indexOf('export async function GET'));
    expect(bloco).toContain('redeem_install_token');
  });

  it('o sufixo .mcpb e tirado antes de validar o codigo', () => {
    expect(src).toMatch(/token\.endsWith\('\.mcpb'\)/);
    expect(src).toMatch(/token\.slice\(0, -'\.mcpb'\.length\)/);
  });

  it('sai como ficheiro, com nome, e nao como texto', () => {
    expect(src).toContain('application/octet-stream');
    expect(src).toContain('attachment; filename="mooter.mcpb"');
  });

  it('um codigo gasto devolve 410 com pista, nao um 500', () => {
    expect(src).toContain("'expired_or_used'");
    expect(src).toMatch(/status:\s*410/);
  });

  it('a origem em baixo devolve 502 — nunca um bundle vazio', () => {
    // Um corpo vazio com 200 instala-se e falha depois, sem explicacao.
    expect(src).toContain("'origem_indisponivel'");
    expect(src).toContain("'bundle_nao_publicado'");
  });

  it('a rota nao promete personalizacao que nao existe (ADR D3.1)', () => {
    expect(src).toContain('IGUAL para toda a gente');
    expect(src).not.toContain('generateManifest');
  });
});
