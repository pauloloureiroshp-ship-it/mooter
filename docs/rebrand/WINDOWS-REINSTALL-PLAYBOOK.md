# Windows Reinstall Playbook — Kill Frugal F2 (PC Win11/RTX 4090)

> Espelho do reinstall do Mac (2026-06-10) adaptado. Executar APÓS Kill Frugal chegar ao main. Estimativa: 30-45 min.

## 0. Pré-condições
- Kill Frugal merged em main (installer já não cria ~/.frugal) — senão o bug da identidade bifurcada repete-se (aconteceu no Mac, 11-Jun)
- Anotar device.id actual: `type %USERPROFILE%\.frugal\device.id` → guardar

## 1. Backup (PowerShell)
```powershell
$ts = Get-Date -Format yyyyMMdd-HHmm
New-Item -ItemType Directory "$env:USERPROFILE\mooter-rescue-win-$ts"
Copy-Item -Recurse "$env:USERPROFILE\.frugal" "$env:USERPROFILE\mooter-rescue-win-$ts\.frugal" -ErrorAction SilentlyContinue
Copy-Item -Recurse "$env:USERPROFILE\.mooter" "$env:USERPROFILE\mooter-rescue-win-$ts\.mooter" -ErrorAction SilentlyContinue
Copy-Item "$env:USERPROFILE\.claude\settings.json" "$env:USERPROFILE\mooter-rescue-win-$ts\"
```
⚠️ GSD: preservar hooks gsd-* em ~/.claude (o uninstall antigo é stale — NÃO usar uninstall.sh do clone velho).

## 2. Remover clone legado
- `C:\Users\Paulo Loureiro\frugal\` → renomear para `frugal.OLD-$ts` (não apagar)
- Verificar remote antes: `git -C C:\Users\...\frugal remote get-url origin` (deve ser frugal.git legado)

## 3. Install limpo
```powershell
git clone https://github.com/pauloloureiroshp-ship-it/mooter.git "$env:USERPROFILE\mooter"
cd "$env:USERPROFILE\mooter"; .\install.ps1
```

## 4. Verificação (criteria duros)
- [ ] `type %USERPROFILE%\.mooter\device.id` == device.id anotado no passo 0 (migração preservou)
- [ ] `%USERPROFILE%\.frugal` removido
- [ ] `mooter doctor` verde (Ollama RTX 4090: modelos maiores que o Mac — qwen3:30b)
- [ ] settings.json: hook mooter-turn-header (não frugal-)
- [ ] Heartbeat na D1: device windows com received_at de hoje
- [ ] Hub /api/stats: hw_distribution ganha entrada nvidia/cuda
