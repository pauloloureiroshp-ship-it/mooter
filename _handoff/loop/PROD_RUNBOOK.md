# Subir o cockpit a produção (passos do Paulo — após verificar via F5)

PRÉ: na branch `wave-WCOCKPIT`, F5 (Run Extension) → confirmar que o cockpit novo funciona.

1. Merge para main (gate humano):
   git checkout main && git pull && git merge --no-ff wave-WCOCKPIT -m "feat(cockpit): auto-pilot por sessão + integrações + worktree"
2. Tag:
   git tag v1.x.x-wcockpit && git push origin main --tags
3. Sync runtime do router (sdk-runner usa modo/modelo por sessão):
   no Claude Code: /mooter-update   (idempotente)
4. Empacotar + instalar a extensão:
   cd packages/vscode-extension && vsce package
   VS Code → Extensions → "Install from VSIX…" → escolher o .vsix → Reload Window
5. Smoke em prod: vaquinhas animam por modo, agrupado por projeto, Notion/Obsidian sync + refresh, ⌥ worktree, "waiting for Cowork" quando há sinal.

NOTA: o loop NÃO faz merge/push/deploy (gate). Estes 5 passos são teus.
