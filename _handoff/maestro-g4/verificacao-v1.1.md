# Verificação adversarial do REMENDO (v1.1) — 2026-08-08 · ronda 2

**Veredicto: NO-SHIP.** `3 FECHADO · 8 COSMÉTICO · 2 PIOR`.
Job `job-mskurzba-b4e2`, codex read-only, crítico ≠ autor (quem escreveu o v1.1 não o julgou).
Transcript: `~/.mooter/jobs/job-mskurzba-b4e2/last-message.txt`.
Alvo: v1.1, sha `ff4ae3efe924ad0afdfbea96d38066e5eb4ab012207bf1d9211aaf21575c727b`, commit `168f598d`.

A pergunta desta ronda não era "o maestro está bom?" — era **"o remendo é real ou cosmético?"**.

## Veredicto por achado da ronda 1

| # | ronda 2 | o que sobrou |
|---:|---|---|
| 1 | COSMÉTICO | o próprio `F0.complete.json` trazia `commit_sha: "PENDENTE-mesmo-commit"` ⇒ pela minha regra, F0 **não estava fechada** |
| 2 | COSMÉTICO | um `F1a.complete.json` autofabricado continuava a destravar a F2 |
| 3 | **FECHADO** | adapters proibidos na F1a e só permitidos na F4b, depois do §0 e sobre C0 |
| 4 | COSMÉTICO | proibir o agente de escrever gestos + admitir que a autoria não é verificável = a mesma sessão cria o ficheiro e alega confirmação |
| 5 | COSMÉTICO | mover o template não impede falsificar `prereg-poke.md` + `PREREG_FREEZE` + a alegada palavra do dono |
| 6 | COSMÉTICO | dizer "E1–E6" e enumerar só o conteúdo de E1/E4/E5, omitindo E2, E3 e E6. E não existia validador |
| 7 | **FECHADO** | o apontador para o ficheiro de regras foi mesmo eliminado; exige protocolo executável ligado por sha |
| 8 | **FECHADO** | B4+B6+B5-real atribuídos à F1b; F5 exige F1b e juiz E2 |
| 9 | **PIOR** | o manifesto autofabricável virou a "verdade" automática — uma alegação em prosa passou a **chave machine-readable** capaz de destravar fases |
| 10 | COSMÉTICO | `RUNNING/BLOCKED/FAILED` nomeados no texto, mas só `COMPLETE` tinha ficheiro; o estado intermédio continuava em prosa |
| 11 | COSMÉTICO | pedir uma fonte de quota não reserva quota nem bloqueia concorrência atomicamente |
| 12 | COSMÉTICO | "o exportador falha se detectar assets" sem path, comando, teste ou hash. Só existia em documentação |
| 13 | **PIOR** | congelar todo o CONFIG antes da F1a é inexecutável — vários valores nem podem existir ainda |

## O golpe que interessa

> *"Isso converte uma alegação em prosa numa chave machine-readable capaz de destravar fases —
> e o único exemplar já viola o schema."*

O v1.1 não fechou o buraco do v1.0: **mudou-lhe o sítio**. E a contradição materializou-se na
mesma sessão que escreveu a regra — o `SYNC.md` dizia "F1a em curso · remoto criado" enquanto o
CONFIG dizia `n/d ⇒ PARAR`. Ou o STOP foi ignorado, ou o CONFIG deixou de representar a
realidade. Foi o primeiro.

## O que o v1.1.1 faz com cada um

| ronda-2 | emenda aplicada no v1.1.1 |
|---|---|
| 1, 9 | **`tools/maestro/validar-fase.js`** — escritor único de `maestro-state/`. O executor escreve um `.candidate.json` fora de lá e só pode declarar `attempt_id`/`comandos`/`notas`; **qualquer campo mensurável que forneça é rejeitado**. O validador recompõe hashes do disco, exige outputs **commitados**, mede `evidence_commit_sha` e escreve atomicamente. Auto-referência resolvida: o manifesto entra num **closure commit** próprio. |
| 2, 10 | estados não-`COMPLETE` passam a viver em `maestro-state/<F>.state.json` |
| 4, 5 | mantido `autoria: n/d` — mas agora **dito ao nível certo**: um nonce no ficheiro não resolve (quem o lê para validar copia-o); o fecho à prova de agente exigiria transcript com `role=user` ou HMAC no Credential Manager, e **isso não está implementado** |
| 6 | o maestro **deixa de resumir** o brief. `F4.complete.json` liga por `output_hash` os **seis** E1–E6; o conteúdo de cada um fica só no brief |
| 11 | `mooter_check live:0` passa a gate **antes de qualquer dispatch ou run, incluindo a F5** |
| 12 | reclassificado com honestidade: o guard do exportador público **não existe** e é pré-requisito da F5. O que existe e está testado é o guard da captura privada (recusa escrever dentro de árvore git) — não são a mesma coisa |
| 13 | `config_requires` **por fase**; um `n/d` só bloqueia quem o consome |
| extra | `determinismo` volta a `n/d` (o v1.1 tinha-o afrouxado para `null`, contra o brief) |
| extra | `ROM_PATH.txt` **sai da árvore do repo** para `~/.poke-gestos/` — o brief diz que o gesto é privado e que o repo só regista `rom_sha256` |
| extra | os afrouxamentos por omissão em C1/C2 e C5 fecham-se **apontando para o brief**, não reescrevendo-o |

## O que a ronda 2 tentou refutar e não conseguiu

Os hashes conferem (v1.1 `ff4ae3…`, brief `b272265…`, resultado `2f3c08…`, transcript
`a107e8…`, commit `168f598d`) · a mudança dos adapters para a F4b é substantiva e respeita
C0 → §0 → adapters MOCK · a F3 já não aponta para o ficheiro de regras incompleto · um FAIL
válido do B5-real não causa deadlock por si · a política jurídica ficou **mais** restritiva que
o brief, não menos · o D4 anti-cherry-pick está integralmente preservado.

## Residual — o que continua por fechar, dito em voz alta

1. **Autoria de gesto: `n/d`.** Mecanicamente insolúvel nesta montagem. Mitigação: gesto
   não-vazio + binding por sha + palavra do dono na conversa.
2. **Guard do exportador público: não existe.** Pré-requisito da F5.
3. **`piloto2/PROTOCOLO_v2.md`: não existe.** A F3 está travada por construção.
4. **Verificação cruzada local não correu em nenhuma das duas rondas** ⇒ este gate teve **um**
   motor, não dois. Não é auditoria independente e não será vendida como tal.
5. **Não houve ronda 3.** Declarar "todos os achados incorporados" depois de duas rondas seria
   repetir o erro que a ronda 2 apanhou. O que se afirma é o que está na tabela acima.
