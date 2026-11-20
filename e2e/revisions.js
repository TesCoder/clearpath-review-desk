// Two answers to the same request, side by side: one revision deletes the
// false fee sentence, the other rewords it. Only the deletion may be marked
// resolved; the reworded claim must ask the reviewer to confirm.
// Runs in fresh headless browsers. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
const DELETED = 'Compare ClearPath personal loans. Rates from 8.99% APR.';
const WAIVED = 'Compare ClearPath personal loans. Rates from 8.99% APR. We waive the origination fee for every borrower.';

async function reviseTo(browser, text) {
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  await page.goto(BASE + '/ads/AD-1041');
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.fill('textarea[name=body]', text);
  await page.click('button:has-text("Send version 3 for review")');
  await page.click('button:has-text("Review version 3 as the reviewer")');
  await page.waitForSelector('button[type=submit]:has-text("Approve version 3")');
  const since = await page.innerText('section:has(h2:has-text("Since version 2"))');
  return since.replace(/\n+/g, ' | ');
}

(async () => {
  const browser = await chromium.launch();
  const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
  const [deleted, waived] = await Promise.all([reviseTo(browser, DELETED), reviseTo(browser, WAIVED)]);
  console.log('deleted:', deleted.slice(0, 420));
  console.log('waived: ', waived.slice(0, 520));
  ok('deletion is marked resolved', /Resolved/.test(deleted) && /The claim was removed, and nothing was added/.test(deleted));
  ok('deletion shows the exact change', /No origination fee\./.test(deleted) && /Nothing was added in this version/.test(deleted));
  ok('the waiver is never marked resolved', !/\bResolved\b/.test(waived));
  ok('the waiver asks the reviewer to confirm', /Wording changed, please confirm/i.test(waived) && /Confirm the revision addresses your request/.test(waived));
  ok('the waiver sentence is shown as added wording to read', /Wording added in this version/i.test(waived) && /We waive the origination fee for every borrower/.test(waived));
  ok('the waiver gets no "nothing was added" line', !/Nothing was added in this version/.test(waived));
  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1); });
