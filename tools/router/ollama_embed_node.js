#!/usr/bin/env node
'use strict';

// ollama_embed_node.js — Wave 64 Fase 2 helper. POSTs one text to Ollama's
// /api/embeddings and prints the embedding vector as a JSON array to stdout
// (exit 0 on success). Best-effort by design: any failure exits non-zero with no
// output, so the caller (compaction-drift.embedText) degrades to "no signal".
// Mirrors ollama_call_node.js's transport; embeddings only (no generation).

const http = require('http');
const https = require('https');

const text = process.argv[2] || '';
if (text.length < 3) process.exit(1);

const hostUrl = new URL(process.env.OLLAMA_HOST || 'http://127.0.0.1:11434');
const model = process.env.MOOTER_EMBED_MODEL || 'nomic-embed-text';
const body = JSON.stringify({ model, prompt: text, keep_alive: -1 });

const url = new URL('/api/embeddings', hostUrl);
const lib = url.protocol === 'https:' ? https : http;

const req = lib.request(
  {
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: url.pathname,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
  },
  (res) => {
    let data = '';
    res.on('data', (c) => { data += c; });
    res.on('end', () => {
      try {
        const v = JSON.parse(data).embedding;
        if (Array.isArray(v) && v.length) { process.stdout.write(JSON.stringify(v)); process.exit(0); }
      } catch { /* fall through */ }
      process.exit(1);
    });
  },
);
req.on('error', () => process.exit(1));
req.write(body);
req.end();
