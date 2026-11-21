// Answers to a request, side by side: one revision deletes the false fee
// sentence, one rewords it, and one answers only half of a two-part request.
// Only the deletion under the app's own single-claim request may be marked
// green label; the others must ask the reviewer to confirm. The screen never says "Resolved".
// Runs in fresh headless browsers. Usage: BASE=https://your-site npm run e2e   (default http://localhost:3000)
const { chromium } = require('playwright');
const { ok, finish, fail } = require('./harness');
const BASE = process.env.BASE || 'http://localhost:3000';
const problems = [];
const watch = (page) => {
  page.on('console', (m) => { if (m.type() === 'error') problems.push('console: ' + m.text()); });
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  return page;
};
const DELETED = 'Compare ClearPath personal loans. Rates from 8.99% APR.';
const WAIVED = 'Compare ClearPath personal loans. Rates from 8.99% APR. We waive the origination fee for every borrower.';

async function reviseTo(browser, text, ownWords) {
  const page = watch(await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage());
  await page.goto(BASE + '/ads/AD-1041');
  // By default the request is the app's own draft, sent unedited.
  if (ownWords) await page.fill('textarea[name=comment]', ownWords);
  await page.click('button[type=submit]:has-text("Request changes")');
  await page.click('button:has-text("Open AD-1041 as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.fill('textarea[name=body]', text);
  await page.click('button:has-text("Send version 3 for review")');
  await page.click('button:has-text("Review version 3 as the reviewer")');
  await page.waitForSelector('form[aria-label="Your decision"]');
  const since = await page.innerText('section:has(h2:has-text("Since version 2"))');
  return since.replace(/\n+/g, ' | ');
}

// A new ad that states a wrong minimum and a correct maximum. The reviewer
// sends the app's own request about the minimum; the marketer answers with
// `revised`. Returns what the reviewer then sees about that request.
async function minimumAndMaximum(browser, revised) {
  const page = watch(await (await browser.newContext({ viewport: { width: 1360, height: 900 } })).newPage());
  await page.goto(BASE + '/');
  await page.click('header button[value=marketer]');
  await page.waitForURL('**/marketer');
  await page.goto(BASE + '/marketer/new');
  await page.fill('input[name=plannedDate]', '2026-12-04');
  await page.fill('input[name=title]', 'Minimum and maximum');
  await page.fill('textarea[name=body]', 'Rates from 6.99% APR. Maximum APR is 35.99%.');
  await page.click('button:has-text("Submit for review")');
  await page.waitForSelector('text=Sent for review as version 1');
  await page.click('button:has-text("Review version 1 as the reviewer")');
  await page.waitForSelector('form[aria-label="Your decision"]');
  await page.click('button[type=submit]:has-text("Request changes")'); // the drafted request about 6.99% APR, unedited
  await page.waitForSelector('text=Request sent');
  await page.click('button:has-text("as the marketer")');
  await page.waitForSelector('text=Fix the ad and send it back');
  await page.fill('textarea[name=body]', revised);
  await page.click('button:has-text("Send version 2 for review")');
  await page.waitForSelector('text=Sent for review as version 2');
  await page.click('button:has-text("Review version 2 as the reviewer")');
  await page.waitForSelector('form[aria-label="Your decision"]');
  const since = await page.innerText('section:has(h2:has-text("Since version 1"))');
  return since.replace(/\n+/g, ' | ');
}

(async () => {
  const browser = await chromium.launch();
  const TWO_PART = 'Remove the fee line and add the full APR range, 8.99% to 35.99%.';
  const [deleted, waived, partial, stillWrong, corrected, different] = await Promise.all([
    reviseTo(browser, DELETED),
    reviseTo(browser, WAIVED),
    reviseTo(browser, DELETED, TWO_PART), // fixes the fee line only; the range was never added
    minimumAndMaximum(browser, 'Our APR range is 6.99\u201335.99%. Maximum APR is 35.99%.'), // the minimum is still wrong
    minimumAndMaximum(browser, 'Rates from 8.99% APR. Maximum APR is 35.99%.'), // the minimum is corrected
    minimumAndMaximum(browser, 'Rates from 12.49% APR. Maximum APR is 35.99%.'), // a different figure than the one requested
  ]);
  console.log('deleted:', deleted.slice(0, 420));
  console.log('waived: ', waived.slice(0, 520));
  ok('deletion is reported as a removal', /Flagged claim removed/.test(deleted) && /The claim was removed, and nothing was added/.test(deleted));
  ok('deletion shows the exact change', /No origination fee\./.test(deleted) && /Nothing was added in this version/.test(deleted));
  ok('the waiver never gets a green label', !/Requested figure is present|Flagged claim removed/.test(waived));
  ok('the waiver asks the reviewer to confirm', /Wording changed, please confirm/i.test(waived) && /Confirm the revision addresses your request/.test(waived));
  ok('the waiver sentence is shown as added wording to read', /Wording added in this version/i.test(waived) && /We waive the origination fee for every borrower/.test(waived));
  ok('the waiver gets no "nothing was added" line', !/Nothing was added in this version/.test(waived));
  ok('the waiver sentence is listed once, not twice', (waived.match(/We waive the origination fee for every borrower/g) || []).length <= 2);
  console.log('partial:', partial.slice(0, 420));
  ok('a two-part request with one part done never gets a green label', !/Requested figure is present|Flagged claim removed/.test(partial));
  ok('it says what was verified and asks the reviewer to confirm the rest', /Check passes, confirm the rest/i.test(partial) && /Confirm the rest of your request/.test(partial));
  console.log('still wrong:', stillWrong.slice(0, 520));
  console.log('corrected:  ', corrected.slice(0, 360));
  ok('an unchanged maximum never closes a request about the minimum', !/Requested figure is present|Flagged claim removed/.test(stillWrong) && !/which matches the offer/.test(stillWrong));
  ok('the still-wrong minimum asks the reviewer to confirm', /Wording changed, please confirm/i.test(stillWrong) && /Confirm the revision addresses your request/.test(stillWrong));
  ok('the range the check could not read is put in front of the reviewer', /6\.99\u201335\.99%/.test(stillWrong));
  ok('a direct correction shows the change and that the requested figure is present', /Requested figure is present/.test(corrected) && /6\.99% APR \u2192 8\.99% APR/.test(corrected));
  console.log('different:  ', different.slice(0, 420));
  ok('a different figure inside the range is not reported as the requested one', !/Requested figure is present|Flagged claim removed/.test(different) && /Wording changed, please confirm/i.test(different) && /not the one requested/.test(different) && /6\.99% APR \u2192 12\.49% APR/.test(different));
  ok('the word Resolved appears on none of these screens', ![deleted, waived, partial, stillWrong, corrected, different].some((t) => /\bResolved\b/.test(t)));
  await browser.close();
  finish(problems);
})().catch(fail);
