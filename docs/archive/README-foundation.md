# Mooter Foundation — H1 Installation Guide

Os 4 artefatos que você pediu, prontos para o Bloco H1 do plano de 72h. Este README mapeia cada arquivo para onde deve ser instalado no seu projeto e em que ordem.

## Arquivos neste pacote

| Arquivo | Propósito | Destino no seu projeto |
|---|---|---|
| `MEMORY.md` | Memória arquitetural persistente do Mooter | `~/mooter/MEMORY.md` (raiz do repo) |
| `LOOP.md` | Loop de aprendizado bidirecional Terminal 2 ↔ Terminal 1 | `~/mooter/LOOP.md` (raiz do repo) |
| `TERMINAL-CONTRACT.md` | Contrato formal entre os dois terminais | `~/mooter/TERMINAL-CONTRACT.md` (raiz do repo) |
| `SAFETY-MECHANISMS.md` | Scripts e docs de emergency stop + GPU lock | `~/mooter/docs/SAFETY-MECHANISMS.md` |
| `skills/mooter-session-boundary/SKILL.md` | Skill de abertura/fechamento de sessão | `~/.claude/skills/mooter-session-boundary/SKILL.md` |
| `skills/mooter-loop-append/SKILL.md` | Skill de append em LOOP.md (Terminal 2 usa) | `~/.claude/skills/mooter-loop-append/SKILL.md` |

## Ordem de instalação (H1 do plano de 72h)

Você disse que arranca o H1 agora. Aqui a sequência, cronometrada:

### Passo 1 — Criar diretórios de segurança (5 min)

Windows PowerShell:
```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.mooter"
New-Item -ItemType Directory -Force "$env:USERPROFILE\mooter\scripts"
```

### Passo 2 — Commit os 4 arquivos na raiz do repo (15 min)

Coloque `MEMORY.md`, `LOOP.md`, `TERMINAL-CONTRACT.md` na raiz do `~/mooter/` (ou onde está o repo, que pelo CURRENT-STATE.md é `C:\Users\Paulo Loureiro\frugal`).

Coloque `SAFETY-MECHANISMS.md` em `docs/SAFETY-MECHANISMS.md`.

Commit atômico:
```bash
git add MEMORY.md LOOP.md TERMINAL-CONTRACT.md docs/SAFETY-MECHANISMS.md
git commit -m "foundation: add memory, loop, contract, safety mechanisms (H1 of 72h plan)"
```

### Passo 3 — Instalar os skills (15 min)

Copie as pastas `mooter-session-boundary/` e `mooter-loop-append/` para `~/.claude/skills/`.

No Windows:
```powershell
Copy-Item -Recurse "skills\mooter-session-boundary" "$env:USERPROFILE\.claude\skills\"
Copy-Item -Recurse "skills\mooter-loop-append" "$env:USERPROFILE\.claude\skills\"
```

Verifica que skills aparecem:
```bash
ls ~/.claude/skills/ | grep mooter-
```

### Passo 4 — Criar scripts de safety (15 min)

Extraia os blocos de script dentro de `SAFETY-MECHANISMS.md` e crie arquivos `.sh` (ou `.ps1` no Windows) em `~/mooter/scripts/`:

- `emergency-stop-watcher.sh` / `.ps1`
- `gpu-lock-acquire.sh` / `.ps1`
- `gpu-lock-release.sh` / `.ps1`
- `gpu-check.sh` / `.ps1`

Testa o smoke test do Passo 4 do SAFETY-MECHANISMS.md.

### Passo 5 — Configurar Ollama keep-alive (5 min)

Windows PowerShell (adicionar ao perfil `$PROFILE`):
```powershell
[System.Environment]::SetEnvironmentVariable("OLLAMA_KEEP_ALIVE", "5m", "User")
```

Reinicia terminal. Confirma:
```powershell
$env:OLLAMA_KEEP_ALIVE  # deve retornar "5m"
```

Restart Ollama. Verifica VRAM livre:
```bash
ollama ps  # modelos loaded (deve ir a 0 após 5 min idle)
nvidia-smi --query-gpu=memory.free --format=csv
```

Esperado: VRAM livre > 18GB após modelos descarregarem.

### Passo 6 — Exportar variáveis de identidade de terminal (5 min)

**No PowerShell do Terminal 1:**
```powershell
[System.Environment]::SetEnvironmentVariable("MOOTER_TERMINAL", "1", "User")
```

**No PowerShell do Terminal 2 (futuro, quando for ligar):**
```powershell
$env:MOOTER_TERMINAL = "2"
```

Para Terminal 2 você só seta na sessão, não no sistema — porque Terminal 2 só existe quando Paulo decide ligar.

### Passo 7 — Update SYNC.md (10 min)

Adicionar em SYNC.md (ou criar seção nova) referências aos novos documentos:

```markdown
## Foundation documents (H1 do plano de 72h)

- `MEMORY.md` — memória arquitetural persistente, lida no início de toda sessão Terminal 1
- `LOOP.md` — loop de aprendizado Terminal 2 → Terminal 1, append-only
- `TERMINAL-CONTRACT.md` — contrato formal, v1.0, frontmatter YAML machine-readable
- `docs/SAFETY-MECHANISMS.md` — emergency stop + gpu lock procedures
- `~/.claude/skills/mooter-session-boundary/` — ritual de abertura/fechamento
- `~/.claude/skills/mooter-loop-append/` — append em LOOP.md (Terminal 2)

## Protocolo do dia: 2026-04-21

H1 do plano de 72h completado. Foundation de fluxo entre terminais instalada.
Próximo: H2 (higiene crítica), H3 (dry run Terminal 2), H4 (polish landing).
```

### Passo 8 — Final-reviewer + push (15 min)

Seguindo a doutrina existente, rodar final-reviewer antes de push. Se passar, push.

```bash
# Invoca final-reviewer pelo skill existente ou comando slash
/mooter-final-review  # ou equivalente

# Se passar
git push origin main
```

### Passo 9 — Primeiro teste do mooter-session-boundary (10 min)

Fecha o Claude Code. Reabre. Primeiro comando:

```
executa mooter-session-boundary abertura
```

Esperado:
- Lê SYNC.md, mostra resumo
- Lê MEMORY.md, mostra última decisão
- Lê LOOP.md, mostra que há 2 entries OBSERVADO sem HIPÓTESE ($2.89 e F1.1)
- Verifica EMERGENCY_STOP (não existe) ✓
- Verifica GPU lock (não existe) ✓
- Confirma que está em branch main (Terminal 1) ✓
- Cria `~/.mooter/session-active-terminal-1` ✓

Se tudo OK: H1 completo.

Depois faz fechamento manualmente antes de fechar o terminal:
```
executa mooter-session-boundary fechamento
```

### Totais

Tempo H1 esperado: ~1h30 até 2h (era estimado 4-5h, mas muito já está pronto no pacote).

Budget H1 esperado: $0.50-$2.00 em Opus (passos são T0/T1 mas review final é T3).

## O que vem depois (H2, H3, H4)

H2 (higiene crítica, 1.5h) e H4 (polish landing, 2h) estão documentados no wrap-up anterior. H3 (dry run Terminal 2) depende de H1 estar 100% OK.

Quando H1 estiver pronto, me avisa aqui que eu destilo tarefa específica de H3 — a micro-task de baixo risco que testa todo o ritual em modo real.

## Checklist H1 (marcar conforme avança)

- [ ] Diretórios `~/.mooter` e `~/mooter/scripts` criados
- [ ] `MEMORY.md`, `LOOP.md`, `TERMINAL-CONTRACT.md` na raiz do repo
- [ ] `docs/SAFETY-MECHANISMS.md` criado
- [ ] Skills `mooter-session-boundary` e `mooter-loop-append` em `~/.claude/skills/`
- [ ] Scripts de safety em `~/mooter/scripts/` funcionando (smoke test passou)
- [ ] `OLLAMA_KEEP_ALIVE=5m` configurado, VRAM livre > 18GB após 5 min idle
- [ ] `MOOTER_TERMINAL=1` no Terminal 1
- [ ] SYNC.md atualizado com referências à foundation
- [ ] Final-reviewer passou
- [ ] Push para main feito
- [ ] Primeiro teste de `mooter-session-boundary` passou
- [ ] LOOP.md entry sobre H1 completion adicionada

## Observações finais

1. **MEMORY.md já vem preenchido** com 7 entries destiladas de toda nossa conversa. Não é template vazio — é memória real do projeto.

2. **LOOP.md já vem com duas entries OBSERVADO** — o $2.89 do inventário e o side-finding F1.1. Paulo decide quando (se) popular HIPÓTESE dessas.

3. **TERMINAL-CONTRACT.md é v1.0** — vai evoluir conforme você descobre casos não cobertos. Mudanças são commits próprios com final-reviewer.

4. **O ritual do session-boundary é estrito mas humano** — você pode dizer "pula abertura hoje, tô só testando" e Claude Code entende. Mas o default é executar o ritual sempre.

5. **Terminal 2 ainda não foi ligado** — H1 é setup para permitir Terminal 2 existir com segurança. Só depois do dry run em H3 você liga Terminal 2 pra operação contínua.

Boa instalação, Paulo. Nada estrutural ficou faltando.
