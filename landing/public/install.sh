#!/usr/bin/env bash
#
# mooter.ai — PUBLIC installer (v1). Served at https://mooter.ai/install.sh
# (via Vercel, from landing/public/install.sh). Route smarter. Ship faster.
#
# ⚠️  NOT the same file as /install.sh at the repo root — that one is Paulo's
#     private development bootstrap and MUST NOT be synced to this file.
#     If you want to change what users see, edit THIS file.
#
# Usage:
#   bash <(curl -fsSL https://mooter.ai/install.sh)
#
# Flags:
#   --dry-run      Preview every action without writing a single byte
#   --force        Overwrite existing runtime without prompting
#   --uninstall    Remove mooter runtime (preserves decisions.log)
#   --doctor       Run diagnostics only (no install)
#   --no-ollama    Skip Ollama probe + model pulls
#   --no-telemetry Skip anonymous heartbeat to mooter-hub
#   --runtime-url  Override runtime bundle URL (default: https://mooter.ai/runtime)
#   -h, --help     Show this help
#
# Exit codes:
#   0 success · 1 unrecoverable · 2 user-aborted · 3 prereq missing · 4 network

set -Eeuo pipefail

readonly MOOTER_VERSION="1.0.0-install"
readonly RUNTIME_URL_DEFAULT="https://mooter.ai/runtime"
readonly HUB_URL="https://mooter-hub.frugal-hub.workers.dev"
readonly MIN_NODE_MAJOR=18
readonly CLAUDE_DIR="${HOME}/.claude"
readonly MOOTER_DIR="${HOME}/.frugal"
readonly BACKUP_ROOT="${CLAUDE_DIR}/backups"
ISO_NOW="$(date -u +%Y-%m-%dT%H-%M-%SZ 2>/dev/null || date +%s)"
readonly ISO_NOW
readonly BACKUP_DIR="${BACKUP_ROOT}/mooter-install-${ISO_NOW}"
readonly LOG_FILE="/tmp/mooter-install-${ISO_NOW}.log"

DRY_RUN=0; FORCE=0; UNINSTALL=0; DOCTOR_ONLY=0
NO_OLLAMA=0; NO_TELEMETRY=0
RUNTIME_URL="${RUNTIME_URL_DEFAULT}"

if [ -t 1 ] && command -v tput >/dev/null 2>&1; then
  BOLD=$(tput bold); DIM=$(tput dim); RED=$(tput setaf 1); GREEN=$(tput setaf 2)
  YELLOW=$(tput setaf 3); BLUE=$(tput setaf 4); CYAN=$(tput setaf 6); RESET=$(tput sgr0)
else
  BOLD=""; DIM=""; RED=""; GREEN=""; YELLOW=""; BLUE=""; CYAN=""; RESET=""
fi

say()  { printf '%s\n' "$*"; }
info() { printf '%s[info]%s %s\n' "${CYAN}" "${RESET}" "$*"; }
ok()   { printf '%s[ ok ]%s %s\n' "${GREEN}" "${RESET}" "$*"; }
warn() { printf '%s[warn]%s %s\n' "${YELLOW}" "${RESET}" "$*" >&2; }
err()  { printf '%s[fail]%s %s\n' "${RED}" "${RESET}" "$*" >&2; }
step() { printf '\n%s──%s %s%s%s\n' "${DIM}" "${RESET}" "${BOLD}" "$*" "${RESET}"; }

dry() {
  if [ "${DRY_RUN}" = 1 ]; then
    printf '%s[dry]%s %s\n' "${BLUE}" "${RESET}" "$*"
    return 0
  fi
  return 1
}

banner() {
  cat <<'EOF'
  ┌───────────────────────────────────────────────┐
  │         🐮  mooter.ai installer               │
  │     Route smarter. Ship faster.               │
  └───────────────────────────────────────────────┘
EOF
}

on_error() {
  local rc=$?
  err "Installer failed at line ${BASH_LINENO[0]} (exit ${rc})."
  err "Full log: ${LOG_FILE}"
  exit "${rc}"
}
trap on_error ERR

usage() { sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run)      DRY_RUN=1 ;;
    --force)        FORCE=1 ;;
    --uninstall)    UNINSTALL=1 ;;
    --doctor)       DOCTOR_ONLY=1 ;;
    --no-ollama)    NO_OLLAMA=1 ;;
    --no-telemetry) NO_TELEMETRY=1 ;;
    --runtime-url)  shift; RUNTIME_URL="$1" ;;
    --runtime-url=*) RUNTIME_URL="${1#*=}" ;;
    -h|--help)      usage; exit 0 ;;
    *)              err "Unknown flag: $1"; usage; exit 2 ;;
  esac
  shift
done

exec > >(tee -a "${LOG_FILE}") 2>&1

detect_os() {
  local u; u="$(uname -s 2>/dev/null || echo unknown)"
  case "${u}" in
    Darwin)               echo "darwin" ;;
    Linux)                echo "linux"  ;;
    MINGW*|MSYS*|CYGWIN*) echo "windows-bash" ;;
    *)                    echo "unknown" ;;
  esac
}

detect_arch() {
  local a; a="$(uname -m 2>/dev/null || echo unknown)"
  case "${a}" in
    x86_64|amd64)  echo "x64" ;;
    arm64|aarch64) echo "arm64" ;;
    *)             echo "${a}" ;;
  esac
}

detect_ram_gb() {
  case "$(detect_os)" in
    darwin)
      local bytes; bytes="$(sysctl -n hw.memsize 2>/dev/null || echo 0)"
      echo $(( bytes / 1024 / 1024 / 1024 )) ;;
    linux)
      awk '/MemTotal/ {printf "%d", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo 0 ;;
    windows-bash)
      local kb
      kb="$(wmic ComputerSystem get TotalPhysicalMemory /value 2>/dev/null | tr -d '\r' | awk -F= '/=/ {print $2}')"
      if [ -n "${kb:-}" ] && [ "${kb}" -gt 0 ] 2>/dev/null; then
        echo $(( kb / 1024 / 1024 / 1024 ))
      else echo 0; fi ;;
    *) echo 0 ;;
  esac
}

detect_hw_tier() {
  local os arch ram
  os="$(detect_os)"; arch="$(detect_arch)"; ram="$(detect_ram_gb)"
  if [ "${os}" = "darwin" ] && [ "${arch}" = "arm64" ]; then
    echo "apple-silicon"; return
  fi
  if command -v nvidia-smi >/dev/null 2>&1; then
    local vram
    vram="$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits 2>/dev/null | head -1 || echo 0)"
    vram="${vram// /}"
    if [ "${vram:-0}" -ge 8000 ] 2>/dev/null; then
      echo "nvidia-high"; return
    fi
    echo "nvidia-low"; return
  fi
  if [ "${ram:-0}" -ge 16 ]; then
    echo "integrated-high"
  else
    echo "cpu-only"
  fi
}

check_prereqs() {
  step "Prerequisites"
  local missing=0
  if command -v node >/dev/null 2>&1; then
    local nv major; nv="$(node --version 2>/dev/null)"
    major="${nv#v}"; major="${major%%.*}"
    if [ "${major:-0}" -ge "${MIN_NODE_MAJOR}" ]; then
      ok "Node.js ${nv}"
    else
      err "Node.js ${nv} is too old (need ≥${MIN_NODE_MAJOR}). https://nodejs.org"
      missing=1
    fi
  else
    err "Node.js not found. https://nodejs.org"
    missing=1
  fi
  command -v git >/dev/null 2>&1 && ok "git $(git --version | awk '{print $3}')" || warn "git not found (optional)"
  if command -v claude >/dev/null 2>&1; then
    ok "Claude Code $(claude --version 2>/dev/null | head -1 || echo 'present')"
  else
    err "Claude Code not found. Run: npm install -g @anthropic-ai/claude-code"
    missing=1
  fi
  if command -v curl >/dev/null 2>&1; then
    ok "curl $(curl --version | head -1 | awk '{print $2}')"
  else
    err "curl not found (required)."
    missing=1
  fi
  if [ "${NO_OLLAMA}" = 0 ]; then
    if command -v ollama >/dev/null 2>&1; then
      ok "Ollama present (T0 local routing available)"
    else
      warn "Ollama not found. https://ollama.com — T0 will fall back to Haiku."
    fi
  fi
  if [ "${missing}" = 1 ]; then
    err "Fix missing prerequisites, then re-run."
    exit 3
  fi
}

ensure_device_id() {
  mkdir -p "${MOOTER_DIR}"
  local idfile="${MOOTER_DIR}/device.id"
  if [ ! -s "${idfile}" ]; then
    if command -v uuidgen >/dev/null 2>&1; then
      uuidgen | tr '[:upper:]' '[:lower:]' > "${idfile}"
    else
      printf '%s-%s\n' "${ISO_NOW}" "$(hostname 2>/dev/null || echo host)" \
        | shasum 2>/dev/null | awk '{print $1}' > "${idfile}"
    fi
    ok "Generated anonymous device.id"
  else
    info "Using existing device.id"
  fi
  cat "${idfile}"
}

download_runtime() {
  step "Downloading mooter runtime"
  local tarball="/tmp/mooter-runtime-${ISO_NOW}.tgz"
  local url="${RUNTIME_URL}/mooter-runtime-latest.tgz"
  if dry "curl -fsSL ${url} -o ${tarball}"; then return 0; fi
  info "Source: ${url}"
  if ! curl -fsSL --retry 3 --retry-delay 2 -o "${tarball}" "${url}"; then
    err "Could not download runtime from ${url}"
    err "Rerun with --runtime-url https://your.mirror if needed"
    exit 4
  fi
  ok "Downloaded $(wc -c < "${tarball}" | tr -d ' ') bytes"

  if [ -d "${CLAUDE_DIR}/tools/router" ] && [ "${FORCE}" = 0 ]; then
    warn "Existing ~/.claude/tools/router/ detected."
    warn "Rerun with --force, --dry-run, or --uninstall first."
    exit 2
  fi
  if [ -d "${CLAUDE_DIR}/tools/router" ]; then
    mkdir -p "${BACKUP_DIR}"
    cp -a "${CLAUDE_DIR}/tools" "${BACKUP_DIR}/tools"
    cp -a "${CLAUDE_DIR}/hooks" "${BACKUP_DIR}/hooks" 2>/dev/null || true
    cp -a "${CLAUDE_DIR}/settings.json" "${BACKUP_DIR}/settings.json" 2>/dev/null || true
    ok "Backed up to ${BACKUP_DIR}"
  fi

  mkdir -p "${CLAUDE_DIR}"
  tar -xzf "${tarball}" -C "${CLAUDE_DIR}"
  ok "Extracted to ${CLAUDE_DIR}"
  rm -f "${tarball}"
}

merge_settings() {
  step "Registering UserPromptSubmit hook"
  local merger="${CLAUDE_DIR}/tools/router/merge_settings.js"
  if [ ! -f "${merger}" ]; then
    warn "merge_settings.js not found — skipping."
    return 0
  fi
  if dry "node ${merger}"; then return 0; fi
  node "${merger}"
  ok "settings.json merged (existing hooks preserved)"
}

setup_ollama() {
  [ "${NO_OLLAMA}" = 1 ] && { info "Skipping Ollama (flag)"; return 0; }
  command -v ollama >/dev/null 2>&1 || { warn "Ollama absent."; return 0; }
  step "Configuring Ollama models"
  local ram tier
  ram="$(detect_ram_gb)"; tier="$(detect_hw_tier)"
  info "Hardware tier: ${tier} · RAM: ${ram} GB"
  local want=("qwen2.5:3b" "qwen2.5-coder:14b" "nomic-embed-text")
  if [ "${ram}" -ge 16 ]; then
    want+=("qwen3:30b")
  else
    warn "RAM < 16 GB — skipping qwen3:30b"
  fi
  local m have
  have="$(ollama list 2>/dev/null | awk 'NR>1 {print $1}')"
  for m in "${want[@]}"; do
    if echo "${have}" | grep -q "^${m}"; then
      ok "${m} already present"
    else
      if dry "ollama pull ${m}"; then continue; fi
      info "Pulling ${m}..."
      ollama pull "${m}" || warn "${m} pull failed — retry later"
    fi
  done
}

run_subscription_wizard() {
  step "Subscription profile"
  local profile="${CLAUDE_DIR}/tools/router/subscription-profile.json"
  if [ -s "${profile}" ] && [ "${FORCE}" = 0 ]; then
    ok "Existing profile kept. --force to reconfigure."
    return 0
  fi
  if [ ! -t 0 ]; then
    warn "Non-interactive — writing default profile."
    if dry "write default profile to ${profile}"; then return 0; fi
    mkdir -p "$(dirname "${profile}")"
    cat > "${profile}" <<JSON
{"anthropic":"unknown","openai":"none","gemini":"none","budget_monthly_usd":null,"currency":"USD"}
JSON
    return 0
  fi

  say ""
  say "${BOLD}Tell mooter what you have, so it routes smartly.${RESET}"
  say ""
  local ant oai gem bud
  read -rp "  Anthropic plan? [max / api / none]: " ant
  read -rp "  OpenAI API key configured? [api / none]: " oai
  read -rp "  Gemini API key configured? [api / none]: " gem
  read -rp "  Monthly LLM budget ceiling in USD (empty = no cap): " bud
  ant="${ant:-unknown}"; oai="${oai:-none}"; gem="${gem:-none}"
  if dry "write ${profile}"; then return 0; fi
  mkdir -p "$(dirname "${profile}")"
  cat > "${profile}" <<JSON
{
  "anthropic": "${ant}",
  "openai": "${oai}",
  "gemini": "${gem}",
  "budget_monthly_usd": ${bud:-null},
  "currency": "USD",
  "configured_at": "${ISO_NOW}"
}
JSON
  ok "Saved to ${profile}"
}

smoke_test() {
  step "Smoke test"
  local classify="${CLAUDE_DIR}/tools/router/classify.js"
  [ -f "${classify}" ] || { warn "classify.js missing — skipping"; return 0; }
  if dry "run 4 prompts through classify.js"; then return 0; fi
  local -a prompts=(
    "write a commit message for this change"
    "my app crashes when I click submit on mobile"
    "design the multi-tenant authentication architecture"
    "rm -rf the production database"
  )
  local -a expected=("T0|T1" "T2" "T3" "T3")
  local i rc=0
  for i in 0 1 2 3; do
    local tier
    tier="$(PROMPT="${prompts[i]}" node -e 'console.log(JSON.stringify({prompt: process.env.PROMPT}))' \
           | node "${classify}" 2>/dev/null \
           | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{console.log(JSON.parse(d).tier||"ERR")}catch(e){console.log("ERR")}})')"
    if echo "${tier}" | grep -Eq "^(${expected[i]})$"; then
      ok "[$((i+1))/4] '${prompts[i]:0:40}…' → ${tier}"
    else
      warn "[$((i+1))/4] '${prompts[i]:0:40}…' → ${tier} (expected ${expected[i]})"
      rc=1
    fi
  done
  [ "${rc}" = 0 ] && ok "Classifier routes sanely" || warn "Some tiers unexpected."
  return 0
}

send_heartbeat() {
  [ "${NO_TELEMETRY}" = 1 ] && { info "Skipping telemetry (flag)"; return 0; }
  step "Anonymous install heartbeat"
  local device_id os arch ram tier node_v claude_v
  device_id="$(ensure_device_id)"
  os="$(detect_os)"; arch="$(detect_arch)"; ram="$(detect_ram_gb)"; tier="$(detect_hw_tier)"
  node_v="$(node --version 2>/dev/null || echo unknown)"
  claude_v="$(claude --version 2>/dev/null | head -1 || echo unknown)"
  local payload
  payload=$(cat <<JSON
{
  "device_id": "${device_id}",
  "event": "installed",
  "hw_tier": "${tier}",
  "ram_gb": ${ram:-0},
  "platform": "${os}-${arch}",
  "node_version": "${node_v}",
  "claude_code_version": "${claude_v}",
  "setup_version": "${MOOTER_VERSION}",
  "ts": "${ISO_NOW}"
}
JSON
)
  if dry "POST ${HUB_URL}/api/device-heartbeat"; then return 0; fi
  local resp
  resp="$(curl -fsS -m 5 -X POST -H 'Content-Type: application/json' \
         -d "${payload}" "${HUB_URL}/api/device-heartbeat" 2>/dev/null || echo 'FAIL')"
  if echo "${resp}" | grep -q '"ok":true'; then
    ok "Hub acknowledged install (${device_id:0:8}…)"
  else
    warn "Heartbeat didn't reach hub — non-fatal."
  fi
}

run_doctor() {
  step "Health check"
  local doc="${CLAUDE_DIR}/tools/router/frugal-doctor.js"
  if [ -f "${doc}" ]; then
    node "${doc}" --fix || warn "Doctor finished with warnings"
  else
    [ -f "${CLAUDE_DIR}/tools/router/classify.js" ] && ok "classify.js installed"
    [ -f "${CLAUDE_DIR}/settings.json" ]            && ok "settings.json present"
    [ -f "${MOOTER_DIR}/device.id" ]                && ok "device.id set"
  fi
}

run_uninstall() {
  step "Uninstalling mooter runtime"
  if [ ! -d "${CLAUDE_DIR}/tools/router" ]; then
    warn "Nothing to uninstall."; exit 0
  fi
  local bak="${BACKUP_ROOT}/mooter-uninstall-${ISO_NOW}"
  mkdir -p "${bak}"
  cp -a "${CLAUDE_DIR}/tools/router/decisions.log" "${bak}/" 2>/dev/null || true
  cp -a "${CLAUDE_DIR}/tools" "${bak}/tools" 2>/dev/null || true
  cp -a "${CLAUDE_DIR}/settings.json" "${bak}/settings.json" 2>/dev/null || true
  ok "Preserved decisions.log + snapshot in ${bak}"
  rm -rf "${CLAUDE_DIR}/tools/router"
  rm -rf "${CLAUDE_DIR}/hooks/mooter"* 2>/dev/null || true
  ok "Runtime removed. Claude Code continues normally."
  exit 0
}

print_summary() {
  local device_id
  device_id="$(cat "${MOOTER_DIR}/device.id" 2>/dev/null || echo '—')"
  cat <<EOF

  ┌───────────────────────────────────────────────┐
  │  ${GREEN}${BOLD}✓ mooter is installed${RESET}                        │
  └───────────────────────────────────────────────┘

  Device id (anonymous): ${device_id:0:12}…
  Runtime:               ${CLAUDE_DIR}/tools/router
  Log:                   ${LOG_FILE}

  ${BOLD}Next steps:${RESET}

    1. Open a new Claude Code session:       claude
    2. Live routing + savings:               bash ${CLAUDE_DIR}/tools/router/statusline.sh
    3. Dashboard:                            https://mooter.ai/dashboard
    4. If anything looks off:                bash <(curl -fsSL https://mooter.ai/install.sh) --doctor

  Questions: paulo@mooter.ai

EOF
}

main() {
  banner
  info "Version: ${MOOTER_VERSION}  ·  DRY_RUN=${DRY_RUN}  ·  FORCE=${FORCE}"
  if [ "${UNINSTALL}" = 1 ]; then run_uninstall; fi
  if [ "${DOCTOR_ONLY}" = 1 ]; then run_doctor; exit 0; fi
  check_prereqs
  ensure_device_id >/dev/null
  download_runtime
  merge_settings
  setup_ollama
  run_subscription_wizard
  smoke_test
  send_heartbeat
  run_doctor
  print_summary
}

main "$@"
