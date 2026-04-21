# Mooter — Emergency Stop + GPU Lock Setup

Dois mecanismos de segurança críticos para operação multi-terminal. Este documento fornece scripts, procedures, e triggers para cada um. Copiar para `~/mooter/scripts/` e seguir instruções de setup.

## 1. Emergency Stop

Kill switch universal. Criado em qualquer dispositivo, detectado por todos os terminais, força shutdown graceful.

### Localização do arquivo

`~/.mooter/EMERGENCY_STOP` (Linux/Mac) ou `$env:USERPROFILE\.mooter\EMERGENCY_STOP` (Windows).

**Existência do arquivo = ordem de parar**, independente do conteúdo.

### Triggers — quem pode criar

Qualquer um dos abaixo:

1. **Paulo manualmente do Terminal 1:**
```bash
touch ~/.mooter/EMERGENCY_STOP
echo "Motivo: $1" > ~/.mooter/EMERGENCY_STOP
```

2. **Paulo via iPhone Claude dispatch:**
```
/mooter-stop motivo="deploy imprevisto, todos param"
```

3. **Budget daemon (automático):**
```bash
# Acionado quando cumulative cloud spend > $20 em 24h
{
  "motivo": "budget_breach",
  "threshold": "20usd_24h",
  "actual_spend_24h": 23.47,
  "timestamp": "2026-04-22T14:30:00Z"
} > ~/.mooter/EMERGENCY_STOP
```

4. **VRAM monitor (automático):**
```bash
# Acionado quando VRAM livre < 500MB por > 5 min
{
  "motivo": "vram_critical",
  "free_mb": 327,
  "duration_seconds": 340,
  "timestamp": "2026-04-22T14:30:00Z"
} > ~/.mooter/EMERGENCY_STOP
```

### Comportamento esperado dos terminais

**Terminal 2 (check a cada 30s):**
- Detecta arquivo → graceful shutdown
- Salva WIP em branch `agent/terminal-2-stopped-TIMESTAMP`
- Escreve session report parcial
- Append em LOOP.md: `OBSERVADO YYYY-MM-DD-emergency-stop-triggered` com motivo
- Exit code 42

**Terminal 1 (check a cada 5 min, ou antes de comando caro):**
- Detecta arquivo → pausa, notifica Paulo
- Se rodando autonomamente via dispatch, espera Paulo confirmar remoção

### Remover EMERGENCY_STOP

Manualmente Paulo:
```bash
rm ~/.mooter/EMERGENCY_STOP
```

Apenas Paulo pode remover. Terminal 2 NUNCA remove.

### Script de watcher (roda no Terminal 2, invocado pelo mooter-session-boundary)

```bash
#!/bin/bash
# ~/mooter/scripts/emergency-stop-watcher.sh
# Roda em background durante sessão de Terminal 2

STOP_FILE="$HOME/.mooter/EMERGENCY_STOP"
CHECK_INTERVAL=30

while true; do
  if [ -f "$STOP_FILE" ]; then
    REASON=$(cat "$STOP_FILE")
    echo "[$(date -u +%FT%TZ)] EMERGENCY_STOP detected: $REASON"
    
    # Sinaliza Claude Code para abortar
    # (implementação específica depende de como Claude Code expõe signal handling)
    touch "$HOME/.mooter/terminal-2-aborting"
    
    # Graceful shutdown hooks serão chamados pelo Claude Code
    exit 42
  fi
  sleep $CHECK_INTERVAL
done
```

Windows PowerShell equivalente:

```powershell
# ~/mooter/scripts/emergency-stop-watcher.ps1
$stopFile = "$env:USERPROFILE\.mooter\EMERGENCY_STOP"
$abortSignal = "$env:USERPROFILE\.mooter\terminal-2-aborting"
$checkInterval = 30

while ($true) {
  if (Test-Path $stopFile) {
    $reason = Get-Content $stopFile -Raw
    Write-Host "[$((Get-Date).ToUniversalTime().ToString('o'))] EMERGENCY_STOP detected: $reason"
    
    New-Item $abortSignal -ItemType File -Force | Out-Null
    exit 42
  }
  Start-Sleep -Seconds $checkInterval
}
```

## 2. GPU Lock

Protocolo cooperativo para compartilhar a única GPU (RTX 4090) entre Terminal 1 (inference via Ollama) e Terminal 2 (training de LoRA).

### Localização do arquivo

`~/.mooter/gpu-lock`

### Formato JSON

```json
{
  "holder": "terminal-2",
  "task": "lora-training-classifier-v3",
  "started_at": "2026-04-25T14:30:00Z",
  "estimated_end": "2026-04-25T18:30:00Z",
  "pid": 12847
}
```

### Protocolo de aquisição (Terminal 2 antes de training)

```bash
#!/bin/bash
# ~/mooter/scripts/gpu-lock-acquire.sh

LOCK="$HOME/.mooter/gpu-lock"

# Step 1: Check if lock exists
if [ -f "$LOCK" ]; then
  STARTED=$(jq -r .started_at "$LOCK")
  HOLDER=$(jq -r .holder "$LOCK")
  
  # Check if stale (> 4h old)
  STARTED_EPOCH=$(date -d "$STARTED" +%s 2>/dev/null || echo 0)
  NOW_EPOCH=$(date +%s)
  AGE=$((NOW_EPOCH - STARTED_EPOCH))
  
  if [ $AGE -gt 14400 ]; then
    echo "Stale lock from $HOLDER (${AGE}s old). Claiming."
    rm "$LOCK"
  else
    echo "GPU locked by $HOLDER, not stale. Aborting."
    exit 1
  fi
fi

# Step 2: Acquire
TASK="$1"
DURATION_HOURS="${2:-4}"
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u -d "+${DURATION_HOURS} hours" +%Y-%m-%dT%H:%M:%SZ)

cat > "$LOCK" <<EOF
{
  "holder": "terminal-2",
  "task": "$TASK",
  "started_at": "$NOW",
  "estimated_end": "$END",
  "pid": $$
}
EOF

echo "GPU lock acquired for $TASK until $END"
```

### Protocolo de release (Terminal 2 após training)

```bash
#!/bin/bash
# ~/mooter/scripts/gpu-lock-release.sh

LOCK="$HOME/.mooter/gpu-lock"
if [ -f "$LOCK" ]; then
  HOLDER=$(jq -r .holder "$LOCK")
  if [ "$HOLDER" = "terminal-2" ]; then
    rm "$LOCK"
    echo "GPU lock released."
  else
    echo "Lock held by $HOLDER, not releasing."
    exit 1
  fi
fi
```

### Protocolo de check (Terminal 1 antes de inference)

```bash
#!/bin/bash
# ~/mooter/scripts/gpu-check.sh

LOCK="$HOME/.mooter/gpu-lock"
if [ -f "$LOCK" ]; then
  TASK=$(jq -r .task "$LOCK")
  END=$(jq -r .estimated_end "$LOCK")
  echo "GPU in use by $TASK until $END"
  echo "Terminal 1: use cloud API instead of local Ollama."
  exit 0  # not an error, just info
fi
echo "GPU free."
```

### Configuração complementar: Ollama keep-alive

Independente do GPU lock, configurar Ollama para liberar VRAM quando idle:

Windows PowerShell (adicionar ao perfil):
```powershell
$env:OLLAMA_KEEP_ALIVE = "5m"
```

Linux/Mac (adicionar a `~/.bashrc` ou `~/.zshrc`):
```bash
export OLLAMA_KEEP_ALIVE=5m
```

Reiniciar Ollama depois:
```bash
ollama serve  # em um terminal separado
# ou se rodando como serviço:
# Windows: Restart-Service ollama
# Linux: systemctl restart ollama
```

Com isso, modelos saem da VRAM após 5 min de idle, liberando ~10-14GB dependendo do modelo. Terminal 2 pode treinar LoRA em Qwen 2.5 14B quantizado (precisa ~10-16GB) com folga.

## 3. Setup inicial (rodar uma vez)

```bash
# Linux/Mac
mkdir -p ~/.mooter
mkdir -p ~/mooter/scripts
chmod +x ~/mooter/scripts/*.sh

# Criar skeleton dos arquivos
touch ~/.mooter/session-active-terminal-1.placeholder
touch ~/.mooter/session-active-terminal-2.placeholder
rm ~/.mooter/session-active-terminal-*.placeholder

# Verificar jq instalado (necessário para parsing JSON)
command -v jq >/dev/null || echo "INSTALL: apt install jq  OR  brew install jq"
```

Windows PowerShell:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\.mooter"
New-Item -ItemType Directory -Force "$env:USERPROFILE\mooter\scripts"

# Verificar jq disponível
if (-not (Get-Command jq -ErrorAction SilentlyContinue)) {
  Write-Host "INSTALL: choco install jq  OR  scoop install jq"
}
```

## 4. Teste de smoke

Depois do setup, testar que tudo funciona:

```bash
# Criar e detectar EMERGENCY_STOP
echo "test" > ~/.mooter/EMERGENCY_STOP
ls ~/.mooter/EMERGENCY_STOP && echo "EMERGENCY_STOP creation works"
rm ~/.mooter/EMERGENCY_STOP

# Criar e liberar GPU lock
bash ~/mooter/scripts/gpu-lock-acquire.sh "test-task" 1
bash ~/mooter/scripts/gpu-check.sh  # deve dizer "in use"
bash ~/mooter/scripts/gpu-lock-release.sh
bash ~/mooter/scripts/gpu-check.sh  # deve dizer "free"

echo "All mechanisms operational."
```

## 5. Integração com mooter-session-boundary

O skill `mooter-session-boundary` deve invocar estes mecanismos automaticamente:

- **Abertura:** verifica EMERGENCY_STOP, verifica gpu-lock
- **Durante sessão de Terminal 2:** watcher de EMERGENCY_STOP em background
- **Antes de Terminal 2 chamar Ollama:** verifica gpu-lock
- **Fechamento de Terminal 2:** libera gpu-lock se foi quem segurou

Referenciado no SKILL.md do session-boundary.
