# Masterprompt Claude Code no Mac · 2026-08-24 (escrito pelo Cowork)

Contexto: painel :4290 e `paulo-vault/10-projects/2026-08-24-mac-checkup-v1494.md`. Vault e repo já estão limpos (teu trabalho de hoje — obrigado). Restam 3 pendências que o Cowork não alcança (~/.mooter fora das pastas montadas; propostas de código são tuas). Git liberado — és o custódio.

## 1. Projecto ativo divergente (needs fixing no painel)
`~/.mooter/cowork-session.json` diz `mooter-pilar-coerencia` (binding de **16/08**, stale) · `~/.mooter/sessoes/mooter.json` diz `mooter-gpu-local-strategy`.
→ Alinhar os dois para **mooter-gpu-local-strategy** (o binding do cowork-session é o mais velho). Se o Paulo discordar, ele troca — regista a escolha no journal.

## 2. preferences.json em falta (worth a look)
```
echo '{"statusline_line3": true}' > "$HOME/.mooter/preferences.json"
```

## 3. A decisão que vale mais: o instrumento não discrimina
Loop em pausa (fila humana 524 vs limiar 6). O Paulo triou 726 achados e dispensou **todos** com a razão `instrumento-nao-discrimina` (0 aceites de 1054). L2 nunca abre com keep-rate 0% (barra 70%). **Não triar por ele.** Preparar como DIFF para aprovação (nunca aplicar direto):
- rever os prompts dos pilares P2/P3 (geram "cited" sem claim útil — ver exemplos dispensados no painel) e dos P7–P10 (0 cited: janela pequena demais?);
- limiar da fila humana configurável (hoje hardcoded 6?) + razão de dispensa em lote alimentar o scorer;
- opcional: `pilar:esgotado` re-abrir janelas quando o sha do repo muda (hoje o poço só seca).

## 4. Já feito pelo Cowork (não repetir)
Índice do vault reconstruído (599 docs, 15242 terms) · conector 1.49.4 · masterprompt do Windows no Project (`claude/HANDOFF_COWORK_WINDOWS_2026-08-24.md` §7) e por email · vigia da frota armada no Cowork (dispara `operar/4-VERIFICAR-FROTA.command` à 2ª linha do trusted-devices.json).

Fecho: journal no vault + push (o publicador leva o beacon assinado).
