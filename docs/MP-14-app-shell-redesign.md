# MP-14 — App Shell Redesign: Área Logada Profissional

**Objectivo:** Transformar `/dashboard` e `/admin` de páginas soltas num produto web coeso com shell de navegação, design system consistente, admin integrado, settings e UX de qualidade.

**Princípio:** Zero breaking changes. Todas as APIs existentes mantêm-se. Só HTML/CSS/TSX muda.

**Stack actual:** Next.js 15 App Router · `globals.css` com design tokens dark (`--bg: #080808`, `--accent: #4ec9b0`) · `sb-access-token` cookie · ADMIN_EMAIL = `paulo.loureiro.shp@gmail.com`

---

## PEÇA 1 — App Shell: Layout com sidebar + top bar

### Ficheiro: `landing/app/(app)/layout.tsx` (NOVO — route group)

Cria um route group `(app)` que envolve todas as páginas autenticadas. Move `dashboard`, `admin` e `settings` para dentro deste grupo.

```
landing/app/
  (app)/
    layout.tsx          ← shell com sidebar
    dashboard/
      page.tsx          ← (mover de /app/dashboard/page.tsx)
    settings/
      page.tsx          ← (novo)
    admin/
      page.tsx          ← (mover de /app/admin/page.tsx)
  page.tsx              ← landing (mantém-se)
  layout.tsx            ← root layout (mantém-se)
```

### O que o layout deve fazer:

1. **Verificar autenticação** — se não há `sb-access-token` cookie, redirect para `/` com `?login=required`
2. **Carregar perfil mínimo** — email + is_admin (email === ADMIN_EMAIL) via `/api/profile`
3. **Renderizar sidebar** com:
   - Logo frugal (topo esquerdo) — `f` em verde `--accent`
   - Links de navegação:
     - Dashboard (ícone: grid)
     - Settings (ícone: gear)
     - Admin ⚙️ — **só visível se is_admin === true**
   - Rodapé da sidebar: avatar/email do utilizador + botão Logout
4. **Top bar** (linha fina no topo):
   - Título da página actual (breadcrumb simples)
   - Badge de versão frugal se disponível (`v0.9.8`)

### Design da sidebar:

```css
/* Sidebar: 220px fixa no desktop, colapsável em mobile */
width: 220px;
background: var(--surface);        /* #111 */
border-right: 1px solid var(--border);  /* #222 */
height: 100vh;
position: fixed;
left: 0; top: 0;

/* Nav links */
.nav-link {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-radius: 6px;
  color: var(--muted);
  font-size: 0.875rem;
  transition: background 0.15s, color 0.15s;
}
.nav-link:hover, .nav-link.active {
  background: var(--surface-2);
  color: var(--text);
}
.nav-link.active {
  color: var(--accent);
}

/* Main content area */
.app-main {
  margin-left: 220px;
  padding: 32px 40px;
  min-height: 100vh;
  background: var(--bg);
}
```

### Ícones SVG inline (sem dependências):

```tsx
// Dashboard icon
<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <rect x="1" y="1" width="6" height="6" rx="1"/>
  <rect x="9" y="1" width="6" height="6" rx="1"/>
  <rect x="1" y="9" width="6" height="6" rx="1"/>
  <rect x="9" y="9" width="6" height="6" rx="1"/>
</svg>

// Settings icon
<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 10a2 2 0 100-4 2 2 0 000 4z"/>
  <path d="M13.4 8a5.4 5.4 0 01-.05.7l1.5 1.2-1.4 2.4-1.8-.7a5 5 0 01-1.2.7l-.3 1.9H6.8l-.3-1.9a5 5 0 01-1.2-.7l-1.8.7-1.4-2.4 1.5-1.2A5.4 5.4 0 012.6 8a5.4 5.4 0 01.05-.7L1.1 6.1l1.4-2.4 1.8.7a5 5 0 011.2-.7L5.8 1.8h2.4l.3 1.9a5 5 0 011.2.7l1.8-.7 1.4 2.4-1.5 1.2c.04.23.05.46.05.7z"/>
</svg>

// Admin icon
<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
  <path d="M8 1L2 4v4c0 3.3 2.5 6.4 6 7.2C11.5 14.4 14 11.3 14 8V4L8 1zm3 8.3l-.7.7L8 7.7l-2.3 2.3-.7-.7L7.3 7 5 4.7l.7-.7L8 6.3l2.3-2.3.7.7L8.7 7l2.3 2.3z"/>
</svg>
```

---

## PEÇA 2 — Dashboard redesenhado (dentro do shell)

### Ficheiro: `landing/app/(app)/dashboard/page.tsx`

Mantém **toda a lógica existente** (fetch, cfgVal, aggregateDevices, etc.). Apenas reestrutura o layout em tabs.

### Estrutura de tabs:

```
[Overview]  [Devices]  [Setup Guide]
```

#### Tab Overview:
- **Savings Hero** (full width, destaque): `$72.83 saved · 409 decisions · 69% routed away from Opus`
  - Fundo com gradiente subtil `var(--accent)` a 10% opacity
  - Números grandes em `--accent`
- **AI Stack** (3 colunas): Anthropic / Ollama / OpenAI — com status ativo/inativo e checkmark
- **Health bar**: linha com 4 indicadores — Router ✓ · Hook ✓ · Tracker ✓ · Sync ✓ (ou ✗ com cor vermelha)

#### Tab Devices:
- Lista de dispositivos com cards individuais
- Cada card: OS icon + device name + hw_tier + última sync + decisões nesse device
- Se só 1 device: mostra o card mesmo assim (remover a condição `devices.length < 2`)

#### Tab Setup Guide:
- Wizard de 3 steps com estado de completion real:
  - Step 1: Install frugal — `✓ Done` se `install_completed`
  - Step 2: First sync — `✓ Done` se `decisions_count > 0`
  - Step 3: Configure Ollama — `✓ Done` se `has_ollama`
- Para cada step incompleto: bloco de código com comando copy-paste
- Terminal mockup para o Step 1:

```tsx
// Terminal mockup component
function TerminalBlock({ lines }: { lines: string[] }) {
  return (
    <div style={{
      background: '#0d0d0d',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '12px 16px',
      fontFamily: 'var(--mono)',
      fontSize: '0.8rem',
      lineHeight: 1.6,
    }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f47373', display: 'inline-block' }}/>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#dcdcaa', display: 'inline-block' }}/>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: '#23d18b', display: 'inline-block' }}/>
      </div>
      {lines.map((line, i) => (
        <div key={i} style={{ color: line.startsWith('✓') ? '#23d18b' : line.startsWith('❯') ? '#4ec9b0' : '#ccc' }}>
          {line}
        </div>
      ))}
    </div>
  );
}
```

Usar assim no Setup Guide:
```tsx
<TerminalBlock lines={[
  '❯ frugal-doctor --sync',
  '  frugal doctor — health check',
  '  win32 · x64 · Node v24',
  '  ✓ Core Files         10/10',
  '  ✓ Hook               active',
  '  ✓ Savings %          69%',
  '  ✓ profile updated',
]} />
```

### CSS classes para os cards do dashboard:

```css
/* Adicionar ao globals.css */

/* App shell */
.app-sidebar {
  width: 220px;
  background: var(--surface);
  border-right: 1px solid var(--border);
  height: 100vh;
  position: fixed;
  left: 0; top: 0;
  display: flex;
  flex-direction: column;
  z-index: 100;
}

.app-main {
  margin-left: 220px;
  padding: 32px 40px;
  min-height: 100vh;
}

/* Tabs */
.app-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 24px;
}

.app-tab {
  padding: 8px 16px;
  font-size: 0.875rem;
  color: var(--muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}

.app-tab:hover { color: var(--text); }
.app-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

/* Savings hero */
.savings-hero {
  background: linear-gradient(135deg, rgba(78,201,176,0.08) 0%, transparent 60%);
  border: 1px solid rgba(78,201,176,0.2);
  border-radius: 12px;
  padding: 28px 32px;
  margin-bottom: 20px;
  display: flex;
  gap: 48px;
  align-items: center;
}

.savings-hero-number {
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--accent);
  line-height: 1;
  font-family: var(--mono);
}

.savings-hero-label {
  font-size: 0.75rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-top: 4px;
}

/* Status pill */
.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 10px;
  border-radius: 100px;
  font-size: 0.75rem;
  font-weight: 500;
}

.status-pill.ok {
  background: rgba(35,209,139,0.1);
  color: #23d18b;
}

.status-pill.warn {
  background: rgba(220,220,170,0.1);
  color: var(--yellow);
}

.status-pill.err {
  background: rgba(244,71,71,0.1);
  color: #f47373;
}
```

---

## PEÇA 3 — Settings page (nova)

### Ficheiro: `landing/app/(app)/settings/page.tsx`

Página simples com 3 secções:

#### Secção "Profile"
- Avatar (inicial do email em círculo verde)
- Email (readonly)
- GitHub username (se existir, link para github.com/username)
- Experience level
- Botão "Logout" (vermelho suave)

#### Secção "Subscription"
- Badges das subscriptions activas (Anthropic Max, OpenAI, etc.)
- Se vazio: "No subscriptions detected — run `frugal-doctor` to auto-detect"

#### Secção "Devices"
- Lista de todos os devices com possibilidade de ver device_id
- Badge "This device" no device actual (comparar com `localStorage.getItem('frugal_device_id')` se disponível, ou mostrar o mais recente)

#### Logout:
```tsx
async function handleLogout() {
  // Limpar cookie sb-access-token
  document.cookie = 'sb-access-token=; max-age=0; path=/';
  window.location.href = '/';
}
```

---

## PEÇA 4 — Admin integrado (tab extra, não página separada)

### Mudança de abordagem:

Em vez de `/admin` ser uma página separada, o admin fica como **tab extra** dentro do layout shell. A rota `/admin` mantém-se por backward compat mas redireciona para `/dashboard?tab=admin` para utilizadores admin.

**OU** (mais simples): mantém `/admin` como página dentro do `(app)` route group, mas agora tem o shell sidebar igual às outras páginas. A sidebar mostra o link "Admin" com ícone de shield só se `is_admin`.

**Recomendo a segunda opção** — zero refactor, só mover o ficheiro.

### O que fazer:
1. Mover `landing/app/admin/page.tsx` → `landing/app/(app)/admin/page.tsx`
2. O shell layout já faz auth check e injeta a sidebar
3. A página admin herda automaticamente o shell

---

## PEÇA 5 — Página de login integrada no flow

### Ficheiro: `landing/app/(app)/layout.tsx` — auth guard

No layout, se o utilizador não estiver autenticado, renderiza uma tela de login inline (em vez de redirect abrupto):

```tsx
// Se não autenticado, mostrar modal de login centrado
if (!user) {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontSize: '2rem', marginBottom: 16 }}>🌿</div>
        <h1 style={{ fontSize: '1.5rem', marginBottom: 8 }}>frugal</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 24 }}>Sign in to access your dashboard</p>
        <a href="/api/auth/github" style={{
          display: 'inline-flex', alignItems: 'center', gap: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          padding: '10px 20px', borderRadius: 8, fontSize: '0.9rem',
        }}>
          {/* GitHub SVG icon */}
          Continue with GitHub
        </a>
      </div>
    </div>
  );
}
```

---

## PEÇA 6 — Mobile responsive

Adicionar ao globals.css:

```css
@media (max-width: 768px) {
  .app-sidebar {
    width: 100%;
    height: auto;
    position: relative;
    flex-direction: row;
    padding: 0 16px;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
  
  .app-main {
    margin-left: 0;
    padding: 16px 20px;
  }
  
  .savings-hero {
    flex-direction: column;
    gap: 20px;
    padding: 20px;
  }
}
```

---

## ORDEM DE EXECUÇÃO — não saltar etapas

```
PEÇA 1 → PEÇA 2 → PEÇA 3 → PEÇA 4 → PEÇA 5 → PEÇA 6
```

Depois de cada peça: `npx tsc --noEmit` tem de passar limpo antes de avançar.

---

## CHECKLIST FINAL

- [ ] `/dashboard` tem sidebar com links funcionais
- [ ] Admin link só aparece para paulo.loureiro.shp@gmail.com
- [ ] `/settings` carrega com profile data real
- [ ] `/admin` tem o mesmo shell que `/dashboard`
- [ ] TerminalBlock aparece no Setup Guide com linhas coloridas
- [ ] Savings Hero mostra números reais (não hardcoded)
- [ ] Logout limpa cookie e vai para `/`
- [ ] `npx tsc --noEmit` passa sem erros
- [ ] Zero dependências npm novas adicionadas

---

## RESTRIÇÕES ABSOLUTAS

1. **NÃO mudar** nenhuma API route (`/api/*`)
2. **NÃO mudar** a lógica de fetch/auth nas páginas existentes — só o JSX de render
3. **NÃO instalar** shadcn, Tailwind, ou qualquer biblioteca de UI
4. **NÃO quebrar** a landing page (`/`) — está fora do `(app)` route group
5. Todos os estilos em inline style ou `globals.css` existente — sem CSS modules novos
