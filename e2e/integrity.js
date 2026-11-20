// What an approval is tied to, and what the checks refuse to guess.
//   1. An old tab cannot approve a date and placement the reviewer never saw.
//   2. Two approvals sent at the same moment record one decision.
//   3. A fee that is not the origination fee gets no one-click fix.
//   4. Products the desk is not set up for cannot be chosen.
//   5. The queue shows the AI's read beside the offer check.
// Runs in fresh headless browsers. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const { ok, skip, finish, fail } = require('./harness');
const BASE = process.env.BASE || 'http://localhost:3000';

const watch = (page, problems) => {
  page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text().slice(0, 200)); });
  page.on('pageerror', e => problems.push('pageerror: ' + e.message));
};
const as = async (page, role) => {
  await page.click('header button[value=' + role + ']');
  await page.waitForFunction((r) => document.querySelector('header button[value=' + r + ']').getAttribute('aria-pressed') === 'true', role);
};
const approvals = async (page) => ((await page.innerText('section:has(h2:has-text("History"))')).match(/Approved by/g) || []).length;

(async () => {
  const browser = await chromium.launch();
  const problems = [];

  // 1. The old tab. Tab A opens the approval screen and is never reloaded.
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const tabA = await ctx.newPage(); watch(tabA, problems);
    const tabB = await ctx.newPage(); watch(tabB, problems);
    await tabA.goto(BASE + '/ads/AD-1042');
    await tabA.waitForSelector('form[aria-label="Your decision"]');
    // Tab B: approve it, then as the marketer move it to another date and placement.
    await tabB.goto(BASE + '/ads/AD-1042');
    await tabB.waitForSelector('form[aria-label="Your decision"]');
    await tabB.click('form[aria-label="Your decision"] button:has-text("Approve this version")');
    await tabB.click('button[type=submit]:has-text("Approve version 1")');
    await tabB.waitForSelector('text=Approved copy');
    await as(tabB, 'marketer');
    await tabB.waitForSelector('text=Move this ad');
    await tabB.fill('input[name=plannedDate]', '2026-12-20');
    await tabB.selectOption('form:has(button:has-text("Move this ad")) select[name=placement]', 'Social post');
    await tabB.click('button:has-text("Move this ad")');
    await tabB.waitForSelector('text=back in the review queue');
    await as(tabB, 'reviewer');
    // Tab A still shows the old date and placement. Approve from it.
    await tabA.click('form[aria-label="Your decision"] button:has-text("Approve this version")');
    const stale = await tabA.innerText('form[aria-label="Your decision"]');
    ok('old tab still describes the original date and placement', /Dec 10, 2026/.test(stale) && /blog article/.test(stale));
    await tabA.click('button[type=submit]:has-text("Approve version 1")');
    await tabA.waitForSelector('form[aria-label="Your decision"] [role=alert]');
    const refusal = await tabA.innerText('form[aria-label="Your decision"] [role=alert]');
    console.log('old tab:', refusal);
    ok('old tab is refused, with the reason', /changed since this page was loaded/.test(refusal));
    await tabB.goto(BASE + '/ads/AD-1042');
    const now = await tabB.innerText('main');
    ok('no approval was recorded for the new date and placement', (await approvals(tabB)) === 1 && /Rescheduled placement needs review/.test(now) && !/for Dec 20, 2026/.test(await tabB.innerText('section:has(h2:has-text("History"))')));
    await ctx.close();
  }

  // 2. Two approvals at the same moment, from two tabs showing the same screen.
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const a = await ctx.newPage(); watch(a, problems);
    const b = await ctx.newPage(); watch(b, problems);
    for (const p of [a, b]) {
      await p.goto(BASE + '/ads/AD-1042');
      await p.waitForSelector('form[aria-label="Your decision"]');
      await p.click('form[aria-label="Your decision"] button:has-text("Approve this version")');
    }
    await Promise.all([a, b].map((p) => p.click('button[type=submit]:has-text("Approve version 1")')));
    await Promise.all([a, b].map((p) => p.waitForSelector('text=Approved copy, form[aria-label="Your decision"] [role=alert]').catch(() => {})));
    await a.waitForTimeout(1500);
    await a.goto(BASE + '/ads/AD-1042');
    const count = await approvals(a);
    console.log('approvals recorded for two simultaneous clicks:', count);
    ok('two simultaneous approvals record exactly one decision', count === 1);
    await ctx.close();
  }

  // 3 and 4. The submit form.
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctx.newPage(); watch(p, problems);
    await p.goto(BASE + '/');
    await as(p, 'marketer');
    await p.goto(BASE + '/marketer/new');
    await p.fill('input[name=plannedDate]', '2026-12-04');
    await p.fill('textarea[name=body]', 'Rates from 8.99% APR. A 0% prepayment fee applies.');
    const prepay = await p.innerText('[aria-live=polite]');
    console.log('prepayment fee:', prepay.replace(/\n+/g, ' | ').slice(0, 260));
    ok('a prepayment fee gets no "Change to" button', (await p.$$('[aria-live=polite] button:has-text("Change to")')).length === 0);
    ok('a prepayment fee is held for the reviewer, not compared with the origination fee', /could not read it as a rate or a fee/.test(prepay) && !/origination fee/.test(prepay));
    await p.fill('textarea[name=body]', 'Rates from 8.99% APR. 0% origination fee.');
    const orig = await p.innerText('[aria-live=polite]');
    ok('a 0% origination fee still flags, with its fix', /lists a 2\.00% origination fee/.test(orig) && (await p.$$('[aria-live=polite] button:has-text("Change to: 2%")')).length === 1);
    // A stated maximum is not the offer's lowest rate: no edit is offered, and the old edit's result is not a match.
    await p.fill('textarea[name=body]', 'The maximum APR is 6.99%.');
    const maxLow = await p.innerText('[aria-live=polite]');
    ok('a wrong stated maximum flags with no "Change to" button', /states a maximum APR of 6\.99%/.test(maxLow) && (await p.$$('[aria-live=polite] button:has-text("Change to")')).length === 0);
    await p.fill('textarea[name=body]', 'The maximum APR is 8.99%.');
    const maxEdited = await p.innerText('[aria-live=polite]');
    ok('"The maximum APR is 8.99%" is held, not passed', /states a maximum APR of 8\.99%/.test(maxEdited) && !/is within the offer/.test(maxEdited));
    await p.fill('textarea[name=body]', 'Interest rate 6.99%, APR 8.99%.');
    ok('an interest rate beside an APR gets no "Change to" button', (await p.$$('[aria-live=polite] button:has-text("Change to")')).length === 0);
    await p.fill('textarea[name=body]', 'Rates from 6.99% APR.');
    ok('a stated lowest rate still flags, with its edit', (await p.$$('[aria-live=polite] button:has-text("Change to: 8.99% APR")')).length === 1);
    const options = await p.$$eval('select[name=offerId] option', (els) => els.map((e) => ({ text: e.textContent.trim(), disabled: e.disabled })));
    console.log('offers:', JSON.stringify(options));
    ok('only the personal loan can be chosen', options.filter((o) => !o.disabled).length === 1 && /personal loan/i.test(options.find((o) => !o.disabled).text));
    ok('the other products say they are not set up yet', options.filter((o) => o.disabled).every((o) => /not set up yet/.test(o.text)) && options.filter((o) => o.disabled).length === 2);
    await ctx.close();
  }

  // 5. The queue's AI column, after the reviewer has opened an ad.
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const p = await ctx.newPage(); watch(p, problems);
    await p.goto(BASE + '/ads/AD-1036');
    await p.waitForFunction(() => !document.body.innerText.includes('The AI is reading the ad'), null, { timeout: 40000 }).catch(() => {});
    const card = await p.innerText('section:has(h2:has-text("AI claim finder"))');
    await p.goto(BASE + '/');
    const cell = (await p.innerText('tr[data-ref="AD-1036"] [data-cell=ai]')).trim();
    const flags = (await p.innerText('tr[data-ref="AD-1036"]')).replace(/\s+/g, ' ');
    console.log('AD-1036 queue row:', flags);
    ok('the queue never says "No open flags"', !/No open flags/.test(await p.innerText('main')));
    if (/unavailable/i.test(card)) {
      skip('queue shows the AI finding for AD-1036', 'no model available on this server');
      ok('with no model, the queue says the AI has not run', /AI: not run yet/.test(cell));
    } else {
      ok('queue shows the AI read for AD-1036 beside the offer check', /AI: (\d+ to read|incomplete)/.test(cell) && /No offer-check flags/.test(flags));
    }
    await ctx.close();
  }

  // 6. Two marketer tabs start from the same version. The second save is refused, so it cannot bring back old words.
  {
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    const a = await ctx.newPage(); watch(a, problems);
    await a.goto(BASE + '/ads/AD-1041');
    await a.click('button[type=submit]:has-text("Request changes")');
    await a.waitForSelector('text=Request sent');
    await a.click('button:has-text("Open AD-1041 as the marketer")');
    await a.waitForSelector('text=Fix the ad and send it back');
    const b = await ctx.newPage(); watch(b, problems);
    await b.goto(BASE + '/ads/AD-1041');
    await b.waitForSelector('text=Fix the ad and send it back');
    await a.fill('textarea[name=body]', 'Compare ClearPath personal loans. Rates from 8.99% APR.');
    await a.click('button:has-text("Send version 3 for review")');
    await a.waitForSelector('text=Sent for review as version 3');
    await b.fill('textarea[name=body]', 'Compare ClearPath personal loans. Rates from 6.99% APR. A 2% origination fee applies.');
    await b.click('button:has-text("Send version 3 for review")');
    await b.waitForSelector('form [role=alert]');
    const refused = await b.innerText('form [role=alert]');
    console.log('second marketer tab:', refused);
    ok('an edit started from an older version is refused', /was submitted after you started this edit/.test(refused));
    await a.goto(BASE + '/ads/AD-1041');
    ok('the first tab keeps its version 3, and no version 4 was created', /Version 3/.test(await a.innerText('main')) && !/Version 4/.test(await a.innerText('main')));
    await ctx.close();
  }

  await browser.close();
  finish(problems);
})().catch(fail);
