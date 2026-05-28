import { readFileSync, writeFileSync } from 'fs';
const f = 'dist-server/index.js';
const content = readFileSync(f, 'utf8');
if (!content.startsWith('#!')) {
  writeFileSync(f, '#!/usr/bin/env node\n' + content);
}
