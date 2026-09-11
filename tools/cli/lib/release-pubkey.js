/**
 * release-pubkey.js — a âncora de confiança do update, pregada no cliente.
 *
 * ── PORQUE ISTO EXISTE, E PORQUE NÃO PODIA SER NENHUMA DAS CHAVES QUE JÁ HAVIA ──
 * O kickoff da W1 mandava assinar «com a chave pública já embutida nos beacons».
 * Não havia nenhuma — procurado no repo a 2026-09-10 (`PUBKEY`, `publicKey`,
 * `BEGIN PUBLIC`, `SPKI`) em `tools/`, `packages/mooter-bridge/` e
 * `landing/app/`: zero. E o que existia não servia, por razões diferentes:
 *
 *  · O HMAC do `assinatura.js` é **simétrico**. Quem verifica consegue assinar.
 *    Pregá-lo em cada cliente é dar a chave de assinar releases a toda a gente
 *    que instala o Mooter.
 *  · O Ed25519 do `assinatura.js` é **por device**, verificado contra
 *    `50-fleet/trusted-devices.json`, que vive no vault pessoal do dono. Um
 *    cliente instalado não tem vault, logo não tem contra o que verificar.
 *
 * Uma release assinada precisa de uma terceira coisa, e é esta: **pública no
 * cliente, privada só com quem corta releases**.
 *
 * ── ISTO É PÚBLICO. É SUPOSTO SER. ──────────────────────────────────────────
 * Este ficheiro está no git de propósito e não é um segredo: com ele só se
 * *verifica*, nunca se assina. A privada foi gerada neste Mac a 2026-09-11 e
 * vive em dois sítios, nenhum deles aqui:
 *
 *   · Keychain do macOS — serviço `mooter-release-key`, sem aplicação de
 *     confiança (`-T ""`), o que obriga a autorização explícita a cada leitura.
 *     Prender a pedir autorização não é um defeito: é o comportamento.
 *   · GitHub Actions secret `MOOTER_RELEASE_KEY`, que o workflow de release usa.
 *
 * ── ROTAÇÃO ─────────────────────────────────────────────────────────────────
 * O procedimento completo está em `docs/adr/ADR-onboarding-v2.md` § D7. O
 * resumo: gerar par novo · publicar a pública **primeiro** (numa versão que os
 * clientes instalam) · só depois trocar o secret e assinar com a nova. Pela
 * ordem inversa, todos os clientes com a pública antiga recusariam a release
 * que traz a pública nova — e ficariam presos para sempre, porque a única
 * forma de saírem seria uma release que eles já não aceitam.
 *
 * O `MAPA` existe por causa disso: durante uma rotação há **duas** públicas
 * válidas, e o cliente tem de aceitar as duas até a antiga sair de circulação.
 */

'use strict';

/**
 * As públicas de release que este cliente aceita, por `kid`.
 * O `kid` é `sha256(pub base64)` truncado a 16 hex — é o que aparece no
 * `sig.kid` do manifesto e serve para dizer QUAL chave falhou, não para
 * autorizar nada (o `kid` está fora da assinatura; mexer nele não faz passar
 * nada, só piora a mensagem de erro de quem o mexeu).
 */
const CHAVES = Object.freeze({
  // Gerada 2026-09-11 no Mac mini do dono. Activa.
  '4be1bf1d6017e10f': 'MCowBQYDK2VwAyEAC9rmrbxtQ20tac3tnubmqdCkl/AuMrtHtkNQOv3WW2g=',
});

/** O `kid` da chave com que se ASSINA hoje. As outras só se verificam. */
const KID_ACTIVO = '4be1bf1d6017e10f';

/** Todas as públicas aceites, em base64 SPKI. */
function publicas() {
  return Object.values(CHAVES);
}

/** A pública de um `kid`, ou `null`. */
function porKid(kid) {
  return (kid && CHAVES[kid]) || null;
}

module.exports = { CHAVES, KID_ACTIVO, publicas, porKid };
