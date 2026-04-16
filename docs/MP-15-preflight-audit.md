# MP-15 — Pre-Flight Audit: Validação End-to-End antes do MacBook

**Objectivo:** Produzir um relatório `AUDIT_REPORT_PRE_MACBOOK.md` com ✅/⚠️/❌ para cada check antes de instalar o frugal num segundo dispositivo (MacBook) e convidar amigos.

**Abordagem:** Script de auditoria autónomo que cobre 5 blocos. Não muda código de produção — só lê, testa e reporta.

**Output final:** `docs/AUDIT_REPORT_PRE_MACBOOK.md` + sumário no terminal.

---

## INSTRUÇÕES PARA O CLAUDE CODE

Lê este ficheiro inteiro antes de escrever qualquer código.

Cria um único ficheiro `tools/audit/preflight-audit.js` que quando executado com `node tools/audit/preflight-audit.js` corre os 5 blocos de auditoria em sequência e escreve o relatório.

---

## BLOCO 1 — Estrutura de Ficheiros e CLI

Verifica se todos os ficheiros críticos existem e estão completos.

**Checks a fazer:**

```
CORE FILES
├── tools/router/classify.js          → exists + exports classify()
├── tools/router/inject_context.js    → exists
├── tools/router/PostToolUse.js       → exists
├── tools/router/savings-tracker.js   → exists
├── tools/router/frugal-doctor.js     → exists + has --sync flag
├── tools/router/frugal-login.js      → exists
├── tools/router/patterns.js          → exists
├── tools/router/pricing.js           → exists
├── tools/router/gold-labels.json     → exists + is valid JSON + has at least 1 entry
└── tools/router/version.json         → exists + has .version field

LANDING FILES
├── landing/app/(app)/layout.tsx      → exists
├── landing/app/(app)/dashboard/page.tsx → exists
├── landing/app/(app)/settings/page.tsx  → exists
├── landing/app/(app)/admin/page.tsx     → exists
├── landing/app/api/me/route.ts          → exists
├── landing/app/api/profile/route.ts     → exists
├── landing/app/api/install-complete/route.ts → exists
├── landing/app/api/admin/stats/route.ts → exists
├── landing/app/auth/callback/route.ts   → exists
└── landing/middleware.ts                → exists

MIGRATIONS (docs only — confirm they exist, not execute)
├── landing/migrations/002_devices_table.sql → exists
└── landing/migrations/003_decisions_log.sql → exists

LOCAL STATE (on this machine)
├── ~/.frugal/auth.token    → exists + not empty + not expired (decode JWT exp field)
├── ~/.frugal/device.id     → exists + not empty + is UUID format
└── ~/.claude/settings.json → exists + has hooks configured
```

**Como verificar JWT expiry:**
```js
function isTokenExpired(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    return payload.exp < Math.floor(Date.now() / 1000);
  } catch { return true; }
}
```

---

## BLOCO 2 — Segurança e Auth

Verifica se os endpoints de segurança estão correctamente protegidos.

**Checks a fazer (HTTP requests reais para a Vercel em produção):**

```
BASE_URL = https://landing-five-azure-16.vercel.app

AUTH GUARD
├── GET /api/me (sem token)              → deve retornar 401
├── GET /api/profile?userId=xxx (sem token) → deve retornar 401
├── POST /api/install-complete (sem token)  → deve retornar 401
└── GET /api/admin/stats (sem token)        → deve retornar 401

ADMIN GUARD
└── GET /api/admin/stats (com token válido de user não-admin)
    → deve retornar 403 (se tiveres um segundo token de teste)
    → Se não tiveres segundo token, marcar como ⚠️ SKIP (manual)

CORS / HEADERS CHECK
├── GET /api/me → response tem 'content-type: application/json'
└── POST /api/install-complete → aceita 'Authorization: Bearer TOKEN' header
```

**Como fazer os requests:**
```js
const https = require('https');

async function httpGet(url, token) {
  return new Promise((resolve) => {
    const opts = new URL(url);
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const req = https.request({ hostname: opts.hostname, path: opts.pathname + opts.search, method: 'GET', headers }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(body), headers: res.headers }); }
        catch { resolve({ status: res.statusCode, body, headers: res.headers }); }
      });
    });
    req.on('error', () => resolve({ status: 0, error: true }));
    req.setTimeout(5000, () => { req.destroy(); resolve({ status: 0, timeout: true }); });
    req.end();
  });
}
```

---

## BLOCO 3 — Integridade de Dados (Supabase)

Lê o token local, chama os endpoints reais e verifica se os dados estão correctos.

**Checks a fazer:**

```
PROFILE INTEGRITY
├── GET /api/me → retorna userId e email (não null)
├── GET /api/profile?userId={userId} → retorna profile
│   ├── install_completed === true
│   ├── frugal_version !== null
│   ├── hardware_tier !== 'unknown'
│   └── devices array tem pelo menos 1 entrada
│
DEVICE INTEGRITY
└── profile.devices[0] (o device desta máquina)
    ├── device_id bate certo com ~/.frugal/device.id
    ├── decisions_count > 0
    ├── savings_usd > 0
    ├── os_type === process.platform (win32 / darwin / linux)
    └── last_sync_at é recente (< 7 dias)

ADMIN STATS INTEGRITY (só se token for admin)
└── GET /api/admin/stats → retorna
    ├── totalUsers >= 1
    ├── totalDevices >= 1
    ├── totalDecisions > 0
    └── funnel.installed >= 1

DATA CONSISTENCY
└── decisions_count no device == decisions no savings-tracker local
    (GET http://127.0.0.1:7821/metrics → compare m.prompts vs device.decisions_count)
    → Diferença > 20% = ⚠️ WARNING (sync pode estar atrasado)
    → Diferença > 80% = ❌ ERROR
```

---

## BLOCO 4 — Algorithm Feedback Loop

Verifica se o algoritmo de routing está a aprender com dados reais.

**Checks a fazer:**

```
CLASSIFY LOOP
├── gold-labels.json tem entradas?
│   ├── 0 entradas → ❌ sem dados para aprender
│   ├── 1-9 entradas → ⚠️ poucos dados
│   └── 10+ entradas → ✅ suficiente para backtest
│
├── Corre classify.js com 3 prompts de teste e verifica output:
│   ├── "muda a cor do botão para azul" → deve ser T0 (conf > 0.6)
│   ├── "redesenha a arquitectura do vault para multi-user" → deve ser T3
│   └── "porque é que o websocket reconnect falha às vezes" → deve ser T2
│   → Para cada: verifica que retorna { task_category, recommended_backend, confidence }
│
TUNED BLOCK
└── classify.js tem TUNED_COMPLEXITY_THRESHOLD definido?
    → Ler o ficheiro e verificar se o TUNED-BLOCK-START existe (auto-gerado pelo update-router.js)
    → Se existir + sample_size > 0 → ✅ router já foi tunado com dados reais

DECISIONS LOG
└── ~/.claude/tools/router/decisions.log existe?
    ├── Conta as linhas (deve ser > 0)
    ├── Lê as últimas 3 linhas e verifica que são JSON válido
    └── Verifica que cada linha tem: { tier, model, prompt_hash, timestamp }

BACKTEST CAPABILITY
└── backtest.js existe + tools/router/gold-labels.json tem entradas
    → Se ambos existem → ✅ pode correr backtest
```

**Como correr classify.js para teste:**
```js
const { execSync } = require('child_process');
function testClassify(prompt) {
  try {
    const result = execSync(`echo ${JSON.stringify(prompt)} | node tools/router/classify.js`, 
      { cwd: REPO_ROOT, timeout: 3000 }).toString();
    return JSON.parse(result);
  } catch { return null; }
}
```

---

## BLOCO 5 — UX/UI e Conectividade

Verifica se os endpoints públicos respondem e se o hub está vivo.

**Checks a fazer:**

```
VERCEL ENDPOINTS LIVE
├── GET https://landing-five-azure-16.vercel.app → status 200
├── GET https://landing-five-azure-16.vercel.app/dashboard → status 200 (ou redirect)
└── GET https://landing-five-azure-16.vercel.app/api/me → status 401 (sem token = esperado)

HUB CONNECTIVITY
└── GET https://frugal-hub.frugal-hub.workers.dev/health → status 200

LOCAL SERVICES
├── GET http://127.0.0.1:7821/health → status 200 (savings-tracker)
│   └── Se falhar: ⚠️ tracker não está a correr — savings não actualizam
└── GET http://127.0.0.1:7822/health → não precisa de estar vivo (só durante login)

AUTH FLOW COMPLETENESS
├── /auth/callback/route.ts → tem bridge HTML para CLI flow? (ler o ficheiro)
├── frugal-login.js → abre browser + escuta :7822? (ler o ficheiro, verificar porta 7822)
└── ~/.frugal/auth.token → token não expirado (já verificado no Bloco 1)

MACBOOK READINESS CHECKLIST (checks manuais — marcar como ⏳ PENDING)
├── [ ] Node.js instalado no MacBook
├── [ ] Git clone do repo no MacBook
├── [ ] npm install corrido
├── [ ] .claude/settings.json configurado com os hooks
├── [ ] frugal-login.js executado → token em ~/.frugal/auth.token
└── [ ] frugal-doctor --sync → "✓ profile updated" com novo device_id
```

---

## FORMATO DO RELATÓRIO

O script deve escrever `docs/AUDIT_REPORT_PRE_MACBOOK.md` com este formato:

```markdown
# Frugal Pre-Flight Audit Report
**Gerado em:** [timestamp]
**Máquina:** [os.hostname()] ([process.platform] [process.arch])
**Frugal version:** [version]

## Sumário
| Bloco | Total | ✅ Pass | ⚠️ Warn | ❌ Fail |
|---|---|---|---|---|
| B1 — Ficheiros e CLI | N | N | N | N |
| B2 — Segurança e Auth | N | N | N | N |
| B3 — Integridade de Dados | N | N | N | N |
| B4 — Feedback Loop | N | N | N | N |
| B5 — UX/UI Conectividade | N | N | N | N |
| **TOTAL** | **N** | **N** | **N** | **N** |

**Veredicto:** ✅ READY FOR MACBOOK / ⚠️ REVIEW WARNINGS / ❌ BLOCKERS FOUND

---

## B1 — Ficheiros e CLI
[lista de checks com ícone + descrição + valor encontrado]

## B2 — Segurança e Auth
[...]

## B3 — Integridade de Dados
[...]

## B4 — Feedback Loop
[...]

## B5 — UX/UI Conectividade
[...]

---

## Bloqueadores (❌)
[lista de tudo o que falhou com descrição clara]

## Avisos (⚠️)
[lista de tudo o que merece atenção mas não bloqueia]

## Pendentes Manuais (⏳)
[checklist do MacBook]
```

---

## IMPLEMENTAÇÃO DO SCRIPT

### Ficheiro: `tools/audit/preflight-audit.js`

**Estrutura do script:**

```js
#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');

const REPO_ROOT = path.resolve(__dirname, '../..');
const HOME = os.homedir();
const FRUGAL_DIR = path.join(HOME, '.frugal');

// Resultado acumulado
const results = { B1: [], B2: [], B3: [], B4: [], B5: [] };

function check(block, icon, label, detail = '') {
  results[block].push({ icon, label, detail });
  const sym = icon === '✅' ? '✅' : icon === '⚠️' ? '⚠️' : '❌';
  console.log(`  ${sym} ${label}${detail ? ': ' + detail : ''}`);
}

// ... implementa cada bloco como função async ...

async function main() {
  console.log('\n🔍 frugal Pre-Flight Audit\n');
  
  console.log('\n── B1: Ficheiros e CLI ──');
  await runB1();
  
  console.log('\n── B2: Segurança e Auth ──');
  await runB2();
  
  console.log('\n── B3: Integridade de Dados ──');
  await runB3();
  
  console.log('\n── B4: Feedback Loop ──');
  await runB4();
  
  console.log('\n── B5: UX/UI Conectividade ──');
  await runB5();
  
  generateReport();
  
  // Print verdict
  const allFails = Object.values(results).flat().filter(r => r.icon === '❌');
  const allWarns = Object.values(results).flat().filter(r => r.icon === '⚠️');
  
  console.log('\n══════════════════════════════════════');
  if (allFails.length === 0 && allWarns.length === 0) {
    console.log('✅ READY FOR MACBOOK — zero blockers, zero warnings');
  } else if (allFails.length === 0) {
    console.log(`⚠️  REVIEW ${allWarns.length} WARNING(S) — no blockers`);
  } else {
    console.log(`❌ ${allFails.length} BLOCKER(S) FOUND — fix before MacBook`);
  }
  console.log('📄 Relatório completo: docs/AUDIT_REPORT_PRE_MACBOOK.md');
  console.log('══════════════════════════════════════\n');
}

main().catch(console.error);
```

---

## RESTRIÇÕES ABSOLUTAS

1. O script é **read-only** — não muda nenhum ficheiro de produção
2. Não chama `frugal-doctor --sync` (evitar side-effects)
3. Não escreve para Supabase (só lê)
4. Timeout máximo de 5s por request HTTP
5. Se um bloco falhar a correr (ex: não há token), marca todos os seus checks como ⚠️ SKIP com razão
6. O script deve correr até ao fim mesmo com erros — nunca `process.exit(1)` no meio

## COMO EXECUTAR

```bash
node tools/audit/preflight-audit.js
```

Depois de escrever o script, executa-o uma vez e inclui o output real no relatório.
Faz commit do script + relatório: `"audit: pre-flight audit script + report (MP-15)"`
