// Following one ad across roles without a list, refusing a date with no offer terms, and the phone layout.
// Runs in a fresh headless browser. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || require('node:os').tmpdir();
const V3 = 'Compare ClearPath personal loans. Rates from 8.99% APR.';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
  const onAd = async () => { await page.waitForURL('**/ads/AD-1041**'); await page.waitForSelector('h1:has-text("AD-1041")'); };

  // 2. Follow one ad from request to approved copy without searching a list.
  await page.goto(BASE + '/');
  await page.click('a:visible:has-text("AD-1041")');           // the only list click
  await onAd();
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  ok('request → marketer view of the same ad, no list', page.url().includes('/ads/AD-1041'));
  ok('hint no longer says to open the ad you are on', !(await page.innerText('header')).includes('open AD-1041'));
  await page.fill('textarea[name=body]', V3);
  await page.click('button:has-text("Send version 3 for review")');
  await page.waitForSelector('text=Sent for review as version 3');
  await page.click('button:has-text("Review version 3 as the reviewer")');
  await page.waitForSelector('button[type=submit]:has-text("Approve version 3")');
  ok('submit → reviewer view of the same ad, no list', page.url().includes('/ads/AD-1041'));
  await page.click('button[type=submit]:has-text("Approve version 3")');
  await page.waitForSelector('text=Approved copy');
  await page.click('button:has-text("See it as the marketer")');
  await page.waitForSelector('text=Copy approved text');
  ok('approval → marketer sees the approved copy, no list', (await page.innerText('#approved-copy')).trim() === V3);
  // header switch also stays on the ad
  await page.click('header button[value=reviewer]');
  await page.waitForFunction(() => document.querySelector('header button[value=reviewer]').getAttribute('aria-pressed') === 'true');
  ok('header role switch stays on the same ad', page.url().includes('/ads/AD-1041'));
  await page.click('header button[value=marketer]');
  await page.waitForSelector('text=Move this ad');

  // 1. An uncovered date is rejected on the same form, corrected, and review completes.
  await page.fill('input[name=plannedDate]', '2026-06-01');
  await page.click('button:has-text("Move this ad")');
  await page.waitForSelector('form [role=alert]');
  const alert = await page.innerText('form [role=alert]');
  console.log('alert:', alert);
  ok('uncovered date is refused with the covered dates named', /No Winter Personal Loan terms are in effect on Jun 1, 2026/.test(alert) && /Nov 1, 2026 onward/.test(alert));
  ok('ad is still approved after the refused move', /approved copy/i.test(await page.innerText('main')));
  await page.fill('input[name=plannedDate]', '2026-12-20');
  await page.click('button:has-text("Move this ad")');
  await page.waitForSelector('text=back in the review queue');
  await page.click('button:has-text("Review it as the reviewer")');
  await page.waitForSelector('button[type=submit]:has-text("Approve version 3")');
  await page.click('button:has-text("Approve this version")');
  await page.click('button[type=submit]:has-text("Approve version 3")');
  await page.waitForSelector('text=Approved copy');
  ok('corrected date completes review without a reset', /for Dec 20, 2026/.test(await page.innerText('main')));
  // the submit form also refuses an uncovered date
  await page.click('button:has-text("See it as the marketer")');
  await page.waitForSelector('text=Copy approved text');
  await page.goto(BASE + '/marketer/new');
  await page.fill('input[name=plannedDate]', '2026-06-01');
  await page.fill('textarea[name=body]', 'Rates from 8.99% APR.');
  ok('submit form names the covered dates and disables submit', /It has terms for Nov 1, 2026 onward/.test(await page.innerText('[aria-live=polite]')) && await page.isDisabled('button:has-text("Submit for review")'));

  // 3. Phone: identify the revised ad and its flag without swiping; reach the decision before history.
  await page.click('button:has-text("Reset demo")');
  await page.waitForSelector('text=back to its starting ads');
  await page.click('header button[value=reviewer]');
  await page.waitForURL(BASE + '/');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/');
  const card = await page.innerText('li[data-card-ref="AD-1041"]');
  const box = await page.locator('li[data-card-ref="AD-1041"]').boundingBox();
  ok('phone queue card shows status and flag within the screen', /Revised, waiting for review/.test(card) && /1 flag to check/.test(card) && box.x >= 0 && box.x + box.width <= 390);
  ok('phone queue has no sideways scroll', await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  await page.screenshot({ path: SHOTS + '/20-phone-queue.png', fullPage: true });
  await page.click('li[data-card-ref="AD-1041"] a');
  await page.waitForSelector('h1:has-text("AD-1041")');
  const yDecision = (await page.locator('form[aria-label="Your decision"]').boundingBox()).y;
  const yHistory = (await page.locator('section:has(h2:has-text("History"))').boundingBox()).y;
  ok('phone: the decision comes before the history', yDecision < yHistory);
  ok('no "asa" spacing slip', !/\basa\b/.test(await page.innerText('main')));
  await page.screenshot({ path: SHOTS + '/21-phone-ad.png', fullPage: true });

  console.log('problems:', problems.length ? problems : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1); });
