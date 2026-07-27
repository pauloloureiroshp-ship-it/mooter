'use strict';
/**
 * aplicar-bundle.js — instala o .mcpb sem passar pelo MCP.
 *
 * ⚠️ ACHADO: `mooter_setup({atualizar:'aplicar'})` passou a estourar o timeout
 * do host (30 s) agora que o bundle tem 32 ficheiros. Nas versoes anteriores
 * completava na mesma depois do timeout; nesta deixou de completar. Uma
 * actualizacao que so funciona enquanto o produto for pequeno nao e' uma
 * actualizacao — entra no backlog como bug.
 */
const path = require('path');
const update = require(path.join(__dirname, '..', 'packages', 'mooter-bridge', 'update.js'));

const antes = update.procurar({});
console.log('instalada: ' + (antes.versao_instalada || 'n/d'));
console.log('candidata: ' + (antes.nova ? antes.nova.versao + '  ' + antes.nova.ficheiro : 'nenhuma'));

if (!antes.nova) { console.log('nada a fazer'); process.exit(0); }

const t0 = Date.now();
const r = update.aplicar({});
console.log('aplicar demorou ' + (Date.now() - t0) + ' ms  <- comparar com o timeout de 30 s do host');
console.log(JSON.stringify(r, null, 2));

const depois = update.procurar({});
console.log('agora instalada: ' + (depois.versao_instalada || 'n/d'));
