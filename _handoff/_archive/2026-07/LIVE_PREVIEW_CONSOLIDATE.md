# ⇄ COWORK→CC · Consolidar + aterrar o Live Preview (MP3 · MP4.1 · MP5.0/5.1 · MP5.2/5.3)

> **Contexto:** os 4 masterprompts do Live Preview correram (features vistas ao vivo pelo Paulo), mas o git
> está complexo: **colisão real** (MP3 e MP5.2 parecem na mesma branch `wave/honest-controls` no tree
> partilhado) + `feat/lp-preview-diagnostics @715620b` (MP4.1) + `feat/live-edit @05d3601` (MP5.0/5.1) + 36
> dirty. **Confronta o git REAL — não confies no handoff/journal nem no mount.** (Padrão que já salvou hoje:
> descobriste que o "MP4" nunca fora commitado.)

## 📍 ONDE
Worktree de aterragem **limpa e throwaway**: `git worktree add ../frugal-lp-land main`. Trabalha aí. Sonnet.

## ▶ DO
1. **Confronta cada frente** (`git log --oneline main..<branch>` + `git status` de cada worktree):
   - **MP3** (relógio tz local · consolidar iframe em main · multi-page nav) — localiza os commits reais (pode estar misturado em `wave/honest-controls` no tree partilhado → **desembaraça** o que é MP3 do que é MP5.2).
   - **MP4.1** (`feat/lp-preview-diagnostics @715620b`) — error-strip apanha erros server-side + commita o WIP do MP4 (deve trazer o MP4 inteiro agora).
   - **MP5.0+5.1** (`feat/live-edit @05d3601`) — click-to-code + edit determinístico $0 + chip de modelo.
   - **MP5.2+5.3** (estrutural + área) — localiza a branch (tree partilhado); provavelmente o mais experimental.
   Para cada: o que está **COMMITADO** vs **WIP** vs **incompleto**.
2. **Resolve a colisão** MP3 ↔ MP5.2 (separa por ficheiros/commits; se não for separável em segurança, aterra o MP3 e deixa o MP5.2 como WIP numa branch própria).
3. **Aterra SÓ o que passa o gate**, na ordem de dependência: **MP3 → MP4.1 → MP5.0/5.1 → MP5.2/5.3**.
   O que estiver WIP/incompleto/não-testado → **deixa como WIP** numa branch própria (honest-copy: **nunca fabricar prontidão** — como fizeste com o MP4 hoje).
4. **GATE por frente:** `classify.js` sha == `427d8c0b516315c6a858b183892ec26dc0fed7b52f11000e1e6b81fd364bc48f` · testes verdes (extensão `node --test src/*.test.js` + landing) · zero conflitos · sem tocar packages congelados fora do allowlist.
5. **PÁRA antes do push.** Cola: `git --no-pager log --oneline -12` + tabela "o que aterrou / o que ficou WIP e porquê" + resultado dos testes + a sha. **O Paulo autoriza o push (two-factor).**

## 🔒 GUARD
`classify.js` FROZEN · selective `git add` (nunca `-A`) · **sem push/merge sem OK do Paulo** · honest (não aterra WIP incompleto; diz o que ficou de fora e porquê) · 1 worktree = 1 sessão · PT-PT / inglês código.

## ✅ GATE
Aterragem limpa do que está pronto · o que ficou WIP está identificado e preservado · testes verdes · sha intacta · colisão resolvida · relatório colado. Zero surpresas.

## ⏭ NEXT
Depois do push: reinstalar o vsix de main (ativa MP3+MP4.1+MP5 no cockpit) · podar worktrees + fechar sessões idle (o tree tem 29 sessões / 36 dirty) · itens que ficaram WIP viram a próxima wave.
