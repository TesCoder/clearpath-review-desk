// The measures view follows the demo: a request for changes adds one to an
// ad's count, and an approval leaves the count alone and shows the turnaround.
// Runs in a fresh headless browser. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:3000';
(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage();
  const problems = [];
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
  const ok = (name, cond) => console.log((cond ? 'PASS ' : 'FAIL ') + name);
  const row = async () => {
    await page.goto(BASE + '/measures');
    const r = page.locator('tr[data-measure-ref="AD-1041"]');
    return {
      sentBack: Number(await r.getAttribute('data-sent-back')),
      withWhom: await r.getAttribute('data-with'),
      turnaround: (await r.locator('[data-cell=turnaround]').innerText()).trim(),
    };
  };

  await page.goto(BASE + '/');
  ok('the queue is still the landing page', (await page.innerText('h1')) === 'Review queue');
  await page.click('header a:has-text("Measures")');
  await page.waitForURL('**/measures');
  const body = await page.innerText('main');
  ok('labeled as fictional demo activity', /Fictional demo activity/.test(body));
  ok('elapsed time labeled as including waits', /Elapsed time includes waits between people/.test(body));
  const before = await row();
  console.log('before:', JSON.stringify(before));
  ok('seeded: sent back once, with the reviewer, no turnaround', before.sentBack === 1 && before.withWhom === 'reviewer' && /Not approved/.test(before.turnaround));

  await page.click('tr[data-measure-ref="AD-1041"] a');           // open the ad from the view
  await page.waitForSelector('h1:has-text("AD-1041")');
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  const requested = await row();
  console.log('after request:', JSON.stringify(requested));
  ok('requesting the fee correction adds exactly one', requested.sentBack === before.sentBack + 1 && requested.withWhom === 'marketer');

  await page.goto(BASE + '/ads/AD-1041');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.fill('textarea[name=body]', 'Compare ClearPath personal loans. Rates from 8.99% APR.');
  await page.click('button:has-text("Send version 3 for review")');
  await page.waitForSelector('text=Sent for review as version 3');
  const resubmitted = await row();
  ok('resubmitting leaves the count alone and hands it to the reviewer', resubmitted.sentBack === requested.sentBack && resubmitted.withWhom === 'reviewer');
  await page.goto(BASE + '/ads/AD-1041');
  await page.click('button:has-text("Review version 3 as the reviewer")');
  await page.waitForSelector('button[type=submit]:has-text("Approve version 3")');
  await page.click('button[type=submit]:has-text("Approve version 3")');
  await page.waitForSelector('text=Approved copy');
  const approved = await row();
  console.log('after approval:', JSON.stringify(approved));
  ok('approving version 3 leaves the count alone', approved.sentBack === requested.sentBack);
  ok('the turnaround appears on approval', /\d+ (day|hour|min)/.test(approved.turnaround) && approved.withWhom === 'no one');

  console.log('problems:', problems.length ? problems : 'none');
  await browser.close();
})().catch(e => { console.error('SCRIPT ERROR', e.message.split('\n')[0]); process.exit(1); });
