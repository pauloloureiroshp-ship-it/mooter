# KICKOFF — Inscrever o Jetson (paulo-desktop) na frota · 2026-08-25
És o Claude Code no mac-mini. Missão ÚNICA e curta: inscrever o device `paulo-desktop` (Jetson Orin Nano) na frota e verificar.

MUTEX obrigatório antes de tudo: se `_handoff/cc-sistema.log` existir e NÃO tiver a linha "=== fim", ABORTA com a mensagem "sistema ainda a correr — reexecutar depois" e termina exit 0. Nunca dois executores.

Passos:
1. `npm run frota:chave -- --inscrever-device paulo-desktop MCowBQYDK2VwAyEAD0llGzPpAqH7iYh6LPPb8MD5W3NLDkAV9xszeS3/O1E=`
   (pubkey Ed25519 medida na ronda do Jetson 25/08, kid esperado d8db36a408a169a7)
2. No vault (~/paulo-vault): add SÓ path-exact `50-fleet/trusted-devices.json`, commit "frota: inscreve paulo-desktop (jetson)", `git pull --rebase --autostash`, push.
3. Verifica: trusted-devices.json com 3 devices (mac bb8ed09958167518 · pc 1ec7458fe5fb6f35 · jetson d8db36a408a169a7).
4. Se `50-fleet/paulo-desktop.json` (beacon do Jetson) JÁ existir: corre a verificação da frota exigindo 3 aceites · 0 rejeitados · prova_frota true. Se ainda não existir: regista "beacon do Jetson ainda não chegou — inscrição feita, verificação 3/3 fica para o próximo ciclo" e termina SEM bloquear.
5. Appenda 3 linhas de resultado em ~/paulo-vault/10-projects/2026-08-25-mac-sync-cockpit-frota.md.

Guardrails: nunca tocar classify.js (427d8c0b FROZEN) · não mexer em NADA além de 50-fleet/trusted-devices.json e o journal · sem merge/tag/deploy · números medidos ou n/d.
