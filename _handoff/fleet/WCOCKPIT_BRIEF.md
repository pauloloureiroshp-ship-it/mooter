# Wave WCOCKPIT — Auto-pilot por sessão no cockpit do plugin (aditivo, com testes)

LÊ E SEGUE: docs/strategy/MOOTER_COCKPIT_ARCHITECTURE.md + docs/strategy/MOOTER_WAITING_FOR_COWORK.md.

OBJETIVO: landar no packages/vscode-extension, 100% ADITIVO, a feature "Auto-pilot por sessão":
1. Copiar `_handoff/loop/mode-registry.js` e `_handoff/loop/cowork-waiting.js` para `packages/vscode-extension/src/`.
2. `host-extra.js recentSessions()` (~L714): decorar cada row com `cowork-waiting.decorate(row, pending)` + `mode-registry.decorate(row)`.
3. `extension.js`:
   - `rowFor()` (~L576): badge via cowork-waiting.badge(r) || working/your-turn; vaquinha com classe de animação por modo (lazy/walk/crazy); selector segmentado de modo + dropdown de modelo + toggle auto por card; agrupar por `mode-registry.byProject()` com dropdowns colapsáveis (estado em ~/.mooter/preferences.json).
   - CSS (~L354): juntar cowork-waiting.CSS + as 3 animações (moolazy/moowalk/moocrazy) + prefers-reduced-motion.
   - onDidReceiveMessage: casos setMode/setModel/setAuto/toggleProject -> mode-registry.set + preferences.
4. `sdk-runner.mjs`: ao iniciar ronda, ler mode-registry.get(sid) -> escolher GEN_MODE/model por sessão (lazy=local/barato, moo=sonnet, crazy=opus). Manter canUseTool determinístico + timeout.
5. Testes (data.test.js + novos): unit de mode-registry e cowork-waiting; contrato dos campos; estados mutuamente exclusivos. Correr `cd packages/cli && npm test` e o teste do extension se existir.

REGRAS DURAS: classify.js FROZEN (sha 427d8c0b...364bc48f, prova no fim). packages/* engine não tocado (só src/ do extension, aditivo). git add selectivo. NUNCA merge/push/tag para main (gate humano -> BLOCKERS). Escrita de ficheiros JSON sempre atómica (tmp+rename). No fim: bloco status (DID/TESTS/BLOCKERS/NEXT/DONE) + alimentar Notion (sub-página sob 3876f6e4-2bc4-812b-b5d3-e6433a6cc8af) + vault.
