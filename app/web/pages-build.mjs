import { build } from 'vite';
import { copyFile, writeFile } from 'node:fs/promises';
process.env.VITE_STATIC = 'true';
process.env.VITE_BASE ||= '/waterflood-intelligence/';
await build();
const pages = ['operations-overview', 'fields-and-patterns', 'well-360', 'well-trends', 'digital-twin',
  'live-surveillance', 'data-quality-and-pipelines', 'agent', 'optimisation', 'work-management'];
for (const page of pages) await copyFile('dist-pages/index.html', `dist-pages/${page}.html`);
await writeFile('dist-pages/.nojekyll', '');
