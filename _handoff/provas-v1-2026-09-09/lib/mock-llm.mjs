// mock-llm.mjs — um "fornecedor" em loopback. Responde a /v1/chat/completions
// (OpenAI), /v1/messages (Anthropic) e /api/chat|/api/generate (Ollama) com uma
// resposta fixa, e CONTA o que recebeu: bytes de corpo e o texto do ultimo
// prompt (para verificar se o prompt cru chegou). Serve para pôr um proxy a
// encaminhar para aqui e medir o que ele manda para fora sem nada sair da
// maquina.
//
//   const m = await startMockLlm({ name: 'cloud' });   -> { url, port, report(), close() }

import http from 'node:http';

export async function startMockLlm({ name = 'mock', host = '127.0.0.1', port = 0, reply = 'OK' } = {}) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let parsed = null; try { parsed = JSON.parse(body); } catch { /* */ }
      const lastUser = (() => {
        if (!parsed) return null;
        if (Array.isArray(parsed.messages)) { const u = [...parsed.messages].reverse().find((m) => m.role === 'user'); if (u) return typeof u.content === 'string' ? u.content : JSON.stringify(u.content); }
        if (typeof parsed.prompt === 'string') return parsed.prompt;
        return null;
      })();
      requests.push({ at: new Date().toISOString(), name, method: req.method, path: req.url, body_bytes: Buffer.byteLength(body), model: parsed && parsed.model, last_user_chars: lastUser ? lastUser.length : null, last_user_text: lastUser, headers_auth: !!(req.headers.authorization || req.headers['x-api-key']) });
      res.setHeader('content-type', 'application/json');
      if (/\/v1\/messages/.test(req.url)) res.end(JSON.stringify({ id: 'msg_mock', type: 'message', role: 'assistant', model: (parsed && parsed.model) || 'mock', content: [{ type: 'text', text: reply }], stop_reason: 'end_turn', usage: { input_tokens: 1, output_tokens: 1 } }));
      else if (/\/api\/(chat|generate)/.test(req.url)) res.end(JSON.stringify({ model: (parsed && parsed.model) || 'mock', created_at: new Date().toISOString(), message: { role: 'assistant', content: reply }, response: reply, done: true, done_reason: 'stop', prompt_eval_count: 1, eval_count: 1 }));
      else if (/\/api\/tags/.test(req.url)) res.end(JSON.stringify({ models: [{ name: 'qwen2.5:3b', model: 'qwen2.5:3b' }] }));
      else if (/\/v1\/models/.test(req.url)) res.end(JSON.stringify({ object: 'list', data: [{ id: 'mock-model', object: 'model' }] }));
      else res.end(JSON.stringify({ id: 'chatcmpl_mock', object: 'chat.completion', model: (parsed && parsed.model) || 'mock', choices: [{ index: 0, message: { role: 'assistant', content: reply }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }));
    });
  });
  await new Promise((r) => server.listen(port, host, r));
  return { name, url: `http://${host}:${server.address().port}`, port: server.address().port, report() { return requests.slice(); }, close() { return new Promise((r) => server.close(() => r())); } };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  // modo servidor: node mock-llm.mjs <port> <name> — imprime cada pedido como JSONL no stdout
  const m = await startMockLlm({ port: Number(process.argv[2] || 0), name: process.argv[3] || 'mock' });
  console.log(JSON.stringify({ event: 'listening', url: m.url }));
  setInterval(() => { const r = m.report(); if (r.length) { for (const x of r) console.log(JSON.stringify(x)); r.length = 0; } }, 500).unref();
  process.stdin.resume();
}
