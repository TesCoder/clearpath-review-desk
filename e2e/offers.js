// An offer sheet change sends approved ads back to review, in one visitor's demo only.
// Runs in fresh headless browsers. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const { ok, finish, approve, fail } = require('./harness');
const BASE = process.env.BASE || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || require('node:os').tmpdir();
const V3 = 'Compare ClearPath personal loans. Rates from 8.99% APR.';

(async () => {
  const browser = await chromium.launch();
  const problems = [];
  const watch = (page) => {
    page.on('console', m => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
    page.on('pageerror', e => problems.push('pageerror: ' + e.message));
    page.on('dialog', d => { problems.push('DIALOG: ' + d.message()); d.dismiss(); });
  };
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const page = await ctx.newPage(); watch(page);
  const queue = () => page.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));

  // 1. The demo's main loop first: AD-1041 version 3 is approved for Dec 8, 2026 against revision 1.
  await page.goto(BASE + '/ads/AD-1041');
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.fill('textarea[name=body]', V3);
  await page.click('button:has-text("Send version 3 for review")');
  await page.waitForSelector('text=Sent for review as version 3');
  await page.click('button:has-text("Review version 3 as the reviewer")');
  await approve(page, 3);
  await page.waitForSelector('text=Approved copy');
  ok('AD-1041 version 3 is approved against revision 1', /checked against Winter Personal Loan revision 1/.test(await page.innerText('main')));

  // 2. The offer sheet before the change, and the preview before saving.
  await page.click('header a:has-text("Offer sheet")');
  await page.waitForSelector('h1:has-text("Offer sheet")');
  const before = await page.innerText('main');
  ok('the sheet lists revision 1 and revision 2 with the dates each is in effect',
    /Nov 1, 2026 to Dec 31, 2026/.test(before) && /Jan 1, 2027 onward/.test(before));
  await page.fill('input[name=effectiveFrom]', '2026-12-01');
  const preview = () => page.innerText('[data-preview=offer-revision]');
  ok('unchanged terms cannot be saved', /already in effect on Dec 1, 2026/.test(await preview()) && await page.isDisabled('button:has-text("Add revision 3")'));
  await page.fill('input[name=aprMin]', '40');
  ok('a lowest APR above the highest is refused before saving', /cannot be above the highest APR/.test(await preview()) && await page.isDisabled('button:has-text("Add revision 3")'));
  await page.fill('input[name=aprMin]', '9.49');
  const shown = await preview();
  console.log('preview:', shown.replace(/\s+/g, ' '));
  ok('the preview gives the dates the revision would be in effect',
    /Revision 3 would be in effect Dec 1, 2026 to Dec 31, 2026\. Revision 2 takes over on Jan 1, 2027\./.test(shown) && /replaces revision 1/.test(shown));
  ok('the preview shows the changed term', /Lowest APR 8\.99% → 9\.49%/.test(shown));
  ok('the preview names the approved ads it would send back', /2 approved ads are planned in that period/.test(shown) && /AD-1038/.test(shown) && /AD-1041/.test(shown));
  await page.screenshot({ path: SHOTS + '/20-offer-preview.png', fullPage: true });

  // 3. Save. The confirmation lists the affected approvals.
  await page.click('button:has-text("Add revision 3")');
  await page.waitForSelector('[data-banner=revision-saved]');
  const saved = await page.innerText('[data-banner=revision-saved]');
  const receiptUrl = page.url();
  console.log('saved:', saved.replace(/\s+/g, ' '));
  ok('the confirmation says how many approved ads now need review', /2 approved ads now need review because the offer changed/.test(saved));
  ok('each affected ad is listed with what the re-check found',
    /AD-1038, Quillon Deals Letter, email newsletter, Dec 3, 2026: 1 claim no longer matches the new terms/.test(saved) &&
    /AD-1041, Pinecrest Compare, comparison site listing, Dec 8, 2026: 1 claim no longer matches the new terms/.test(saved));
  ok('the confirmation says no AI call was made', /No AI call was made/.test(saved));
  const after = await page.innerText('main');
  ok('revision 1 now ends the day before, and revision 3 is marked as added in this demo',
    /Nov 1, 2026 to Nov 30, 2026/.test(after) && /Added in this demo/.test(after) && /Dec 1, 2026 to Dec 31, 2026/.test(after));
  await page.screenshot({ path: SHOTS + '/21-offer-saved.png', fullPage: true });

  // 4. The queue: the two ads are first, with the reason.
  await page.click('[data-banner=revision-saved] a:has-text("Open the review queue")');
  await page.waitForSelector('h1:has-text("Review queue")');
  const q = await queue();
  console.log('queue:', q.join(' '));
  ok('both ads are at the top of the queue with the offer-changed status',
    q.slice(0, 2).every(r => r.endsWith(':offer_changed')) && q.slice(0, 2).map(r => r.split(':')[0]).sort().join() === 'AD-1038,AD-1041');
  const queueText = await page.innerText('main');
  ok('the queue gives the reason', /2 approved ads need review again because the offer changed/.test(queueText) &&
    /Offer changed after approval, needs review/.test(queueText) &&
    /Approved against revision 1\. Revision 3 now applies on Dec 8, 2026\./.test(queueText));
  await page.screenshot({ path: SHOTS + '/22-queue-offer-changed.png', fullPage: true });

  // 5. The review screen: old and new terms side by side, and the same words re-checked in code.
  await page.click('a:visible:has-text("AD-1041")');
  await page.waitForSelector('h1:has-text("AD-1041")');
  await page.waitForSelector('[data-banner=offer-changed]');
  const review = await page.innerText('main');
  ok('the review screen says the offer changed and no word of the ad did',
    /The offer changed after this ad was approved/.test(review) && /Not a word of the ad changed/.test(review));
  const changedRow = await page.innerText('[data-table=offer-change] tr[data-changed=true]');
  ok('old and new terms are side by side, with the changed term marked', /Lowest APR\s+8\.99%\s+9\.49% \(changed\)/.test(changedRow) &&
    (await page.$$('[data-table=offer-change] tr[data-changed=true]')).length === 1);
  ok('the code check now flags 8.99% against the 9.49% floor',
    /The lowest APR on the Winter Personal Loan offer from Dec 1, 2026 is 9\.49%/.test(review) && /Does not match/.test(review));
  ok('the earlier approval stays on record and is marked as not covering this', /Earlier approval, still on record/i.test(review) && /does not cover what is in review now/.test(review));
  const draft = await page.inputValue('form[aria-label="Your decision"] textarea[name=comment]');
  ok('the request is drafted for the new figure', /Please change it to 9\.49% APR/.test(draft));
  await page.screenshot({ path: SHOTS + '/23-review-offer-changed.png', fullPage: true });
  for (const path of ['/ads/AD-1041', '/offers', '/']) {
    const phone = await ctx.newPage(); watch(phone);
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.goto(BASE + path);
    ok('at phone width ' + path + ' does not scroll sideways', !(await phone.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)));
    await phone.close();
  }

  // 6. The correction loop under the new terms: request, one-click fix, the requested figure is present, approve.
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.waitForSelector('text=Request sent');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.click('button:has-text("Change to: 9.49% APR")');
  ok('the marketer fixes it in one click', (await page.inputValue('textarea[name=body]')) === 'Compare ClearPath personal loans. Rates from 9.49% APR.');
  await page.click('button:has-text("Send version 4 for review")');
  await page.waitForSelector('text=Sent for review as version 4');
  await page.click('button:has-text("Review version 4 as the reviewer")');
  await page.waitForSelector('form[aria-label="Your decision"]');
  ok('the revision view reports the requested figure', /8\.99% APR → 9\.49% APR/.test(await page.innerText('main')) && /Requested figure is present/.test(await page.innerText('main')));
  await approve(page, 4);
  await page.waitForSelector('text=Approved copy');
  ok('version 4 is approved against revision 3', /checked against Winter Personal Loan revision 3/.test(await page.innerText('main')));

  // 7. The other affected ad, from the marketer's side: told not to publish, and able to fix it without waiting.
  await page.goto(BASE + '/ads/AD-1038');
  await page.click('header button[value=marketer]');
  await page.waitForSelector('text=Change the text for the new terms');
  const marketer = await page.innerText('main');
  ok('the marketer is told the approval no longer covers the ad', /Do not publish it until it is approved again/.test(marketer));
  ok('the marketer gets the one-click fix for the new floor', (await page.$$('button:has-text("Change to: 9.49% APR")')).length === 1);

  // 7b. The receipt, reloaded: "reviewed" means a reviewer decided. A marketer's edit is not a review.
  const receipt = async () => { await page.goto(receiptUrl); return (await page.innerText('[data-banner=revision-saved]')).replace(/\s+/g, ' '); };
  const afterReview = await receipt();
  console.log('receipt after one review:', afterReview);
  ok('the receipt counts the reviewed ad and the one still waiting',
    /This change sent 2 approved ads back to review\. 1 still needs a decision/.test(afterReview) &&
    /AD-1041[^:]*: reviewed since/.test(afterReview) && /AD-1038[^:]*: 1 claim no longer matches the new terms/.test(afterReview));
  await page.goto(BASE + '/ads/AD-1038');
  await page.waitForSelector('text=Change the text for the new terms');
  await page.click('button:has-text("Change to: 9.49% APR")');
  await page.click('button:has-text("for review")');
  await page.waitForSelector('text=Sent for review as version');
  const afterEdit = await receipt();
  console.log('receipt after a marketer edit:', afterEdit);
  ok('a marketer edit is not called a review: the ad still needs a decision',
    /1 still needs a decision/.test(afterEdit) && !/All have been reviewed since/.test(afterEdit) &&
    /AD-1038[^:]*: edited or moved since, still waiting for a decision/.test(afterEdit));

  // 8. The server refuses a change to the offer sheet from the Marketer view, even from a form loaded as the reviewer.
  await page.click('header button[value=reviewer]');
  await page.waitForFunction(() => document.querySelector('header button[value=reviewer]').getAttribute('aria-pressed') === 'true');
  const form = await ctx.newPage(); watch(form);
  await form.goto(BASE + '/offers');
  await form.fill('input[name=effectiveFrom]', '2027-02-01');
  await form.fill('input[name=aprMin]', '10.25');
  await page.click('header button[value=marketer]');
  await page.waitForFunction(() => document.querySelector('header button[value=marketer]').getAttribute('aria-pressed') === 'true');
  await form.click('button:has-text("Add revision 4")');
  await form.waitForSelector('form [role=alert]');
  ok('a marketer cannot change the offer sheet', /Switch to the Reviewer view to change the offer sheet/.test(await form.innerText('form [role=alert]')));
  await form.reload();
  ok('the Marketer view of the offer sheet has no form', (await form.$$('input[name=aprMin]')).length === 0 && /Compliance owns the offer sheet/.test(await form.innerText('main')));
  ok('no revision 4 was created', !(await form.$('tr[data-revision="4"]')));
  await form.close();

  // 9. A second visitor: nothing changed in their demo.
  const other = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  const p2 = await other.newPage(); watch(p2);
  await p2.goto(BASE + '/offers');
  const otherSheet = await p2.innerText('main');
  ok('another visitor sees no added revision', !/Added in this demo/.test(otherSheet) && /Nov 1, 2026 to Dec 31, 2026/.test(otherSheet) && !(await p2.$('tr[data-revision="3"]')));
  await p2.goto(BASE + '/');
  const q2 = await p2.$$eval('tr[data-ref]', els => els.map(e => e.dataset.ref + ':' + e.dataset.status));
  ok('another visitor still has AD-1038 approved and nothing sent back', q2.includes('AD-1038:approved') && !q2.some(r => r.endsWith(':offer_changed')));
  await other.close();

  // 10. Reset demo removes the added revision.
  await page.click('header button[value=reviewer]');
  await page.waitForFunction(() => document.querySelector('header button[value=reviewer]').getAttribute('aria-pressed') === 'true');
  await page.click('header button:has-text("Reset demo")');
  await page.waitForSelector('text=back to its starting ads');
  await page.goto(BASE + '/offers');
  ok('Reset demo removes the added revision', !(await page.$('tr[data-revision="3"]')) && /Nov 1, 2026 to Dec 31, 2026/.test(await page.innerText('main')));
  await page.goto(BASE + '/');
  ok('after the reset AD-1038 is approved again', (await queue()).includes('AD-1038:approved'));

  await browser.close();
  finish(problems);
})().catch(fail);
