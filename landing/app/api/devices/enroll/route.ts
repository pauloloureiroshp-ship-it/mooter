import { NextRequest, NextResponse } from 'next/server';
import { rpc } from '../../../lib/supabase';
import { isValidInstallToken } from '../../../lib/install-script';

// Onboarding v2 · W3 — POST /api/devices/enroll
//
// A troca da D3: o **código de bootstrap de uso único (24 h)** morre aqui, e
// nasce uma **chave deste device** — escopada, revogável, guardada no cliente
// com 0600.
//
// PORQUE A TROCA É O PONTO TODO. O código de bootstrap é um portador: quem o
// tiver, é o utilizador. Isso é aceitável uma vez e durante 24 h; não é
// aceitável para sempre. Depois da troca, a credencial que fica no disco vale
// só para este device, pode ser revogada sozinha (estado A9), e quem a roubar
// não consegue enrolar outro device com ela.
//
// ESTA ROTA É O ÚNICO SÍTIO QUE CONSOME O CÓDIGO — usa `redeem_install_token`,
// ao contrário de `/i/<token>.mcpb`, que faz `peek`. Se as duas consumissem, o
// download do bundle deixaria a pessoa sem código para colar.
//
// ⚠️ MIGRAÇÃO POR APLICAR — esta rota ainda não funciona em produção.
// Falta a função `enroll_device` no Supabase. Está por escrever de propósito:
// aplicar uma migração é uma acção irreversível numa base de dados com dados
// reais, e essa é uma decisão do dono, não do executor. O contrato que a rota
// espera está escrito abaixo, para a migração ser escrita contra ele em vez de
// ser adivinhada.
//
//   create function enroll_device(
//     p_token       text,   -- código de bootstrap, uso único, 24 h
//     p_device_pub  text,   -- chave PÚBLICA Ed25519 do device (base64 SPKI)
//     p_device_id   text,   -- UUID gerado no device
//     p_platform    text
//   ) returns json
//   security definer
//   -- Numa transacção:
//   --   1. valida o token (existe, não expirado, não usado) → senão devolve null
//   --   2. marca-o usado
//   --   3. insere em `devices` (user_id do token, device_id, pub, platform)
//   --   4. gera e devolve { device_key, device_id }
//   -- NUNCA devolve o user_id nem nada do perfil: o device não precisa.

const PRIVADO = { 'Cache-Control': 'private, no-store' } as const;

/** A chave pública do device: base64 de um SPKI Ed25519 (44 bytes → 60 chars). */
const PUB_RE = /^[A-Za-z0-9+/]{40,120}={0,2}$/;

interface EnrollBody {
  bootstrap_code?: unknown;
  device_pub?: unknown;
  device_id?: unknown;
  platform?: unknown;
}

export async function POST(req: NextRequest) {
  let body: EnrollBody;
  try {
    body = (await req.json()) as EnrollBody;
  } catch {
    return NextResponse.json({ error: 'corpo_invalido' }, { status: 400, headers: PRIVADO });
  }

  const { bootstrap_code, device_pub, device_id, platform } = body;

  if (!isValidInstallToken(bootstrap_code)) {
    return NextResponse.json({ error: 'codigo_invalido' }, { status: 400, headers: PRIVADO });
  }
  // A pública é validada na FORMA antes de tocar na base de dados. Não é
  // paranoia: ela vai ser guardada e depois usada para verificar assinaturas,
  // e uma pública malformada só se descobre no dia em que a verificação falha
  // — longe da causa, e num sítio onde parece um problema de assinatura.
  if (typeof device_pub !== 'string' || !PUB_RE.test(device_pub)) {
    return NextResponse.json({ error: 'chave_publica_invalida' }, { status: 400, headers: PRIVADO });
  }
  if (typeof device_id !== 'string' || device_id.length > 64) {
    return NextResponse.json({ error: 'device_id_invalido' }, { status: 400, headers: PRIVADO });
  }
  if (typeof platform !== 'string' || platform.length > 32) {
    return NextResponse.json({ error: 'plataforma_invalida' }, { status: 400, headers: PRIVADO });
  }

  const r = await rpc<{ device_key: string; device_id: string } | null>('enroll_device', {
    p_token: bootstrap_code,
    p_device_pub: device_pub,
    p_device_id: device_id,
    p_platform: platform,
  });

  if (!r || !r.device_key) {
    // 410 e não 500: para o cliente isto é sempre a mesma coisa — o código já
    // não serve — e o `enrolment.js` trata 401/410 como «expirou ou já foi
    // usado», que é a frase que o utilizador precisa de ler.
    return NextResponse.json({ error: 'codigo_expirado_ou_usado' }, { status: 410, headers: PRIVADO });
  }

  return NextResponse.json({ device_key: r.device_key, device_id: r.device_id }, { status: 200, headers: PRIVADO });
}
