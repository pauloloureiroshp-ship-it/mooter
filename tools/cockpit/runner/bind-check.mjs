/**
 * bind-check.mjs — provar, ao sistema operativo, que o F10 so ouve o loopback.
 *
 * O `srv.listen(PORT, '127.0.0.1')` e uma INTENCAO. O que o dono precisa de
 * saber e o FACTO: a que interface o kernel ligou o socket. Sao coisas
 * diferentes na unica situacao que interessa — quando alguem muda o `HOST`, ou
 * quando outro processo ja ocupou a porta e o painel esta a falar com ele.
 *
 * Ate aqui o arranque imprimia `F10 vivo em http://127.0.0.1:4290` construindo
 * a frase a partir da variavel que tinha pedido. Isso nao e uma medicao: e um
 * eco. Um servidor que se anuncia local porque o seu proprio codigo diz que e
 * local nao prova nada a ninguem — e a doutrina desta casa e que uma afirmacao
 * sem medicao vale `n/d`.
 *
 * Zero-LLM, zero rede: uma chamada ao `lsof`, que e o que o SO sabe. Onde nao
 * houver `lsof` (Windows) o resultado e `n/d` com o motivo — nunca um "sim"
 * por omissao, que seria a mentira que este ficheiro existe para nao contar.
 */

import { execFileSync } from 'node:child_process';

/** So estes contam como loopback. `*` e `0.0.0.0` sao o contrario disto. */
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * Le a coluna NAME do `lsof` e devolve os enderecos em escuta.
 *
 * O formato e `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME`, e o NAME de
 * um socket em escuta e `127.0.0.1:4290 (LISTEN)` ou `*:4290 (LISTEN)`. Parte-se
 * pelo ULTIMO `:` porque um endereco IPv6 tem varios.
 */
export function enderecosEmEscuta(saida) {
  const out = [];
  for (const linha of String(saida || '').split('\n')) {
    if (!/\(LISTEN\)/.test(linha)) continue;
    const campos = linha.trim().split(/\s+/);
    const idx = campos.findIndex((c) => c === '(LISTEN)');
    const nome = idx > 0 ? campos[idx - 1] : campos[campos.length - 1];
    if (!nome || !nome.includes(':')) continue;
    const corte = nome.lastIndexOf(':');
    out.push({ host: nome.slice(0, corte), porta: nome.slice(corte + 1), bruto: nome });
  }
  return out;
}

/**
 * O F10 esta ligado so ao loopback?
 *
 * @returns {{estado:'loopback'|'exposto'|'n/d', porque:string, enderecos:string[]}}
 *   `loopback` = todos os sockets em escuta nesta porta sao locais.
 *   `exposto`  = pelo menos um responde fora da maquina. E o alarme.
 *   `n/d`      = nao foi possivel medir. NUNCA se le como "esta seguro".
 */
export function verificarBind(porta, { runImpl = null } = {}) {
  const run = runImpl || ((args) => execFileSync('lsof', args, {
    encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
  }));
  let saida;
  try {
    saida = run(['-nP', `-iTCP:${porta}`, '-sTCP:LISTEN']);
  } catch (e) {
    // `lsof` devolve 1 quando NAO ENCONTRA nada — que aqui seria impossivel,
    // porque quem chama isto acabou de abrir a porta. Um erro e mesmo um erro:
    // sem `lsof` (Windows), sem permissao, ou timeout.
    return {
      estado: 'n/d',
      porque: `nao consegui correr lsof (${String((e && e.message) || e).slice(0, 80)}) — o bind nao foi medido`,
      enderecos: [],
    };
  }
  const todos = enderecosEmEscuta(saida).filter((e) => e.porta === String(porta));
  if (!todos.length) {
    return { estado: 'n/d', porque: `lsof nao viu ninguem em escuta na :${porta}`, enderecos: [] };
  }
  const fora = todos.filter((e) => !LOOPBACK.has(e.host));
  const enderecos = todos.map((e) => e.bruto);
  if (fora.length) {
    return {
      estado: 'exposto',
      porque: `${fora.length} socket(s) em escuta fora do loopback: ${fora.map((e) => e.bruto).join(', ')}`,
      enderecos,
    };
  }
  return {
    estado: 'loopback',
    porque: `${todos.length} socket(s), todos locais`,
    enderecos,
  };
}

/** A linha que vai para o log. Uma frase, o facto, e a fonte. */
export function linhaDeLog(r, porta) {
  const prefixo = { loopback: 'F10 bind', exposto: 'F10 BIND EXPOSTO', 'n/d': 'F10 bind n/d' }[r.estado];
  return `${prefixo}: :${porta} — ${r.porque} [medido por lsof]\n`;
}
