#!/usr/bin/env node
/**
 * dossier.mjs — gera `dossier-data.json`: um só JSON com tudo o que o relatório
 * visual precisa. APRESENTAÇÃO, nunca substituto: a fonte canónica é o
 * `resultado.md`, gerado mecanicamente dos `meta.json`.
 *
 * Regra dura: campo sem medição sai `null` COM `_porque` ao lado. Nunca zero,
 * nunca uma estimativa disfarçada de medição.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { homedir } from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const RUNS = join(HERE, "runs");

const nn = (v, porque) => (v === undefined || v === null || Number.isNaN(v) ? { valor: null, _porque: porque } : { valor: v });
const jsonDe = (script, args = []) => JSON.parse(execFileSync("node", [join(HERE, script), ...args, "--json"], { encoding: "utf8", maxBuffer: 128e6 }));

// ---------- pré-commitment verbatim ----------
const PROTO = join(HERE, "..", "PILOTO_CONVICCAO_2026-08-06.md");
const proto = existsSync(PROTO) ? readFileSync(PROTO, "utf8") : "";
const bloco = proto.match(/## 0\. Pré-commitment[^\n]*\n\n([\s\S]*?)\n\n##/);
const preCommitment = bloco
  ? { verbatim: bloco[1].trim(), fonte: "_handoff/PILOTO_CONVICCAO_2026-08-06.md §0", congelado_em: "0737767c714956bb7912a708b126f77f230bb4ed" }
  : { verbatim: null, _porque: "§0 não encontrado no protocolo — não se reconstrói de memória" };

// ---------- shas ----------
const shaInfo = (s) => {
  try {
    const [sha, data, assunto] = execFileSync("git", ["-C", REPO, "log", "-1", "--format=%H%x1f%cI%x1f%s", s], { encoding: "utf8" }).trim().split("\x1f");
    return { sha, sha_curto: sha.slice(0, 8), data, assunto };
  } catch { return { sha: s, _porque: "commit não resolvido neste repo" }; }
};
const shas = {
  pre_commitment_congelado: shaInfo("0737767c"),
  fix_settings_bracos_de_controlo: shaInfo("b62146cc"),
  kit_v2_2_artefacto_e_contexto: shaInfo("7f78c72b"),
  kit_v2_3_quarentena_isolamento: shaInfo("77814da3"),
  base_sha_da_bateria_T1: shaInfo("e8f9b25c"),
};

// ---------- runs ----------
const res = jsonDe("resultado.mjs");
const ag = jsonDe("agregar-veredictos.mjs");

const runs = res.metas.map((m) => {
  const dodF = join(RUNS, m.runId, "dod", "dod.json");
  const dod = existsSync(dodF) ? JSON.parse(readFileSync(dodF, "utf8")) : null;
  const html = join(RUNS, m.runId, "artefacto", "index.html");
  const mix = m.mix_tiers || {};
  const totTok = Object.values(mix).reduce((a, t) => a + t.tokens, 0);
  return {
    run_id: m.runId, braco: m["braço"], braco_nome: m["braço_nome"], tarefa: m.tarefa, execucao: m.execucao,
    wall_ms: nn(m.wall_ms_total, "wall não registado"),
    custo_proxy_usd: nn(m.custo_proxy?.total_usd === "n/d" ? null : m.custo_proxy?.total_usd, m.custo_proxy?.detalhe || "modelUsage ausente do output do CLI"),
    custo_marginal_subscricao: { valor: null, _porque: "≈0 nos planos actuais — o custo_proxy é preço de tabela, não desembolso" },
    usage_por_tentativa: m.usage_por_tentativa ?? null,
    modelUsage_por_tentativa: m.modelUsage_por_tentativa ?? null,
    mix_tiers: mix,
    tokens_total: totTok,
    pct_T3: totTok ? +(100 * ((mix.T3?.tokens) || 0) / totTok).toFixed(1) : null,
    artefacto_onde: m.artefacto_onde ?? null,
    artefacto_encontrado_em: m.artefacto_encontrado_em ?? null,
    criterio_paragem: m.criterio_paragem,
    tentativas: m.tentativas?.length ?? null,
    violacao_isolamento: m.violacao_isolamento ?? { houve: null, _porque: "run anterior à guarda de isolamento (kit v2.3)" },
    contexto_neutralizado: m.contexto_neutralizado ?? { _porque: "run anterior ao contexto neutro (kit v2.2)" },
    html_relativo: existsSync(html) ? relative(HERE, html).replace(/\\/g, "/") : null,
    html_bytes: existsSync(html) ? statSync(html).size : null,
    dod: dod ? {
      score: dod.score_dod ?? null,
      itens: dod.itens ?? null,
      fluidez: dod.fluidez ?? null,
      item_8: { valor: null, _porque: "condição de vitória: n/d (humano) — o harness não a consegue verificar; fica à espera de o Paulo jogar os 9 jogos" },
      ressalva_fps: "item 10 = mediana de rAF numa única corrida headless, na mesma máquina onde a bateria correu — comparável entre braços, não é benchmark de hardware",
      ressalva_heuristicas: "itens 2, 3, 4 e 7 são heurísticos por declaração do próprio dod_checks.mjs",
    } : { _porque: "dod.json ausente para este run" },
  };
});

// ---------- veredicto contra o pré-commitment ----------
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
const porBraco = {};
for (const b of ag.por_braco) porBraco[b.braco] = { nome: b.nome, finais: b.finais, mediana: +med(b.finais).toFixed(3), media: b.media, min: b.min, max: b.max, custo: 0, tokT3: 0, tokTot: 0 };
for (const r of runs) {
  const b = porBraco[r.braco]; if (!b) continue;
  b.custo += r.custo_proxy_usd.valor || 0;
  b.tokT3 += (r.mix_tiers.T3?.tokens) || 0;
  b.tokTot += r.tokens_total;
}
const A = porBraco.A, B = porBraco.B, C = porBraco.C;
const sobrepoe = !(B.min > A.max || A.min > B.max);
const razaoCusto = +(100 * B.custo / A.custo).toFixed(1);
const pctT3 = +(100 * B.tokT3 / B.tokTot).toFixed(1);
const deltaQ = +(B.mediana - A.mediana).toFixed(3);

const veredicto = {
  criterio_a_qualidade: { medida: `B ${B.mediana} vs A ${A.mediana} (delta ${deltaQ >= 0 ? "+" : ""}${deltaQ})`, tecto: "dentro de ±0,5 de A ou acima",
    cumpre: Math.abs(deltaQ) <= 0.5 || deltaQ > 0,
    ressalva: sobrepoe ? "AMPLITUDES SOBREPOSTAS (A 6,48–7,9 · B 6,52–7,18 · C 6,14–7,62) — o §0 manda ler isto como INCONCLUSIVO, não como empate" : null },
  criterio_b_custo: { medida: `${razaoCusto}% (B ${B.custo.toFixed(2)} / A ${A.custo.toFixed(2)})`, tecto: "≤ 40%", cumpre: razaoCusto <= 40 },
  criterio_c_tier: { medida: `${pctT3}% dos tokens de B em T3`, tecto: "≤ 40%", cumpre: pctT3 <= 40,
    ressalva: "o §0 previu-o: 'senão o empate é só o Fable/Opus a trabalhar com outro nome (tautologia por escalada)'" },
  braco_mais_barato: { braco: "C", custo: +C.custo.toFixed(2), pct_de_A: +(100 * C.custo / A.custo).toFixed(1), mediana: C.mediana,
    ressalva: "o §0 previu-o: 'Se um modelo médio chegava, o router não provou nada'" },
  sintese: "2 de 3 critérios FALHAM e o terceiro é INCONCLUSIVO pela regra do próprio §0. O piloto NÃO convence a favor do Mooter nesta tarefa.",
  o_que_o_protocolo_manda_fazer: "'Resultado contra o Mooter é registado no vault na mesma; a wave seguinte é arrumar a casa.' — §0/§6",
};

// ---------- defeitos de instrumento ----------
const defeitos = [
  { n: 1, data: "2026-08-07", o_que_era: "`--settings` partia-se no espaço de 'Paulo Loureiro' com shell:true — braços A e C faziam 3/3 tentativas com 0 bytes", consequencia: "o piloto ia declarar MOOTER 3-0 contra dois braços que nunca arrancaram", commit_fix: "b62146cc" },
  { n: 2, data: "2026-08-07", o_que_era: "braço com 0 bytes em 3/3 tentativas era registado como 'TECTO ATINGIDO — incompleto' e a bateria seguia", consequencia: "avaria do instrumento virava medição do produto", commit_fix: "b62146cc" },
  { n: 3, data: "2026-08-07", o_que_era: "gate do artefacto exigia `moo-ranch/index.html` mas o prompt congelado nunca diz onde pôr o ficheiro", consequencia: "9/9 'TECTO ATINGIDO' com os três braços a reportar success e jogos verificados", commit_fix: "7f78c72b" },
  { n: 4, data: "2026-08-07", o_que_era: "captura do artefacto só olhava para o git da worktree; B e C escreviam no scratchpad", consequencia: "artefacto/ vazio em 6 de 9 runs apesar de 5-7 MB de transcrição", commit_fix: "7f78c72b" },
  { n: 5, data: "2026-08-07", o_que_era: "worktree opaca não isolava: braços escreveram em ~/moo-ranch e ~/moo-ranch-b e viram-se uns aos outros", consequencia: "run N partia com o build do run N-1", commit_fix: "77814da3" },
  { n: 6, data: "2026-08-07", o_que_era: "o CLAUDE.md neutro (alteração nossa) entrava no artefacto dos 9 runs", consequencia: "juiz cego leria violação de 'não toques em mais nenhum ficheiro' em todos os braços", commit_fix: "279b5d8d" },
  { n: 7, data: "2026-08-07", o_que_era: "juiz Fable 5 com o mesmo bug do `--settings` — e o julgar.mjs apanhava a falha e seguia", consequencia: "painel sairia com 2 juízes de 3, com ar de 'o terceiro falhou'", commit_fix: "dbb8142a" },
  { n: 8, data: "2026-08-07", o_que_era: "juiz âncora (codex) recusado: cwd isolado é mkdtemp, não repo git", consequencia: "perdia-se o único juiz de outra casa — o painel avaliava-se a si próprio", commit_fix: "a5642ae2" },
  { n: 9, data: "2026-08-07", o_que_era: "juiz local marcado '✓' com veredicto VAZIO (sem num_ctx: 82k tokens contra 4096; sem think:false: qwen3 põe o texto em 'thinking')", consequencia: "um ✓ sobre nada no painel", commit_fix: "a5642ae2" },
  { n: 10, data: "2026-08-07", o_que_era: "resultado.md dizia 'runtime_bundle_sha: n/d' e acusava 9 runs de serem anteriores à prova de bundle — com a prova a dar IGUAL 198/198", consequencia: "o documento canónico publicava uma segunda verdade", commit_fix: "13779a6d" },
];

// ---------- ledger da semana ----------
const LEDGER = join(homedir(), ".mooter", "ledger.jsonl");
let ledger = { _porque: "ledger.jsonl ausente" };
if (existsSync(LEDGER)) {
  const desde = Date.now() - 7 * 24 * 3600 * 1000;
  let tin = 0, tout = 0, tlocal = 0, custo = 0, jobs = 0, jobsLocal = 0, semCusto = 0;
  for (const l of readFileSync(LEDGER, "utf8").split("\n")) {
    if (!l.trim()) continue;
    let o; try { o = JSON.parse(l); } catch { continue; }
    if (o.event !== "done" && o.event !== "failed") continue;
    if (Date.parse(o.ts || "") < desde) continue;
    jobs++;
    tin += o.tokens_in || 0; tout += o.tokens_out || 0;
    if (o.local) { jobsLocal++; tlocal += o.tokens_out || 0; }
    if (typeof o.cost_usd === "number") custo += o.cost_usd; else semCusto++;
  }
  ledger = {
    janela: "7 dias", jobs, jobs_locais: jobsLocal,
    tokens_in: tin, tokens_out: tout, tokens_out_locais: tlocal,
    pct_tokens_saida_local: tout ? +(100 * tlocal / tout).toFixed(1) : null,
    custo_usd_medido: +custo.toFixed(4),
    jobs_sem_custo_medido: semCusto,
    _porque_parcial: semCusto ? `${semCusto} job(s) sem cost_usd medido — o total é um limite inferior` : null,
    _ressalva: "só o que passou por esta máquina; não inclui claude.ai nem outros computadores",
    _ressalva_piloto: "os braços do piloto NÃO passam por aqui — o driver invoca `claude -p` directamente, sem o bridge. Este total é do trabalho da frota (mooter_work), não da bateria. Cruzar os dois seria somar coisas diferentes.",
  };
}

const dossier = {
  gerado_por: "dossier.mjs",
  aviso: "APRESENTAÇÃO. A fonte canónica é resultado.md, gerado mecanicamente dos meta.json. Este ficheiro não decide nada.",
  pre_commitment: preCommitment,
  shas,
  veredicto_contra_pre_commitment: veredicto,
  runs,
  juizes: ag.juizes,
  por_artefacto: ag.por_artefacto,
  por_braco: ag.por_braco,
  concordancia_entre_juizes: ag.concordancia_entre_juizes,
  sonda_proveniencia: ag.sonda_proveniencia,
  defeitos_de_instrumento: { total: defeitos.length, _nota: "o brief falava em 7; o registo dá 10 — a contagem sai do registo, não da memória", lista: defeitos },
  ledger_semana: ledger,
  declaracoes_obrigatorias: {
    exposicao_do_paulo: "o Paulo viu 1 artefacto da bateria-1 (inválida) antes do julgamento desta bateria; os 9 artefactos julgados aqui são da bateria-2 e nenhum lhe foi mostrado antes do painel fechar",
    limite_contexto_neutro: "o ~/.claude/CLAUDE.md do utilizador NÃO é removível (CLAUDE_CONFIG_DIR quebra a autenticação, medido). É CONSTANTE nos três braços, não variável entre eles — mas o ambiente não é livre de doutrina",
    item_8_do_dod: "condição de vitória: n/d (humano) nos 9 artefactos — à espera de o Paulo jogar os 9 jogos",
  },
};

const OUT = join(HERE, "dossier-data.json");
writeFileSync(OUT, JSON.stringify(dossier, null, 2));
console.log(`dossier-data.json escrito · ${runs.length} runs · ${ag.juizes.length} juízes · ${defeitos.length} defeitos · ${OUT}`);
