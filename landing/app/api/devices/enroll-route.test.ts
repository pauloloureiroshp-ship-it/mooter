import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Onboarding v2 · W3 — a rota de enrolment.
// A landing corre vitest em node-env sem Next, por isso o que se guarda aqui é
// a MECÂNICA: que RPC é chamado, o que é validado antes de tocar na base de
// dados, e o que a resposta NÃO leva.

const src = readFileSync(join(__dirname, 'enroll', 'route.ts'), 'utf8');

describe('POST /api/devices/enroll (onboarding v2 W3)', () => {
  it('é o ÚNICO sítio que consome o código — usa redeem, não peek', () => {
    // `/i/<token>.mcpb` faz peek. Se as duas consumissem, o download do bundle
    // deixava a pessoa sem código para colar no diálogo.
    expect(src).toContain('enroll_device');
    expect(src).not.toContain('peek_install_token');
  });

  it('valida a forma da chave pública ANTES de tocar na base de dados', () => {
    const antesDoRpc = src.slice(0, src.indexOf('await rpc'));
    expect(antesDoRpc).toContain('PUB_RE.test(device_pub)');
    expect(antesDoRpc).toContain('isValidInstallToken');
  });

  it('um código gasto devolve 410 — a mesma coisa que o cliente já sabe tratar', () => {
    expect(src).toContain("'codigo_expirado_ou_usado'");
    expect(src).toMatch(/status:\s*410/);
  });

  it('a resposta leva SÓ a chave e o id — nunca o user_id nem o perfil', () => {
    const resposta = src.slice(src.lastIndexOf('return NextResponse.json'));
    expect(resposta).toContain('device_key');
    expect(resposta).toContain('device_id');
    expect(resposta).not.toContain('user_id');
    expect(resposta).not.toContain('email');
  });

  it('nada disto é cacheável', () => {
    expect(src).toContain("'Cache-Control': 'private, no-store'");
  });

  it('a migração que falta está escrita, não subentendida', () => {
    // Uma rota que chama um RPC inexistente e não o diz é uma armadilha para
    // quem a ler a seguir.
    expect(src).toContain('MIGRAÇÃO POR APLICAR');
    expect(src).toContain('create function enroll_device');
  });

  it('limites de tamanho em tudo o que vem de fora', () => {
    expect(src).toMatch(/device_id\.length > 64/);
    expect(src).toMatch(/platform\.length > 32/);
  });
});
