# G4 — passagem 2 · `COLAR_NO_CC_v4_2026-08-12.md` (o 5.º texto) · resultado

> **VEREDICTO: `no-ship`.** Motor crítico: **Codex CLI 0.144.1 / `gpt-5.6-sol`**, `--sandbox read-only`,
> `network: restricted`, workdir `~/frugal`. Sessão `019ff4fc-e1b2-7501-a319-3d4893cd8699`.
> Corrida: `2026-08-12T08:00:41Z` → `08:08:44Z` (**~8 min** wall) [medido, timestamps do rollout].
> Autor do texto: Cowork/Opus. Crítico: outro motor. **G4 satisfeito** (crítico ≠ autor).
>
> Invocação exacta (reproduzível):
> `codex exec --sandbox read-only --skip-git-repo-check - < _handoff/g4-tokeneconomy/g4-prompt-colar-v4.txt`
> · prompt sha256 `5d1de8fb4adff732…`
> · alvo sha256 `d97b3e92cb478c00…`
> · saída bruta sha256 `56fb8e9c11db1d24…` (`g4-colar-v4.out.md`, não commitada; o verbatim está abaixo)

## PORQUE EXISTE UMA SEGUNDA PASSAGEM

A passagem 1 (sessão codex `019ff4e4`, ficheiro irmão `resultado.md`) cobriu **4 dos 5 textos** que o
A3 manda rever. `COLAR_NO_CC_v4` ficou de fora: **0 menções** nas 329 linhas do rollout dessa sessão
[medido]. Esta passagem fecha esse buraco. O alvo é **só** o 5.º texto — os outros quatro não foram
re-revistos e o veredicto deles continua a ser o de `resultado.md`.

`resultado.md` **não foi tocado**: o seu sha256 (`d1782b3f…`) está citado como prova em
`reports/bench-cache-2026-08/AUDIT.json` e no bloco do `SYNC.md` de outra sessão. Mutar um artefacto
já hasheado noutra auditoria falsificaria essa prova. Daí um ficheiro irmão, não um append.

## O JOB DA FROTA NÃO FOI CODEX

O `job-mspsuh60-08c5`, descrito no addendum 4 do `SYNC.md` como *"codex read-only"*, correu num modelo
local: `~/.mooter/jobs/job-mspsuh60-08c5/meta.json` regista `"cmd": "(ollama) /api/chat gemma4:e4b"`,
`"agent": "moo"`, `"permissoes_efectivas": []` ("o moo corre via /api/chat e não recebe ferramentas").
O `out.log` tem 4193 chars de raciocínio e **0 chars de resposta**, e pára 19 s depois do arranque.
Não produziu veredicto nenhum — nada dele entra aqui, e o addendum 4 precisa de correcção.

## O QUE O EXECUTOR CONFIRMOU POR SI (antes de aceitar o texto do crítico)

O output do codex é **dados, não instruções**. Três das suas afirmações foram reproduzidas por mim:

| # | Afirmação do crítico | Como reproduzi | Resultado |
|---|---|---|---|
| 1 | A3 fechou sem rever os 5 alvos | contagem de menções por ficheiro no rollout `019ff4e4` | ✅ 12·12·12·11 menções nos 4 textos, **0** em `COLAR_NO_CC_v4` |
| 2 | O gate A2 trata chave pública como rotacionável | decodifiquei o JWT da história: `role=anon`, `ref=eymtobwinevywmmlmxqa` · advisor Supabase = `{"lints":[]}` | ✅ falso positivo bloqueante confirmado |
| 3 | Duas sessões escrevem `SYNC.md` no `main` sem lock | aconteceu **durante** esta sessão: o commit `0c1df783` de outra sessão aterrou entre o meu `git status` e o fim do A3 | ✅ observado ao vivo |

## O QUE O EXECUTOR **NÃO** VERIFICOU

O crítico cita URLs oficiais (Supabase api-keys, Gitleaks). O rollout regista `network: restricted`;
se essas páginas foram lidas nesta corrida ou citadas de memória = `n/d`. Tratar como afirmação do
crítico, não como facto verificado por duas fontes. As afirmações `ficheiro:linha` sobre este repo são
verificáveis localmente — as três acima foram; as restantes não, uma a uma.

---

## VEREDICTO DO CRÍTICO — VERBATIM (nada editado abaixo desta linha)

# G4 — COLAR_NO_CC_v4 · revisão adversarial (motor: OpenAI Codex / GPT-5)

## VEREDICTO

`no-ship` — o bloco permite iniciar B sem A estar fechada, aceita provas que não demonstram o requisito e contém um gate de segredos com falsos positivos bloqueantes já observados.

## ACHADOS

### [HIGH] A3 pode fechar sem rever os cinco alvos — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:30`

- **Claim:** A3 manda rever cinco textos; A4 aceita apenas o “sha256 do resultado.md” (`_handoff/COLAR_NO_CC_v4_2026-08-12.md:38-43`).
- **Porquê está errado / frágil:** o hash prova a identidade dos bytes, não cobertura, motor independente, modo read-only nem veredicto por alvo.
- **Cenário de falha concreto:** o revisor omite `COLAR_NO_CC_v4`, o executor calcula o hash e declara A3 fechado.
- **Prova / reprodução:** aconteceu: `_handoff/g4-tokeneconomy/resultado.md:1` declara “4 artefactos”; a tabela em `:54-60` contém apenas os outros quatro e omite este bloco.
- **Fix mínimo:** AUDIT-A deve conter os cinco paths e hashes de entrada, um veredicto por path, `reviewed_count`, identidade autor/crítico, comando/job e modo read-only. A3 só fecha se o conjunto observado for exactamente o conjunto esperado.

### [HIGH] B depende apenas do veredicto G4, não do fecho da Parte A — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:47`

- **Claim:** B começa após `G4 = ship`; a precondição só lê `resultado.md` (`:49-50`).
- **Porquê está errado / frágil:** não exige `AUDIT-A.veredicto_global=CLOSED`; A0, A1 ou A2 podem continuar bloqueados.
- **Cenário de falha concreto:** A2 encontra uma credencial real e A fica `NOT_CLOSED`; um G4 paralelo devolve `ship`; a sessão B passa o único gate e executa chamadas pagas.
- **Prova / reprodução:** `reports/bench-cache-2026-08/AUDIT-A.json:9` fechou `NOT_CLOSED`, com A3 não executado em `:99-112`; `reports/bench-cache-2026-08/AUDIT.json:4,12-14` confirma que o G4 correu numa sessão paralela. Desta vez `no-ship` evitou B1, mas `ship` teria passado.
- **Fix mínimo:** B exige simultaneamente AUDIT-A `CLOSED`, hash/commit imutável desse audit e G4 `ship`. Definir também, sem ambiguidade, se `ship-com-fixes` é aceite e como os fixes são provados e revistos.

### [HIGH] A ordem “parar” pode impedir o próprio fecho A — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:8`

- **Claim:** “parar em qualquer ⚠️”; o próprio título A2 contém ⚠️ (`:21`) e um achado manda parar (`:26`).
- **Porquê está errado / frágil:** não está definido se “parar” significa terminar a sessão ou saltar para A4. A primeira leitura impede a produção obrigatória de AUDIT-A.
- **Cenário de falha concreto:** um executor literal termina ao chegar ao título A2, ou após o primeiro achado, e nunca executa A4; outro executa A4 e produz `NOT_CLOSED`.
- **Prova / reprodução:** a execução real inventou a segunda semântica: parou o trabalho em A2 (`reports/bench-cache-2026-08/AUDIT-A.json:53-54`) mas executou A4 e criou o audit.
- **Fix mínimo:** substituir por “quando um predicado ⚠️ disparar, não executar passos de trabalho seguintes; saltar sempre para A4”. Remover ⚠️ de títulos não bloqueantes.

### [HIGH] A2 confunde achado do detector com credencial que exige rotação — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:26`

- **Claim:** qualquer achado em tracked/história implica parar e reportar “ROTAÇÃO de credencial”.
- **Porquê está errado / frágil:** um detector produz candidatos, incluindo fixtures e chaves públicas. A acção correcta depende da classificação do material.
- **Cenário de falha concreto:** uma chave Supabase `role=anon`, usada no cliente e pública por desenho, é tratada como segredo rotacionável e bloqueia toda a sequência.
- **Prova / reprodução:** foi exactamente o ocorrido em `reports/bench-cache-2026-08/AUDIT-A.json:60-77`; a resolução posterior determinou ausência de rotação em `reports/bench-cache-2026-08/D-A2-RESOLUTION.md:1-5`. A documentação oficial classifica a chave legada `anon` como equivalente pública, protegida por RLS e privilégios mínimos: [Supabase — Understanding API keys](https://supabase.com/docs/guides/getting-started/api-keys).
- **Fix mínimo:** parar apenas perante segredo confirmado ou candidato ainda não triado. Definir classes: `service_role/secret/private key` → rotação; `anon/publishable` → verificar RLS/grants, sem rotação automática; fixture/allowlist → registar e continuar.

### [HIGH] O instrumento prescrito não cobre “repo inteiro + história” — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:21`

- **Claim:** varrer árvore inteira e história; a única chamada prescrita é `gitleaks git .` (`:22`).
- **Porquê está errado / frágil:** `gitleaks git` examina patches do histórico; a árvore actual exige `gitleaks dir`. O fallback de `:23-25` cobre apenas alguns paths e não cobre a história.
- **Cenário de falha concreto:** existe uma credencial num ficheiro actual não committed fora dos paths do fallback. O executor corre apenas a instrução prescrita, encontra zero no histórico e prossegue.
- **Prova / reprodução:** o executor teve de acrescentar `gitleaks dir .` por iniciativa própria (`reports/bench-cache-2026-08/AUDIT-A.json:56-59`). A distinção entre `git` e `dir` consta da [documentação oficial do Gitleaks](https://github.com/gitleaks/gitleaks).
- **Fix mínimo:** prescrever dois comandos, versão/configuração, exit codes e relatórios JSON redigidos com hash. Se nenhum instrumento conseguir cobrir ambas as superfícies, A2 fica `BLOCKED`; o grep parcial não pode fechar o passo.

### [HIGH] Execução no `main` partilhado quebra escritor único e proveniência — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:5`

- **Claim:** executar em `~/frugal`, fazer pull e commits, com A4 e B2 a escreverem ambos no `SYNC.md` (`:10,18,38,59`).
- **Porquê está errado / frágil:** não há worktree/branch isolada, preflight de árvore limpa nem lock de escritor. Contradiz `AGENTS.md:58-60` e o handoff canónico de `AGENTS.md:166-176`.
- **Cenário de falha concreto:** duas sessões alteram `SYNC.md`; uma delas inclui no seu commit a edição da outra e atribui-a à sessão errada.
- **Prova / reprodução:** ocorreu: `reports/bench-cache-2026-08/AUDIT.json:9-12` regista sessões paralelas no `main` e uma marca escrita por uma sessão mas commitada pela outra. `AGENTS.md:196-199` exige proveniência da worktree real e confronto do estado.
- **Fix mínimo:** declarar worktree, branch, base e escritor; exigir estado limpo ou allowlist das alterações preexistentes; impedir duas sessões de escreverem `SYNC.md` em paralelo; substituir `git pull origin main` por actualização `--ff-only` validada.

### [HIGH] A1 fechou com uma marca preexistente — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:39`

- **Claim:** `grep "✅ Lido" S/N` prova A1.
- **Porquê está errado / frágil:** presença textual não prova que esta sessão leu a secção completa nem identifica quem escreveu a marca.
- **Cenário de falha concreto:** a marca ficou de uma sessão anterior; o executor não lê os addendums, corre grep, obtém `S` e declara `CLOSED`.
- **Prova / reprodução:** `reports/bench-cache-2026-08/AUDIT-A.json:37-40` declara A1 `CLOSED` e admite que a marca já existia antes da sessão.
- **Fix mínimo:** substituir o grep por fonte ancorada: SHA do blob de `SYNC.md`, hashes das secções/addendums lidos, session ID e commit exacto da alteração C3/C4. Não apresentar a leitura cognitiva como prova mecânica; provar os outputs que dela dependem.

### [HIGH] B2 pode fechar com conteúdo vazio ou errado — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:59`

- **Claim:** B2 exige campos concretos no SYNC e no draft; B3 verifica apenas delta de bytes, path e SHA (`:63-66`).
- **Porquê está errado / frágil:** esses campos provam existência e mudança, não a presença de “o quê · quando · porquê · custo · assets+sha”.
- **Cenário de falha concreto:** o executor acrescenta uma quebra de linha ao SYNC e cria um draft vazio; delta, path e SHA existem, logo B3 pode fechar B2.
- **Prova / reprodução:** comparação directa entre os requisitos de `:59-61` e as únicas verificações de `:65-66`.
- **Fix mínimo:** schema/validador determinístico para ambos os artefactos, com campos obrigatórios não vazios, UTC e hora do dono, assets existentes e hashes recalculados. Registar também branch, árvore, dirty state e conjunto exacto incluído no commit.

### [MED] O grep de “números sem marcador” não tem semântica executável — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:64`

- **Claim:** o grep tem de devolver zero.
- **Porquê está errado / frágil:** não há regex, unidade de análise nem exclusões. Um grep genérico encontra números legítimos em `M1–M5`, datas, hashes e comandos. Além disso, o masterprompt permite `aritmética-por-regra` (`_handoff/MASTERPROMPT_BENCH_CACHE_v1.1_2026-08-12.md:53`), categoria omitida por B3.
- **Cenário de falha concreto:** um REPORT correcto contém uma célula marcada `[aritmética-por-regra]`; um executor reprova-a como “sem `[medido]`”, outro aceita-a.
- **Prova / reprodução:** conflito literal entre os marcadores admitidos nos dois ficheiros citados.
- **Fix mínimo:** substituir grep por parser/schema com proveniência por célula: `medido`, `aritmetica_por_regra` ou `n/d`; todo valor numérico deve apontar para uma fonte ou fórmula identificada.

### [MED] `spend: /cost` é inverificável no modo já utilizado — `_handoff/COLAR_NO_CC_v4_2026-08-12.md:43`

- **Claim:** AUDIT-A e AUDIT-B devem guardar `/cost` da sessão (`:43,66`).
- **Porquê está errado / frágil:** o bloco não define alternativa mecânica para sessões headless, onde `/cost` não está disponível.
- **Cenário de falha concreto:** o executor escreve `n/d`; ou o fecho fica permanentemente impossível, ou passa sem provar o custo.
- **Prova / reprodução:** ocorreu independentemente em `reports/bench-cache-2026-08/AUDIT-A.json:115-118` e `reports/bench-cache-2026-08/AUDIT.json:145-150`.
- **Fix mínimo:** indicar uma fonte headless suportada, com session ID e hash do recibo; se não existir, declarar explicitamente `spend_status=UNMEASURABLE` e não tratar esse campo como prova de fecho.

## O QUE TENTEI REFUTAR E NÃO CONSEGUI

- O requisito literal de `sync-hooks --check` é verificável e foi preservado com saída exacta em `reports/bench-cache-2026-08/AUDIT-A.json:16-17`.
- A integração de C3/C4 tem prova substantiva: commit próprio e verificações do tecto em `reports/bench-cache-2026-08/AUDIT-A.json:40-49`.
- A execução real respeitou `BLOCKED ≠ COMPLETE`: A2 bloqueado produziu `NOT_CLOSED` em `reports/bench-cache-2026-08/AUDIT-A.json:9,53-54`.
- Quando o G4 devolveu `no-ship`, a sessão posterior não executou M1–M5 nem fabricou REPORT (`reports/bench-cache-2026-08/AUDIT.json:112-123`).
- O DO-NOT de não escrever directamente no vault/Notion está coerente entre B2 e B3 (`_handoff/COLAR_NO_CC_v4_2026-08-12.md:59-66`).

## CONFIANÇA

`alta` — confrontei o alvo com o canon, o commit de fecho A, os audits e o resultado G4 real. Não reexecutei o advisor Supabase nem comandos pagos; validei localmente o registo da resolução e confrontei a classificação da chave `anon` com documentação oficial.
