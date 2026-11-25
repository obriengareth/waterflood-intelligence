import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = (process.env.PAGES_URL || 'http://127.0.0.1:4176/waterflood-intelligence/').replace(/\/?$/, '/');
const output = process.env.PAGES_EVIDENCE || '../../evidence/pages-local';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true,
  args: ['--enable-webgl', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.addInitScript(() => {
  const create = URL.createObjectURL.bind(URL);
  URL.createObjectURL = blob => {
    if (blob.type === 'application/json') window.__exportedSnapshot = blob.text();
    return create(blob);
  };
});
const errors = [], failures = [], forbidden = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('response', r => { if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`); });
page.on('request', r => {
  requests.push(r.url());
  if (/\/api\/|\/ws\/|localhost/.test(r.url()) || (base.startsWith('https:') && /127\.0\.0\.1/.test(r.url()))) forbidden.push(r.url());
});
const pages = ['operations-overview', 'fields-and-patterns', 'well-360', 'well-trends', 'digital-twin',
  'live-surveillance', 'data-quality-and-pipelines', 'agent', 'optimisation', 'work-management'];
const results = [];
try {
  for (const name of pages) {
    await page.goto(`${base}${name}.html`);
    await page.locator('.page-content .card').first().waitFor({ timeout: 60000 });
    if (['operations-overview', 'fields-and-patterns'].includes(name)) {
      await page.locator('[data-map][data-ready=true]').waitFor({ timeout: 60000 });
      assert(requests.some(url => url.endsWith('regional-satellite.webp')));
    }
    if (name === 'well-360') {
      await page.locator('[data-scene][data-well-count="100"][data-surface-count="36"] canvas').waitFor();
      await page.getByRole('combobox', { name: 'Field', exact: true }).selectOption('Raudhatain');
      await page.locator('[data-scene][data-well-count="18"][data-surface-count="6"]').waitFor();
      await page.getByRole('combobox', { name: 'Reservoir', exact: true }).selectOption('Mauddud');
      await page.locator('[data-scene][data-well-count="18"]').waitFor();
      await page.reload();
      await page.locator('[data-scene][data-well-count="18"]').waitFor();
    }
    if (name === 'digital-twin') {
      await page.locator('[data-twin] canvas').waitFor({ timeout: 60000 });
      await page.waitForTimeout(1800);
      assert(requests.some(url => url.includes('terrain-texture-RA.jpg')));
    }
    if (name === 'agent') {
      await page.locator('.prepared-questions button').nth(3).waitFor();
      assert.equal(await page.locator('.prepared-questions button').count(), 4);
      for (let i = 0; i < 4; i++) {
        await page.locator('.prepared-questions button').nth(i).click();
        assert((await page.locator('.agent-response').innerText()).length > 150);
      }
    }
    if (['optimisation', 'work-management'].includes(name)) {
      assert((await page.locator('.page-content').innerText()).includes('Unavailable on GitHub Pages'));
      assert.equal(await page.getByRole('button', { name: 'Run allocation', exact: true }).count(), 0);
    }
    await page.waitForTimeout(300);
    assert.equal(await page.locator('.error-banner').count(), 0);
    await page.screenshot({ path: `${output}/${name}.png` });
    results.push({ page: name, status: 'PASS' });
  }
  await page.goto(`${base}well-trends.html?well=RA-0417`);
  await page.locator('.well-banner').waitFor();
  await page.clock.install();
  await page.clock.pauseAt(new Date(Date.now() + 1000));
  const reading = () => page.locator('.well-header-metric strong').allInnerTexts();
  const stable = await reading();
  await page.clock.runFor(6000);
  assert.deepEqual(await reading(), stable);
  await page.getByRole('button', { name: 'Start streaming', exact: true }).click();
  const frames = [];
  const delivered = new Map(), timestamps = new Set();
  const csvResponse = await page.request.get(`${base}data/playback.csv`);
  assert(csvResponse.ok());
  const [header, ...sourceLines] = (await csvResponse.text()).trim().split(/\r?\n/);
  const columns = header.split(','), sourceRows = new Map();
  for (const line of sourceLines) {
    const values = line.split(','), row = Object.fromEntries(columns.map((key, index) => [key, values[index]]));
    sourceRows.set(`${row.well_id}:${row.minute_offset}`, row);
  }
  for (let i = 1; i <= 120; i++) {
    const previous = await page.locator('.shell').getAttribute('data-stream-ts');
    await page.clock.runFor(5000);
    await page.locator(`[data-playback-step="${i}"]`).waitFor();
    await page.waitForFunction(ts => document.querySelector('.shell')?.getAttribute('data-stream-ts') !== ts, previous);
    frames.push(await reading());
    await page.getByRole('button', { name: 'Export', exact: true }).click();
    const snapshot = await page.evaluate(async () => JSON.parse(await window.__exportedSnapshot));
    assert.equal(snapshot.wells.length, 100);
    for (const well of snapshot.wells) {
      const source = sourceRows.get(`${well.name}:${4199 + i}`);
      const primary = well.type === 'producer' ? 'oil_bopd' : 'inj_bwpd';
      const sourceTag = well.type === 'producer' ? 'oil_rate_bopd' : 'inj_rate_bwpd';
      assert.equal(well[primary], Number(source[sourceTag]), `${well.name} at source step ${i}`);
      assert(Math.abs(Number(source.liquid_rate_bpd) - Number(source.oil_rate_bopd) - Number(source.water_rate_bwpd)) < .00001);
      if (!delivered.has(well.name)) delivered.set(well.name, []);
      delivered.get(well.name).push(well[primary]);
      const key = `${well.name}:${snapshot.runtime.stream_timestamp}`;
      assert(!timestamps.has(key)); timestamps.add(key);
    }
  }
  assert.equal(timestamps.size, 12000);
  for (const values of delivered.values()) assert((Math.max(...values) - Math.min(...values)) / values.at(-1) >= .03999);
  await page.locator('[data-playback-state="completed"]').waitFor();
  assert(new Set(frames.map(f => f[0])).size >= 20, 'Visible oil rate must change');
  assert(new Set(frames.map(f => f[1])).size >= 5, 'Visible water cut must change');
  assert(new Set(frames.map(f => f[2])).size >= 10, 'Visible pressure must change');
  const last = await page.locator('.shell').getAttribute('data-stream-ts');
  await page.getByRole('button', { name: 'Restart streaming', exact: true }).click();
  await page.clock.runFor(5000);
  await page.locator('[data-playback-step="1"]').waitFor();
  await page.waitForFunction(ts => document.querySelector('.shell')?.getAttribute('data-stream-ts') > ts, last);
  await page.getByRole('button', { name: 'Stop streaming', exact: true }).click();
  const paused = await reading();
  await page.clock.runFor(10000);
  assert.deepEqual(await reading(), paused);
  await page.getByRole('combobox', { name: 'Time window', exact: true }).selectOption('60');
  await page.getByRole('heading', { name: '1-hour operating detail', exact: true }).waitFor();
  await page.getByRole('link', { name: 'Operations overview', exact: true }).click();
  assert(page.url().startsWith(base), 'Navigation escaped the project base path');
  assert.equal(errors.length, 0, errors.join('\n'));
  assert.equal(failures.length, 0, failures.join('\n'));
  assert.equal(forbidden.length, 0, forbidden.join('\n'));
  await writeFile(`${output}/validation.json`, JSON.stringify({ status: 'PASS', base, pages: results,
    playback: { source: '120 CSV records per well', testedSteps: frames.length, clock: 'Browser controlled clock, exact 5000ms ticks',
      idle: true, completed: true, restartUniqueTimeline: true, paused: true,
      oilDistinct: new Set(frames.map(f => f[0])).size, waterCutDistinct: new Set(frames.map(f => f[1])).size,
      pressureDistinct: new Set(frames.map(f => f[2])).size, uniqueWellTimestamps: timestamps.size,
      allWellsMatchCsv: true, allPrimaryRateSpansAtLeastFourPercent: true },
    errors, failures, forbiddenRequests: forbidden, requests }, null, 2));
  console.log(JSON.stringify({ status: 'PASS', base, pages: results.length, playbackSteps: frames.length }));
} finally { await browser.close(); }
