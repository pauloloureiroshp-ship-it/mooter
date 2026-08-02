# Rotação do secret do GitHub OAuth — passo-a-passo para o Paulo

> Escrito pela frota na wave PRIME-0 (2026-08-01). **O agente não toca em credenciais** —
> regra dura. Isto é o guião; a execução é tua, ~10 min.
> A release 1.45.3 está travada por código até responderes: `RUN-RELEASE-1453.ps1` pára
> e pergunta, e aborta se a resposta não for `rodei` ou `vou rodar`.

## Porque isto é P0 e não polimento

O secret do OAuth App do GitHub esteve exposto em plaintext pela Management API da
Supabase (~abril 2026). **Não há confirmação de rotação em 3+ meses** de vault nem de
`SYNC.md`. Um secret de OAuth que vazou permite a quem o tenha trocar um `code` por
tokens em nome da app — ou seja, entrar como qualquer utilizador que aceite o fluxo.
Antes de existir cliente que pague, é a única falha que mata a confiança do produto de
véspera. Segurança provada > velocidade de release.

## O que eu verifiquei — e o que ficou por verificar (honesto)

| Verificação | Comando / fonte | Resultado |
|---|---|---|
| Advisors de segurança da Supabase | `get_advisors(eymtobwinevywmmlmxqa, security)` | `{"lints": []}` — **n/d, não "limpo"** (ver abaixo) |
| Advisors de performance | `get_advisors(eymtobwinevywmmlmxqa, performance)` | `{"lints": []}` — mesmo n/d |
| Estado do projecto | `get_project(eymtobwinevywmmlmxqa)` | `status: "INACTIVE"` (pausado) |
| Estado no `INFRA.md:243` | leitura do ficheiro | `✅ ACTIVE_HEALTHY` — **está desactualizado** |
| O secret continua exposto? | — | **n/d**: as ferramentas Supabase que tenho não expõem a config dos providers de auth |
| Houve exploração? | — | **n/d**: não tenho acesso aos logs do OAuth App do GitHub |

**Porque o `lints: []` é n/d e não bom sinal (G11 — validar o instrumento):** o projecto
está **INACTIVE**. Advisors correm contra a base de dados; num projecto pausado o vazio é
o esperado quer haja problemas quer não. Um negativo aqui é ausência de *medição*, não
ausência de *facto*. **Não trates este vazio como aprovação de segurança.** E há mais:
advisors olham para RLS/políticas da BD — **nunca** teriam apanhado um secret de OAuth.
Eram o instrumento errado para esta pergunta desde o início.

## Os dados da app (do `INFRA.md`, confirma no ecrã)

| Campo | Valor |
|---|---|
| App name | `Frugal` |
| Homepage URL | `https://landing-five-azure-16.vercel.app` |
| Callback URL | `https://eymtobwinevywmmlmxqa.supabase.co/auth/v1/callback` |
| Projecto Supabase | `eymtobwinevywmmlmxqa` (`frugal`, sa-east-1, **INACTIVE**) |

## Passo-a-passo (~10 min)

### 0 · Despausar o projecto (senão o passo 3 não grava)
- https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa → botão **Restore/Resume**.
- Espera ficar `ACTIVE_HEALTHY`. (Diz-me quando estiver e eu volto a correr os advisors
  com o instrumento a funcionar — aí o resultado passa a valer.)

### 1 · Gerar o secret novo no GitHub
- https://github.com/settings/developers → **OAuth Apps** → `Frugal`.
- **Generate a new client secret**. Copia-o **agora** — o GitHub só o mostra uma vez.
- **Ainda não apagues o antigo.** O GitHub deixa os dois coexistir; é isso que evita
  janela de downtime.

### 2 · Confirmar o Client ID
- Na mesma página, anota o **Client ID** (não é secreto, mas tem de casar no passo 3).

### 3 · Colar na Supabase
- https://supabase.com/dashboard/project/eymtobwinevywmmlmxqa/auth/providers → **GitHub**.
- Cola **Client ID** + **Client Secret** novo → **Save**.

### 4 · Provar que funciona ANTES de queimar o antigo
- Abre a landing em janela anónima → **Sign in with GitHub** → completa o login.
- Se falhar, volta ao passo 3 (o secret antigo ainda está vivo — não estás em baixo).

### 5 · Só agora: revogar o antigo
- GitHub → OAuth App `Frugal` → **Delete** no secret ANTIGO.
- Este é o passo que fecha o buraco. Sem ele, rodaste sem rodar.

### 6 · Registar que aconteceu
- Diz-me "rodei" e eu escrevo no vault canónico + `INFRA.md` com a data.
- Corrijo também o `INFRA.md:243` (diz `ACTIVE_HEALTHY`, a API diz `INACTIVE`).

## Enquanto não rodas

- A release **1.45.3 não sai** — o script aborta sozinho.
- O `.mcpb` já está construído e verificado localmente
  (`_handoff/mooter-v1453.mcpb`, 46 ficheiros, 903 640 B, sha256 `14b2a6b4a639c1b3…`);
  só falta o teu gatilho. *(O sha mudou face à 1ª construção — o bundle foi
  refeito depois de restaurar ficheiros-fonte que estavam revertidos na working
  tree. O `RUN-RELEASE-1453.ps1` reconstrói e reverifica sozinho, por isso o
  número aqui é informativo, não é o que o script compara.)*

## Depois de rodares — o que fica por fechar (não é desta wave)

1. **Onde mais vive este secret?** Vercel env vars, `.env` locais, worktrees antigas.
   Um secret rodado que ficou colado num `.env` de uma worktree volta a vazar no próximo `git add -A`.
2. **Detecção**: hoje não há nada que avise se voltar a acontecer. Candidato a
   scheduled task semanal (advisors + diff de providers), $0.
3. **O `INFRA.md` tem estado a divergir da realidade** — o `ACTIVE_HEALTHY` provou-o.
   Um doctor que confronte o ficheiro com as APIs vale mais do que outra revisão manual.
