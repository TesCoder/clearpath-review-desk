// The reviewer flow: queue, review screen, a request, an approval, the reschedule case, reset, phone width.
// Runs in a fresh headless browser. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const { ok, finish, approve, fail } = require('./harness');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || require('node:os').tmpdir();
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));

  let r = await page.goto(BASE + '/');
  ok('queue loads 200', r.status() === 200);
  ok('CSP header present', /script-src 'self' 'nonce-/.test(r.headers()['content-security-policy'] || ''));
  const refs = await page.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));
  console.log('rows', refs.join(' '));
  ok('hero is first in queue', refs[0] === 'AD-1041:revised');
  await page.screenshot({ path: SHOTS + '/1-queue.png', fullPage: true });

  await page.click('a:visible:has-text("AD-1041")');
  await page.waitForSelector('h1:has-text("AD-1041")');
  const body = await page.innerText('main');
  ok('APR request shown resolved', /Resolved/.test(body) && /now says "8\.99% APR"/.test(body));
  ok('new fee claim flagged', /New claim, not in version 1: .?No origination fee/.test(body));
  ok('offer terms shown', /Lowest APR\s*8\.99%/.test(body) && /Origination fee\s*2%/.test(body));
  const draft = await page.inputValue('textarea[name=comment]');
  console.log('draft:', draft);
  ok('draft comment prefilled', /2\.00% origination fee/.test(draft) && /remove this sentence or state the fee/.test(draft));
  await page.screenshot({ path: SHOTS + '/2-review-v2.png', fullPage: true });

  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  ok('request recorded', (await page.innerText('main')).includes('Changes requested'));
  await page.reload();
  ok('request survives reload', (await page.innerText('main')).includes('remove this sentence or state the fee'));
  await page.screenshot({ path: SHOTS + '/3-requested.png', fullPage: true });

  await page.goto(BASE + '/ads/AD-1042');
  ok('an ad with nothing flagged says "No detected offer mismatch", not "clean"', /No detected offer mismatch/.test(await page.innerText('main')));
  await approve(page, 1);
  await page.waitForSelector('text=Approved copy');
  await page.screenshot({ path: SHOTS + '/4-approved.png', fullPage: true });

  await page.goto(BASE + '/ads/AD-1033');
  const resched = await page.innerText('main');
  ok('reschedule case explained', /Same words, new date/.test(resched) && /lowest APR on the Winter Personal Loan offer from Jan 1, 2027 is 9\.49%/.test(resched));
  await page.screenshot({ path: SHOTS + '/5-rescheduled.png', fullPage: true });
  // approving with an open mismatch needs the acknowledgement
  await page.click('button:has-text("Approve this version")');
  await page.click('button[type=submit]:has-text("Approve version 1")');
  await page.waitForSelector('form [role=alert]');
  ok('approve with open mismatch refused without the tick', /Tick the box/.test(await page.innerText('form [role=alert]')));

  await page.goto(BASE + '/');
  const after = await page.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));
  console.log('rows after', after.join(' '));
  await page.click('button:has-text("Reset demo")');
  await page.waitForSelector('text=back to its starting ads');
  const reset = await page.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));
  ok('reset restores the seed', reset.join() === refs.join());

  // phone width
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/ads/AD-1041');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  ok('no sideways scroll on phone (' + overflow + 'px)', overflow <= 1);
  await page.screenshot({ path: SHOTS + '/6-phone.png', fullPage: true });

  await browser.close();
  finish(problems);
})().catch(fail);
