// Shared by the click-through scripts. A failed check, or an error the page
// logged, makes the command exit non-zero: printing FAIL is not enough.
let failed = 0;
let skipped = 0;

function ok(name, cond) {
  console.log((cond ? 'PASS ' : 'FAIL ') + name);
  if (!cond) failed += 1;
}

/** For a check that cannot run here (for example, no model key on this machine). Reported, never counted as a pass. */
function skip(name, why) {
  console.log('SKIP ' + name + ' (' + why + ')');
  skipped += 1;
}

/** Call once at the end, after closing the browser. */
function finish(problems = []) {
  console.log('problems:', problems.length ? problems : 'none');
  if (failed > 0 || problems.length > 0) {
    console.error(`RESULT: FAILED. ${failed} check(s) failed, ${problems.length} page problem(s).`);
    process.exit(1);
  }
  console.log(`RESULT: all checks passed${skipped ? `, ${skipped} skipped` : ''}.`);
}

/** Approves the version on screen. The panel may have nothing preselected, so pick Approve first. */
async function approve(page, versionNumber) {
  await page.waitForSelector('form[aria-label="Your decision"]');
  await page.click('form[aria-label="Your decision"] button:has-text("Approve this version")');
  await page.click(`button[type=submit]:has-text("Approve version ${versionNumber}")`);
}

function fail(e) {
  console.error('SCRIPT ERROR', String(e && e.message ? e.message : e).split('\n')[0]);
  process.exit(1);
}

module.exports = { ok, skip, finish, approve, fail };
