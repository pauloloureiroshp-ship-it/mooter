/**
 * rotulos-da-frota.mjs — o que o cartao de um device DIZ, calculado onde se pode testar.
 *
 * ── O DEFEITO QUE ISTO FECHA (medido 2026-08-24) ────────────────────────────
 *
 * O painel dizia "1 min ago" para um device cujo ficheiro no disco tinha DOIS
 * DIAS. As duas afirmacoes estavam certas — e essa e a parte que fez o dono
 * duvidar do painel.
 *
 * O `fleet-beacon.mjs` le cada beacon de duas fontes e escolhe a mais nova:
 * o ficheiro em `50-fleet/` (que so muda quando ESTE device faz `pull`) e o
 * `origin/<branch>` (que so precisa de um `fetch`, e o `fleet-remoto.mjs`
 * faz um de 2 em 2 min). Quando ganha o remoto, marca `via: 'remoto'`.
 *
 * Esse campo existe desde que o remoto entrou. **O painel nunca o renderizou.**
 * Uma linha alimentada pelo `origin/main` ficava indistinguivel de uma linha
 * lida do disco, e quem fosse confirmar ao disco encontrava um ficheiro de dois
 * dias e concluia — razoavelmente — que o painel mentia.
 *
 * ── PORQUE E QUE ISTO VIVE AQUI E NAO NO HTML ───────────────────────────────
 *
 * A logica do rotulo estava dentro do `moo-pilot-shell.html`, inline. Nenhum
 * teste do repo le esse ficheiro — grep feito, zero. Portanto a unica coisa que
 * o painel afirma ao dono era, ate agora, a unica coisa sem cobertura nenhuma.
 *
 * O painel passa a RENDERIZAR um facto em vez de o derivar. E a mesma regra que
 * o `f10-server` ja segue para os shas ("os shas vem do ESTADO que o runner
 * escreveu, nao de um recalculo aqui").
 *
 * PURO: sem fs, sem rede, sem relogio proprio.
 */

/**
 * De onde veio este beacon, em palavras do dono.
 *
 * O ciclo esta no rotulo de proposito. "via vault" sozinho continuaria a nao
 * explicar porque e que um device fresco pode ter um ficheiro velho no disco;
 * "ciclo ~10 min" e a peca que fecha a conta.
 */
export function rotuloDeCanal(via, { self = false } = {}) {
  if (self) return 'esta maquina · directo do disco';
  if (via === 'remoto') return 'via vault (origin) · fetch ~2 min';
  if (via === 'disco') return 'via vault (disco) · pull ~10 min';
  return 'canal n/d';
}

/**
 * O chip de estado de um device — o texto curto ao lado do nome.
 *
 * Devolve `{ texto, classe, canal, titulo }`. `titulo` e o tooltip: leva SEMPRE
 * o canal e a idade em segundos, porque e o que se precisa para discordar do
 * chip sem ter de ir ler codigo.
 */
export function rotuloDeDevice(d) {
  const dev = d || {};
  const fr = dev.frescura || {};
  const pausa = dev.pausa || null;
  const emPausa = Boolean(pausa && pausa.activa);
  const pausaVelha = Boolean(pausa && pausa.obsoleta);
  const canal = rotuloDeCanal(dev.via, { self: Boolean(dev.self) });

  let texto;
  let classe;
  if (fr.estado === 'vivo') {
    texto = dev.running ? `${emIdade(fr.idade_s)} ago` : 'paused';
    classe = dev.running ? 'ok' : 'warn';
  } else if (emPausa) {
    texto = `holding · ${pausa.razao || 'queue full'}`;
    classe = 'warn';
  } else if (pausaVelha) {
    texto = `dead — was holding, ${emIdade(pausa.idade_s)} old`;
    classe = 'dead';
  } else {
    texto = fr.motivo || fr.estado || 'n/d';
    classe = fr.estado === 'stale' ? 'warn' : 'dead';
  }

  return {
    texto,
    classe,
    canal,
    // A frase que o dono le quando passa o rato. Um chip que afirma uma idade
    // sem dizer por que canal ela chegou e a metade da verdade que fez este
    // painel parecer mentiroso.
    titulo: `${canal} · idade ${fr.idade_s == null ? 'n/d' : `${fr.idade_s}s`}`,
    // Renderizado ao lado do chip para quem NAO passa o rato — um tooltip que
    // so aparece ao passar por cima nao serve quem esta a olhar de longe.
    sufixo: dev.self ? null : canal,
  };
}

/** Idade curta. Igual ao `ago()` que o painel ja usava, para o texto nao mudar. */
export function emIdade(s) {
  if (s == null) return 'n/a';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.round(s / 60)} min`;
  return `${Math.round(s / 3600)} h`;
}

/**
 * O aviso do rodape da frota.
 *
 * O `readBeacons` ja devolvia um `aviso`; o que faltava era dizer o que
 * aconteceu ao FETCH. Um painel que mostra devices frescos sem dizer que o
 * fetch falhou esta a afirmar uma frescura que nao mediu — e o `lerFrota` ja
 * carrega esse facto (`fleet.remoto.fetch`), so nao o mostrava.
 */
export function avisoDaFrota(fleet) {
  const f = fleet || {};
  const partes = [];
  if (f.aviso) partes.push(f.aviso);
  const r = f.remoto;
  if (r) {
    if (r.fetch === 'feito') partes.push(`remoto ${r.ref || 'origin'} · fetch feito`);
    else if (r.fetch) partes.push(`remoto ${r.ref || 'origin'} · fetch ${r.fetch}`);
    if (r.porque) partes.push(`remoto indisponivel: ${r.porque}`);
  } else {
    partes.push('sem remoto: a frescura vale o que o pull deste device valer');
  }
  return partes.join(' · ');
}

/** Anota cada device da frota com o seu rotulo, sem alterar mais nada. */
export function anotarFrota(fleet) {
  const f = fleet || {};
  if (!Array.isArray(f.frota)) return f;
  return {
    ...f,
    frota: f.frota.map((d) => ({ ...d, rotulo: rotuloDeDevice(d) })),
    aviso_completo: avisoDaFrota(f),
  };
}
