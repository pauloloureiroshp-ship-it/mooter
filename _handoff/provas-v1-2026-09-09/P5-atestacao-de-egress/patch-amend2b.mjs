// patch-amend2b.mjs — AMENDMENT-2, controlo adicional do braco D (P5-06): a inversao mostrou que o LiteLLM foi 20/20 ao
// deployment com o preco MAIS ALTO nas duas configuracoes. Hipotese a testar: preco 0 e tratado como «desconhecido» e o
// deployment e excluido. Controlo: --tiny poe o barato a 1e-9/3e-9 em vez de 0. Tambem corrige a leitura automatica.
import fs from 'node:fs';
const p = new URL('./run.mjs', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const reps = [
  ["  const P_LOW = { i: '0.0', o: '0.0' }, P_HIGH = { i: '0.00001', o: '0.00003' }; const pc = inv ? P_HIGH : P_LOW, pd = inv ? P_LOW : P_HIGH;",
   "  const tiny = has('--tiny'); // controlo: barato a 1e-9 em vez de 0 — se 0 for lido como «sem preco», o 0 nunca e escolhido\n  const P_LOW = tiny ? { i: '0.000000001', o: '0.000000003' } : { i: '0.0', o: '0.0' }, P_HIGH = { i: '0.00001', o: '0.00003' }; const pc = inv ? P_HIGH : P_LOW, pd = inv ? P_LOW : P_HIGH;"],
  ["  save(inv ? 'D-litellm-invert.json' : 'D-litellm.json', { arm: 'D', variant: inv ? 'precos INVERTIDOS (cheap=alto, dear=0), mesmas portas/identidades' : 'precos normais',",
   "  save(inv ? 'D-litellm-invert.json' : (tiny ? 'D-litellm-tiny.json' : 'D-litellm.json'), { arm: 'D', variant: inv ? 'precos INVERTIDOS (cheap=alto, dear=0), mesmas portas/identidades' : (tiny ? 'barato a 1e-9/3e-9 (nao zero), caro a 1e-5/3e-5' : 'precos normais (barato = 0)'),"],
  ["reading: DI.requests_to_dear === 20 ? 'mesma escolha com precos invertidos: a seleccao NAO e guiada pelo preco nesta configuracao (defeito de configuracao nosso ou do LiteLLM — n/d)' : (DI.requests_to_cheap === 20 ? 'a escolha seguiu o preco (foi ao que ficou barato): o resultado principal e do LiteLLM, nao da configuracao' : 'misto') };",
   "reading: DI.requests_to_dear === 20 ? 'mesma porta com precos invertidos: a seleccao NAO e guiada pelo preco nesta configuracao (defeito de configuracao nosso ou do LiteLLM — n/d)' : (DI.requests_to_cheap === 20 ? 'com os precos invertidos foi 20/20 para a OUTRA porta — a que passou a ter o preco ALTO. Nas duas configuracoes o LiteLLM escolheu o deployment de preco mais alto: a seleccao segue o preco, ao contrario do esperado, ou trata 0 como sem preco (ver D_litellm_tiny)' : 'misto') };\n  const DT = load('D-litellm-tiny.json'); if (DT) out.D_litellm_tiny = { variant: DT.variant, up: DT.litellm_up, to_cheap_port: DT.requests_to_cheap, to_dear_port: DT.requests_to_dear, statuses: DT.rows.map((r) => r.status).join(' '), reading: DT.requests_to_cheap === 20 ? 'com o barato a 1e-9 (nao zero) foi 20/20 ao barato: o cost-based-routing funciona, mas um deployment a preco 0 (o caso do Ollama local) nunca e escolhido — 0 e lido como sem preco' : (DT.requests_to_dear === 20 ? 'mesmo com 1e-9 foi ao caro: a seleccao prefere o preco mais alto nesta versao/configuracao — n/d a causa' : 'misto') };"],
];
for (const [a, b] of reps) { if (!s.includes(a)) { console.error('NAO ENCONTRADO:', a.slice(0, 90)); process.exit(1); } s = s.replace(a, b); }
fs.writeFileSync(p, s);
console.log('run.mjs patched (AMENDMENT-2b):', reps.length);
