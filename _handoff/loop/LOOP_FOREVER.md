# Loop a trabalhar sozinho PARA SEMPRE — a solucao permanente

## O gargalo real (e a sua cura)
Nunca foi o loop — foi o **arranque**: precisava de alguem para (re)iniciar o runner.
Cura definitiva: instalar o runner como **servico de fundo auto-curavel**, UMA vez na vida.
Depois sobrevive a reboots e a crashes, e corre sozinho para sempre.

## 3 propriedades que tornam isto "forever"
1. **Auto-restart** — pm2 (ou Task Scheduler) reinicia o runner em crash e no arranque do PC.
2. **Nunca morre num erro** — cada ronda em try/catch + backoff; heartbeat.json prova que esta vivo;
   uma falha transitoria (claude/ollama/rede) NAO mata o loop (provado em DRY_RUN).
3. **Resume** — STATE.json + sessionId (--resume): retoma a wave onde estava apos reiniciar.

## Instalar (1 comando, 1 vez)
```powershell
./_handoff/loop/install-loop-service.ps1
```
Instala pm2 + arranca 'mooter-loop' + arranque no login. Pre-requisitos: node, claude no PATH, Ollama UP.
A partir daqui NUNCA mais arrancas nada.

## O que fica humano PARA SEMPRE (de proposito)
So o **gate do irreversivel**: merge para main / push / secrets / deploy. O loop escala-te (awaiting_human)
e espera. Isto NAO se remove — e a alma da feature e a regra de seguranca. "Forever autonomous" no
trabalho; humano so na decisao que tem de ser tua.

## Porque o install corre na TUA maquina (e nao eu)
Instalar um servico de sistema e' uma accao de configuracao persistente privilegiada — vive onde estao
o teu GPU/Ollama + auth do claude + git saudavel. Eu desenho e entrego o instalador; tu corre-lo 1 vez.

## Operacao
- Estado: `pm2 status` · `pm2 logs mooter-loop` · `cat _handoff/loop/heartbeat.json`
- Parar: cria `_handoff/loop/STOP` (ou `pm2 stop mooter-loop`)
- O avaliador (Cowork) ja' corre sozinho (scheduled task `cowork-loop-evaluator`, cada 10 min).
