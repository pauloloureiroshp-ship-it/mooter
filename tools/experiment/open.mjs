// open.mjs — abre a onda a partir do manifesto congelado (e só dele).
//
// A janela (45/5 por omissão) vem de manifest.queue_policy, não de um argumento
// da linha de comandos — o que se pré-registou é o que corre. O manifesto é
// verificado (ficheiro, hash, diário) antes de abrir; um manifesto adulterado
// não abre onda nenhuma.

import { openWave } from './journal.mjs';
import { loadFrozenManifest } from './freeze.mjs';

/** @returns {{ manifest: object, entry: object }} */
export function openFromManifest(ctx) {
  const manifest = loadFrozenManifest(ctx); // FreezeError('manifest_tampered' | 'manifest_missing')
  const q = manifest.queue_policy;
  const entry = openWave(ctx, {
    manifest_hash: manifest.manifest_hash,
    wallclock_minutes: q.wallclock_minutes,
    reserve_minutes: q.closeout_reserve_minutes,
  });
  return { manifest, entry };
}
