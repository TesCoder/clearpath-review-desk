// The full correction loop, the submit form, hostile copy shown as text, and the server refusing a marketer approval.
// Runs in a fresh headless browser. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || require('node:os').tmpdir();
const V3 = 'Compare ClearPath personal loans. Rates from 8.99% APR.';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const problems = [], external = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  page.on('dialog', d => { problems.push('DIALOG: ' + d.message()); d.dismiss(); });
  page.on('request', r => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) external.push(r.url()); });
  const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
  const as = async (role) => {
    await page.click('header button[value=' + role + ']');
    await page.waitForFunction((r) => document.querySelector('header button[value=' + r + ']').getAttribute('aria-pressed') === 'true', role);
    await page.goto(BASE + (role === 'marketer' ? '/marketer' : '/'));
  };

  // 1. the correction loop
  await page.goto(BASE + '/ads/AD-1041');
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  await as('marketer');
  const first = await page.$eval('li[data-ref]', e => e.dataset.ref + ':' + e.dataset.status);
  ok('marketer sees the returned ad first', first === 'AD-1041:changes_requested');
  await page.screenshot({ path: SHOTS + '/7-marketer-home.png', fullPage: true });
  await page.click('a:visible:has-text("AD-1041")');
  await page.waitForSelector('text=Fix the ad and send it back');
  ok('marketer sees the request', (await page.innerText('main')).includes('remove this sentence or state the fee'));
  ok('live check shows the fee mismatch', (await page.innerText('[aria-live=polite]')).includes('2.00% origination fee'));
  await page.screenshot({ path: SHOTS + '/8-marketer-fix.png', fullPage: true });
  await page.fill('textarea[name=body]', V3);
  ok('live check clears after the fix', !(await page.innerText('[aria-live=polite]')).includes('origination fee'));
  await page.click('button:has-text("Send version 3 for review")');
  await page.waitForSelector('text=Sent for review as version 3');
  await as('reviewer');
  const q = await page.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));
  ok('version 3 is back at the top of the queue', q[0] === 'AD-1041:revised');
  await page.click('a:visible:has-text("AD-1041")');
  await page.waitForSelector('h1:has-text("AD-1041")');
  const v3 = await page.innerText('main');
  ok('fee request shown resolved', /Resolved/.test(v3) && /The claim was removed/.test(v3));
  ok('no new claim in v3', /Nothing was added in this version/.test(v3));
  await page.screenshot({ path: SHOTS + '/9-review-v3.png', fullPage: true });
  await page.click('button[type=submit]:has-text("Approve version 3")');
  await page.waitForSelector('text=Approved copy');
  await page.reload();
  ok('approved copy is version 3 text after reload', (await page.innerText('#approved-copy')).trim() === V3);
  await as('marketer');
  await page.click('a:visible:has-text("AD-1041")');
  await page.waitForSelector('text=Copy approved text');
  ok('marketer sees approved copy with stamp', /Version 3, fingerprint/.test(await page.innerText('main')));
  await page.screenshot({ path: SHOTS + '/10-marketer-approved.png', fullPage: true });

  // 2. move an approved ad into the later offer period
  await page.fill('input[name=plannedDate]', '2027-01-20');
  await page.click('button:has-text("Move this ad")');
  await page.waitForSelector('text=back in the review queue');
  const moved = await page.innerText('main');
  ok('moved ad needs review and the 9.49% floor applies', /Rescheduled placement needs review/.test(moved) && /9\.49%/.test(moved));

  // 3. submit form with live check and one-click fix
  await page.goto(BASE + '/marketer/new');
  await page.fill('input[name=plannedDate]', '2026-12-12');
  await page.fill('input[name=title]', 'Test listing');
  await page.fill('textarea[name=body]', 'Personal loans from 6.99% APR.');
  ok('submit form flags the stale rate', (await page.innerText('[aria-live=polite]')).includes('lowest APR on the Winter Personal Loan offer from Nov 1, 2026 is 8.99%'));
  await page.screenshot({ path: SHOTS + '/11-submit-flag.png', fullPage: true });
  await page.click('button:has-text("Change to: 8.99% APR")');
  ok('one-click fix rewrites the rate', (await page.inputValue('textarea[name=body]')) === 'Personal loans from 8.99% APR.');

  // 4. hostile copy renders as text
  const hostile = '<script>alert(1)</script> <img src=x onerror=alert(2)> ![x](https://example.com/leak.png?d=secret) [click](https://example.com) Rates from 6.99% APR.';
  await page.fill('textarea[name=body]', hostile);
  await page.fill('textarea[name=note]', '<b onmouseover=alert(3)>note</b>');
  await page.click('button:has-text("Submit for review")');
  await page.waitForSelector('text=Sent for review as version 1');
  await as('reviewer');
  const hostileRef = await page.$eval('tr[data-ref]:has-text("Test listing")', e => e.dataset.ref);
  await page.goto(BASE + '/ads/' + hostileRef);
  const shown = await page.innerText('#ad-copy');
  ok('markup shown as typed', shown.includes('<script>alert(1)</script>') && shown.includes('![x](https://example.com/leak.png?d=secret)'));
  ok('no script, image or link created from copy', (await page.$$('#ad-copy script, #ad-copy img, #ad-copy a, main img')).length === 0);
  ok('rate mismatch still flagged in hostile copy', (await page.innerText('main')).includes('The ad says 6.99% APR'));
  await page.screenshot({ path: SHOTS + '/12-hostile.png', fullPage: true });

  // 5. server rule: a marketer cannot decide, even with the reviewer's form open
  const roleCookie = (await ctx.cookies()).find(c => c.name === 'cp_role');
  await ctx.addCookies([{ ...roleCookie, value: 'marketer' }]);
  await page.click('button:has-text("Approve this version")');
  await page.check('input[name=acknowledge]');
  await page.click('button[type=submit]:has-text("Approve version 1")');
  await page.waitForSelector('form [role=alert]');
  ok('server refuses approval from the marketer role', /Only a compliance reviewer/.test(await page.innerText('form [role=alert]')));
  await ctx.addCookies([{ ...roleCookie, value: 'reviewer' }]);

  // 6. server rule: a stale reviewer page cannot approve after the text changed
  await page.goto(BASE + '/ads/AD-1038'); // approved ad
  await ctx.addCookies([{ ...roleCookie, value: 'marketer' }]);
  const other = await ctx.newPage();
  await other.goto(BASE + '/ads/AD-1038');
  await other.fill('textarea[name=body]', 'ClearPath personal loans start at 8.99% APR. Apply in minutes.');
  await other.click('button:has-text("Send version 2 for review")');
  await other.waitForSelector('text=Sent for review as version 2');
  await ctx.addCookies([{ ...roleCookie, value: 'reviewer' }]);
  await page.goto(BASE + '/ads/AD-1038'); // reviewer opens version 2
  await ctx.addCookies([{ ...roleCookie, value: 'marketer' }]);
  await other.goto(BASE + '/ads/AD-1038');
  const canEdit = await other.$('textarea[name=body]');
  console.log('marketer can edit while in review:', Boolean(canEdit));
  await other.close();
  await ctx.addCookies([{ ...roleCookie, value: 'reviewer' }]);
  const stale = await page.innerText('main');
  ok('edit after approval goes back to review', /Edited after approval/.test(stale));

  ok('no requests left the app', external.length === 0);
  if (external.length) console.log(external);
  console.log('problems:', problems.length ? problems : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1); });
