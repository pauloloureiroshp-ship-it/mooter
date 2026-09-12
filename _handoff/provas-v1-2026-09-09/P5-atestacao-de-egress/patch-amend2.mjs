// patch-amend2.mjs — aplica ao run.mjs as alteracoes da AMENDMENT-2 (ataques P5-02, P5-05, P5-06 do adversario).
// Ficheiro separado porque um heredoc na shell desta maquina come as barras invertidas dos padroes.
import fs from 'node:fs';
const p = new URL('./run.mjs', import.meta.url);
let s = fs.readFileSync(p, 'utf8');
const reps = [
  // B: destino explicito + igualdade do campo messages[ultimo].content (P5-05)
  ["body_model: calls.map((c) => { try { return JSON.parse(c.body).model; } catch { return null; } }), result: out && out.tier, error: err });",
   "body_model: calls.map((c) => { try { return JSON.parse(c.body).model; } catch { return null; } }), would_send_to: calls.map((c) => (c.script_mentions_host > 0 ? 'api.anthropic.com' : 'n/d')), prompt_field_equals_prompt: calls.some((c) => { try { const m = JSON.parse(c.body).messages; const last = m[m.length - 1]; const t = typeof last.content === 'string' ? last.content : (Array.isArray(last.content) ? last.content.map((x) => x.text || '').join('') : ''); return t === p.prompt; } catch { return false; } }), /* P5-05: igualdade do campo, nao substring */ result: out && out.tier, error: err });"],
  ["raw_prompt_in_body: B.rows.filter((r) => r.raw_prompt_in_body).length,",
   "raw_prompt_in_body: B.rows.filter((r) => r.raw_prompt_in_body).length, prompt_field_equals_prompt: B.rows.filter((r) => r.prompt_field_equals_prompt).length,"],
  // D: controlo de inversao de precos (P5-06)
  ["  const cheap = await startMockLlm({ name: 'ollama-local-mock' });",
   "  const inv = has('--invert'); // AMENDMENT-2 (P5-06): inverte os precos mantendo identidades/portas — se a escolha nao mudar, nao e o preco que manda\n  const P_LOW = { i: '0.0', o: '0.0' }, P_HIGH = { i: '0.00001', o: '0.00003' }; const pc = inv ? P_HIGH : P_LOW, pd = inv ? P_LOW : P_HIGH;\n  const cheap = await startMockLlm({ name: 'ollama-local-mock' });"],
  ["      input_cost_per_token: 0.0\\n      output_cost_per_token: 0.0\\n    model_info:\\n      input_cost_per_token: 0.0\\n      output_cost_per_token: 0.0\\n",
   "      input_cost_per_token: ${pc.i}\\n      output_cost_per_token: ${pc.o}\\n    model_info:\\n      input_cost_per_token: ${pc.i}\\n      output_cost_per_token: ${pc.o}\\n"],
  ["      input_cost_per_token: 0.00001\\n      output_cost_per_token: 0.00003\\n    model_info:\\n      input_cost_per_token: 0.00001\\n      output_cost_per_token: 0.00003\\n",
   "      input_cost_per_token: ${pd.i}\\n      output_cost_per_token: ${pd.o}\\n    model_info:\\n      input_cost_per_token: ${pd.i}\\n      output_cost_per_token: ${pd.o}\\n"],
  ["  save('D-litellm.json', { arm: 'D', at: now(), litellm_up: up, port, config: cfg,",
   "  save(inv ? 'D-litellm-invert.json' : 'D-litellm.json', { arm: 'D', variant: inv ? 'precos INVERTIDOS (cheap=alto, dear=0), mesmas portas/identidades' : 'precos normais', at: now(), litellm_up: up, port, config: cfg,"],
  // analise: A so tem fase open -> bytes n/d (P5-02); D invert; proxy do A e vazio por construcao
  ["  if (A) out.A = { prompts: A.rows.length, tap: { processes: A.tap.processes_tapped, connections: A.tap.connections, external_hosts: A.tap.external, by_host: A.tap.by_host },",
   "  if (A) out.A = { prompts: A.rows.length, tap: { processes: A.tap.processes_tapped, connections: A.tap.connections, external_hosts: A.tap.external, by_host: A.tap.by_host, bytes: 'n/d — so ha registos de fase open (o filho ollama_call_node.js e morto pelo tecto de 1 s do hook antes do close; o exit do hook nao chegou a registar); o destino e conhecido no open, os bytes nao (P5-02)' }, proxy_counter_note: 'o hook e Node e o Node nao honra HTTPS_PROXY por omissao: 0 CONNECT e esperado e nao prova nada (P5-01)',"],
  ["  if (D) out.D_litellm = {",
   "  const DI = load('D-litellm-invert.json'); if (DI) out.D_litellm_invert = { variant: DI.variant, up: DI.litellm_up, to_cheap_port: DI.requests_to_cheap, to_dear_port: DI.requests_to_dear, statuses: DI.rows.map((r) => r.status).join(' '), reading: DI.requests_to_dear === 20 ? 'mesma escolha com precos invertidos: a seleccao NAO e guiada pelo preco nesta configuracao (defeito de configuracao nosso ou do LiteLLM — n/d)' : (DI.requests_to_cheap === 20 ? 'a escolha seguiu o preco (foi ao que ficou barato): o resultado principal e do LiteLLM, nao da configuracao' : 'misto') };\n  if (D) out.D_litellm = {"],
];
for (const [a, b] of reps) { if (!s.includes(a)) { console.error('NAO ENCONTRADO:', a.slice(0, 80)); process.exit(1); } s = s.replace(a, b); }
fs.writeFileSync(p, s);
console.log('run.mjs patched (AMENDMENT-2):', reps.length, 'substituicoes');
