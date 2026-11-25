import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const base = process.env.PAGES_URL || 'https://obriengareth.github.io/waterflood-intelligence/';
const output = process.env.PAGES_EVIDENCE || '../../evidence/pages-hosted';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [], forbidden = [], frames = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => { if (/127\.0\.0\.1|localhost|\/api\/|\/ws\//.test(r.url())) forbidden.push(r.url()); });
try {
  await page.goto(`${base}well-trends.html?well=RA-0417`);
  await page.locator('.well-banner').waitFor();
  await page.getByRole('button', { name: 'Start streaming', exact: true }).click();
  let previous = await page.locator('.shell').getAttribute('data-stream-ts');
  for (let i = 1; i <= 12; i++) {
    await page.waitForFunction(ts => document.querySelector('.shell')?.getAttribute('data-stream-ts') !== ts, previous, { timeout: 15000 });
    const ts = await page.locator('.shell').getAttribute('data-stream-ts');
    frames.push({ step: i, received: Date.now(), timestamp: ts, values: await page.locator('.well-header-metric strong').allInnerTexts() });
    previous = ts;
  }
  await page.getByRole('button', { name: 'Stop streaming', exact: true }).click();
  const intervals = frames.slice(1).map((frame, i) => (frame.received - frames[i].received) / 1000);
  assert(intervals.every(interval => interval >= 4 && interval <= 6), JSON.stringify(intervals));
  assert(new Set(frames.map(f => f.values[0])).size >= 5);
  assert(new Set(frames.map(f => f.values[1])).size >= 2);
  assert(new Set(frames.map(f => f.values[2])).size >= 5);
  assert.equal(errors.length, 0); assert.equal(forbidden.length, 0);
  await page.screenshot({ path: `${output}/visible-public-playback.png` });
  const report = { status: 'PASS', base, wallClockUpdates: frames.length, intervalsSeconds: intervals, frames,
    errors, forbiddenRequests: forbidden, basis: 'Actual foreground browser wall-clock cadence; no clock override' };
  await writeFile(`${output}/wall-clock-playback.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ status: report.status, wallClockUpdates: frames.length,
    minimumInterval: Math.min(...intervals), maximumInterval: Math.max(...intervals) }));
} finally { await browser.close(); }
