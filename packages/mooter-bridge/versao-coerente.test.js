import { strict as assert } from 'assert';
import { readFileSync } from 'fs';
import { join } from 'path';
import { test } from 'node:test';

const manifestPath = join(import.meta.dirname, 'manifest.json');
const pluginPath = join(import.meta.dirname, '..', '..', 'plugin', 'mooter', '.claude-plugin', 'plugin.json');

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const plugin = JSON.parse(readFileSync(pluginPath, 'utf8'));

test('manifest.json e plugin.json devem ter a mesma versão', () => {
  const manifestVer = manifest.version;
  const pluginVer = plugin.version;

  assert.equal(
    manifestVer,
    pluginVer,
    `Versão divergente: manifest.json diz "${manifestVer}", plugin.json diz "${pluginVer}". Uma só fonte de verdade.`
  );

  const semverRegex = /^\d+\.\d+\.\d+$/;
  assert.match(
    manifestVer,
    semverRegex,
    `manifest.json versão "${manifestVer}" não segue x.y.z`
  );
  assert.match(
    pluginVer,
    semverRegex,
    `plugin.json versão "${pluginVer}" não segue x.y.z`
  );
});
