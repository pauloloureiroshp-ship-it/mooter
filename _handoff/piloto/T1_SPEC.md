# T1 VISUAL — spec congelada (transcrita do §5 da v1.0 — "Moo Ranch")

> Transcrita VERBATIM da mensagem do Cowork/Paulo de 2026-08-06 (o §5 da v1.0 vive na
> conversa Cowork; este ficheiro é o transportador congelado). Não reescrever de memória.

## Prompt (idêntico nos 3 braços — protocolo v1.1 §3)

```
Build a single self-contained `index.html` (inline CSS/JS; three.js from CDN allowed) —
a playable 3D voxel garden game called "Moo Ranch": WASD moves a character on a 16×16
voxel field; click places/removes blocks (3 block types, selectable via hotbar 1-2-3);
day/night cycle (60s loop) with lighting change; a cow NPC that wanders and must be
fenced in to win; HUD with block count, timer, win state; 60 FPS target on a mid-range
GPU; works offline after first load except the CDN script; no build step, no external
assets, keyboard+mouse only.
```

## Artefacto esperado

- Caminho relativo na worktree do run: `moo-ranch/index.html`
- Tipo: página HTML autónoma (CSS/JS inline); única dependência de rede permitida =
  script three.js via CDN; nenhum outro asset externo

## DoD — 12 itens S/N (verificados pelo harness, NUNCA por LLM — v1.1 §4.1)

| # | Item (verbatim da v1.0) |
|---|---|
| 1 | Abre sem erros de consola |
| 2 | WASD move o personagem no campo 16×16 |
| 3 | Clique coloca bloco |
| 4 | Clique remove bloco |
| 5 | 3 tipos de bloco seleccionáveis via hotbar 1-2-3 |
| 6 | Ciclo dia/noite visível (loop 60s com mudança de iluminação) |
| 7 | A vaca NPC move-se sozinha |
| 8 | Condição de vitória dispara quando a vaca está cercada |
| 9 | HUD completo: contagem de blocos + timer + estado de vitória |
| 10 | FPS ≥ 50 medido no browser |
| 11 | Um único ficheiro index.html |
| 12 | Zero assets externos além do script three.js do CDN |

Implementação executável: `dod_checks.mjs` (mesmo id 1-12). Item 8 é `humano: true`
(cercar uma vaca errante com raycast-clicks não é automatizável com fiabilidade —
o harness reporta `n/d (humano)` e um humano marca S/N jogando, como o §4.1 permite).
Checks 2-7 são heurísticas de pixel-diff/luminância DECLARADAS como tal nos descs;
um humano pode sobrepor qualquer N heurístico jogando o artefacto (§4.1).
