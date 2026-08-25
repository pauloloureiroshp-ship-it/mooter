#!/bin/zsh
# Health-check da frota neste device. SO LEITURA: nao reinicia nada, nao faz git write.
# Uso: duplo-clique no Finder. Saida: _handoff/verificar-frota.log
cd "$(dirname "$0")/../.."
REPO="$PWD"
VAULT="${VAULT_PATH:-$HOME/paulo-vault}"
LOG="_handoff/verificar-frota.log"
{
  echo "=== verificar-frota $(date -u +%Y-%m-%dT%H:%M:%SZ) · $(hostname) ==="

  echo "--- cockpit ---"
  RPID=$(cat "$HOME/.mooter/runner.lock" 2>/dev/null)
  if [ -n "$RPID" ] && kill -0 "$RPID" 2>/dev/null; then echo "runner: vivo PID $RPID"; else echo "runner: EM BAIXO (lock='${RPID:-nenhum}')"; fi
  F10=$(lsof -ti tcp:4290 -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  echo "f10 :4290: ${F10:-EM BAIXO}"
  [ -e "$HOME/.mooter/STOP" ] && echo "STOP: BAIXADO" || echo "STOP: levantado"
  echo "ledger: $(wc -l < "$HOME/.mooter/runner-ledger.jsonl" 2>/dev/null) linhas · ultima: $(tail -1 "$HOME/.mooter/runner-ledger.jsonl" 2>/dev/null | cut -c1-40)"

  echo "--- /fleet.json ---"
  curl -s --max-time 10 http://127.0.0.1:4290/fleet.json | node -e '
    let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
      try { const j=JSON.parse(s); const f=j.frota||{};
        console.log("remoto:", JSON.stringify(f.remoto||null), "| conector(repo):", j.connector||j.conector||"n/d");
        for (const d of (f.frota||[])) {
          // Os campos sao os que o beacon escreve HOJE: `conector` e `codigo`.
          // Ate 2026-08-24 isto lia um `paridade.*` que nunca chegou ao tronco
          // — imprimia "n/d" em todas as colunas e ninguem reparava.
          const c=d.conector||{}, k=d.codigo||{};
          const a=d.autenticidade||{};
          console.log(" ", d.device, d.self?"(self)":"      ", "via="+d.via, d.frescura.estado, d.frescura.idade_s+"s",
            "| conector", c.instalado||"n/d", "/ repo", c.repo||"n/d",
            "| sha", (k.sha_carregado||"n/d"), k.desactualizado ? "(STALE, disco="+(k.sha_disco||"n/d")+")" : "",
            "| sig", a.ok ? "ok" : (a.codigo||"n/d"));
        }
        if ((f.rejeitados||[]).length) {
          console.log(" rejeitados (beacons que NAO entraram):");
          for (const r of f.rejeitados) console.log("   ", r.ficheiro, r.device, r.codigo, "-", r.motivo);
        }
      } catch(e) { console.log("fleet.json ilegivel:", e.message, s.slice(0,120)); }
    })'

  echo "--- conector no Claude Desktop (so leitura) ---"
  REG="$HOME/Library/Application Support/Claude/extensions-installations.json"
  if [ -f "$REG" ]; then
    node -e '
      const fs=require("fs"), path=require("path");
      const reg=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
      const exts=Object.entries(reg.extensions||{}).filter(([k,v])=>JSON.stringify(v).toLowerCase().includes("mooter"));
      if(!exts.length) console.log("registo: nenhuma extensao mooter");
      for (const [id,e] of exts) {
        const dir = e.installedPath || e.path || e.extensionPath || null;
        let man=null; if(dir){ try{ man=JSON.parse(fs.readFileSync(path.join(dir,"manifest.json"),"utf8")).version }catch{} }
        console.log("registo:", id, "| versao no registo:", e.version, "| pasta:", dir||"n/d", "| manifest.json na pasta:", man||"n/d", "| enabled:", e.enabled);
      }' "$REG"
  else echo "registo: ficheiro nao encontrado em $REG"; fi
  CE="$HOME/Library/Application Support/Claude/Claude Extensions"
  if [ -d "$CE" ]; then
    for m in "$CE"/*/manifest.json; do
      grep -qi mooter "$m" 2>/dev/null && echo "pasta: $(basename "$(dirname "$m")") · manifest version: $(node -e 'console.log(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).version)' "$m")"
    done
  fi

  echo "--- vault (so leitura, sem locks) ---"
  cd "$VAULT" && {
    [ -e .git/index.lock ] && echo "index.lock: PRESENTE $(stat -f '%Sm' .git/index.lock)" || echo "index.lock: ausente"
    git --no-optional-locks status --short | grep -v '^??' | head -5
    git --no-optional-locks log -3 --format='%h %ci %s' -- 50-fleet/
    echo "origin/main: $(git --no-optional-locks log -1 --format='%h %ci' origin/main)"
  }
  echo "--- regra de eco: um handoff sem RELATORIO em 24h e um FALHO DECLARADO ---"
  # Porque existe: um pacote entregue a um agente e um pacote que ninguem sabe
  # se correu. Ate agora o silencio lia-se como "esta a correr"; le-se, com a
  # mesma probabilidade, como "morreu na primeira linha e ninguem reparou".
  # A regra e simples e mecanica: 24 h sem eco = falho, ate prova em contrario.
  # Nao acusa ninguem — declara. Um falho declarado e trabalho; um falho em
  # silencio e uma frota a fingir que trabalha.
  cd "$REPO" && node -e '
    const fs=require("fs"), path=require("path");
    const dir="_handoff", H=24*3600*1000, agora=Date.now();
    let pacotes=[];
    try { pacotes=fs.readdirSync(dir).filter(n=>n.endsWith(".md")); } catch { console.log("  _handoff/ ilegivel"); process.exit(0); }
    const falhos=[], vivos=[];
    for (const n of pacotes) {
      const p=path.join(dir,n);
      let txt="", st=null;
      try { txt=fs.readFileSync(p,"utf8"); st=fs.statSync(p); } catch { continue; }
      // O eco pode estar no proprio pacote (a forma barata) ou num ficheiro
      // irmao `*-RELATORIO.md` / `*-progress.md`. Qualquer das duas conta.
      const temEco = /RELAT[OÓ]RIO|^\s*##?\s*RESULTADO|STATUS:\s*(feito|concluid)/im.test(txt)
        || pacotes.some(o=>o!==n && o.startsWith(n.replace(/\.md$/,"")) && /RELATORIO|progress/i.test(o));
      const idadeH=(agora-st.mtimeMs)/3600000;
      if (temEco) vivos.push(n);
      else if (idadeH>24) falhos.push([n, Math.round(idadeH)]);
    }
    console.log("  pacotes: "+pacotes.length+" · com eco: "+vivos.length+" · FALHOS DECLARADOS: "+falhos.length);
    for (const [n,h] of falhos.sort((a,b)=>b[1]-a[1]).slice(0,10)) console.log("    falho ("+h+"h sem relatorio): "+n);
    if (falhos.length>10) console.log("    ... e mais "+(falhos.length-10));
  '

  cd "$REPO" && {
    echo "--- repo ---"
    [ -e .git/index.lock ] && echo "index.lock: PRESENTE" || echo "index.lock: ausente"
    echo "HEAD: $(git --no-optional-locks log -1 --format='%h %ci')"
    git --no-optional-locks status --short | head -12
  }
  echo "=== fim ==="
} >> "$LOG" 2>&1
