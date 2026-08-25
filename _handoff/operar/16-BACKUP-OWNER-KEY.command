#!/bin/zsh
SRC="$HOME/paulo-vault/50-fleet/.owner.key"
DST_DIR="$HOME/Documents/mooter-backup"
LOG="$HOME/frugal/_handoff/backup-owner-key.log"
{
echo "=== backup-owner-key $(date) ==="
if [ -f "$SRC" ]; then
  mkdir -p "$DST_DIR"; chmod 700 "$DST_DIR"
  cp -p "$SRC" "$DST_DIR/owner.key.backup-$(date +%Y%m%d)"
  chmod 600 "$DST_DIR"/owner.key.backup-*
  echo "copiado para $DST_DIR ($(ls "$DST_DIR" | wc -l | tr -d ' ') backup(s)) — FORA de qualquer git"
  echo "RECOMENDACAO ao dono: guardar tambem no gestor de senhas (o ficheiro tem $(wc -c < "$SRC") bytes)"
else echo "FONTE AUSENTE: $SRC"; fi
echo "=== fim $(date) ==="
} >> "$LOG" 2>&1
