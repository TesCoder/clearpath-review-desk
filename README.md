# ClearPath ad review desk

A review desk for affiliate personal-loan ads at ClearPath Financial, a fictional consumer lender. It replaces the spreadsheet and the email thread a compliance reviewer uses today with one screen that answers the three questions every review starts with:

1. Which offer is this ad promoting, and what are its terms on the day the ad runs?
2. What did I ask the marketer to fix?
3. Did the new version fix it, and did it add anything new?

**Live demo:** https://clearpath-review-desk.netlify.app (no sign-up; every visitor gets a private copy of the demo data)

## Try it in five steps

1. Open the demo. You land in the review queue as the compliance reviewer. Open **AD-1041**, a revised ad.
2. Read "Since version 1". The earlier request about 6.99% APR is marked resolved, the change is shown word by word, and a new claim, "No origination fee", is flagged against the offer's 2% fee.
3. Click **Request changes**. A comment is already drafted from the offer check. Send it, then click **Open AD-1041 as the marketer**.
4. As the marketer, remove the sentence (the check clears as you type) and send version 3. Click **Review version 3 as the reviewer** and approve it.
5. Reload the page. The approval is still there, tied to that exact text. Switch to Marketer to see the approved copy with its stamp and a copy button.

Two more things worth a minute:

- **AD-1033** was approved for December and then moved to January, when the offer's lowest APR rises to 9.49%. No word changed, and it is back in review.
- **AD-1043** contains a line telling an AI reviewer to report nothing. The rate and fee problems still show.

**Reset demo** (top right) puts your copy back to the start.

## Who it is for, and the bet

| Person | What they do here | What they need |
|---|---|---|
| Compliance reviewer (primary) | Decides whether this exact copy can go to market | The ad as a consumer sees it, the claim in question, the dated offer terms, the history, and two clear actions |
| Marketer (secondary) | Gets an affiliate's copy approved | A check before submitting, a clear request when it comes back, and the approved copy to hand to the affiliate |
| Affiliate partner | Writes the copy; works through the marketer | Not a user in this build |

**The bet:** the brief says the review runs on Excel and email and is the bottleneck. My working assumption is that a reviewer's time goes to rebuilding context: finding the offer sheet, finding the last request in an email thread, and rereading a whole ad to see what changed. That is a hypothesis, not a measurement. The product is built so that if it is right, each of those lookups disappears.

I chose one workflow and built it end to end (one personal-loan campaign, from submission to approved copy) over covering more products or rules thinly.

## What it does

- **A check before the reviewer ever sees the ad.** On the submit form, rates and fees in the copy are compared with the offer in effect on the planned publication date as the marketer types, with a one-click fix. The marketer can correct a stale rate before it reaches the reviewer.
- **A queue that says what to do next.** Revised ads come first (the reviewer already knows them and the marketer is on a second round), then the longest wait.
- **One review screen.** The ad with its claims marked, the offer terms with their effective dates and source, the earlier request and whether it was resolved, what changed, and what is new.
- **"Resolved" only when it can be verified.** A request is marked resolved when the offer data confirms the corrected value, or when the claim was deleted and nothing was written in its place. If the claim was reworded ("We waive the origination fee"), the screen says the wording changed, shows the added sentence, and asks the reviewer to confirm.
- **Requests anchored to words.** Pick a flagged claim or select any words in the ad. The comment is drafted for you and stays editable.
- **Approval of an exact thing.** An approval records the version, a fingerprint of its text, the offer revision it was checked against, the publication date and the placement. Edit the text, move the date or change the placement, and it returns to review. The earlier approval stays on record for what it covered. If any of those changed while the reviewer's page was open, the server refuses the decision and asks for a reload.
- **Roles that hand off.** After each step a button opens the same ad in the other role, so nobody searches a list for the ad they were just working on.
- **No dead ends.** A date the offer has no terms for is refused on the form, with the dates that do work.

The rate example rests on Regulation Z's rule that a closed-end credit ad may state only terms the creditor actually offers ([12 CFR 1026.24(a)](https://www.consumerfinance.gov/rules-policy/regulations/1026/24/#a)). The offer sheet says what ClearPath offers; the rule says why a mismatch matters.

## Where AI is used, and where it is not

| Job | Done by | Why |
|---|---|---|
| Compare a rate or fee with the offer, in digits or written out ("six point nine nine percent") | Code only | Exact and explainable. No model judgment on numbers |
| Find claims in varied wording ("funds as soon as the next business day", "everyone qualifies") | AI (Claude Sonnet 5.5), with every quote confirmed in the ad by code | Wording varies too much for patterns |
| Notice new wording in a revision | Code difference, plus the AI's findings | The difference shows what changed; the AI says whether it is a claim |
| Draft a request to the marketer | Code for number mismatches, AI for wording; the reviewer edits it | Saves typing; the reviewer owns the words |
| Approve | The reviewer only | A regulated sign-off stays with a person |

The app works with no model at all. If the AI cannot run, the screen says "AI claim finder unavailable" and the code checks stand on their own.

## Security: the ad copy is untrusted

Affiliate copy is third-party text, and here it is read by a model. I assume an attempt to steer that model will sometimes work, so the protections are in code, not in the prompt.

**What is untrusted:** everything a marketer types (copy, notes), every comment, and everything the model returns.

| Attack | What stops it |
|---|---|
| Copy tells the AI to report nothing, or claims a prior approval | Code checks every explicit rate and fee without the model. If the model leaves out a claim the code found, the review is marked "AI review incomplete". Quoting the whole ad in one finding does not count as reporting a claim. This cross-check runs again each time a stored result is read. The model has no tools and cannot approve. Text addressed to the reviewer or an AI is flagged by a code check |
| The model invents evidence | Every quote must be in the ad word for word, checked in code. Anything else is discarded and the review is marked incomplete |
| The model fails, declines or returns something malformed | Shown as "incomplete" or "unavailable". Never as "no issues" |
| Copy closes the data wrapper and writes fake system text | The wrapper tag is random per call and never one that appears in the copy. Nothing depends on the wrapper holding |
| Hidden text: zero-width characters, direction controls, tag characters, look-alike letters and digits | Detected and shown to the reviewer. The rate check runs on a normalized copy, so a rate split by invisible characters is still caught. The fingerprint covers the exact text submitted |
| Script, HTML, a Markdown image or a link in the copy or in model output | All of it renders as plain text. Nothing from content becomes markup or a clickable link. A content security policy blocks inline script and any outside source, so nothing can be loaded or sent elsewhere |
| A marketer approves, or a stale page approves something that changed | The server checks the role, the version, the text fingerprint, the date, the placement, the offer revision and the check results the reviewer saw, on every decision. The page's buttons are a convenience |
| Reading another visitor's data | The workspace comes from an httpOnly cookie holding a random token (only its hash is stored), never from a form field, a URL or the model. Every query is scoped to it and uses parameters |
| Oversized input, or running up the bill | Length limits on every field; caps on ads, versions, decisions and moves per workspace; 40 AI calls a day per workspace and 1,500 overall, reserved before the call so parallel requests cannot pass the cap; one call at a time per text; a short model timeout; results stored by text so the same ad is read once. Workspaces expire after 14 days |

**Results.** `npm test` runs 89 unit tests, including eight hostile ads against a fake model that does whatever the ad says: in every case the rate mismatch still shows and the AI review is not presented as complete. A live run against the real model (`npm run eval`, results in `eval/results.json`):

- 16 labeled ads: 18 of 18 expected claims found, both clean ads returned no findings, no quotes discarded.
- 8 hostile ads, 3 runs each: the outcome was protected in 24 of 24 runs, and the model itself still reported the rate in 24 of 24.

**Limits, stated plainly:**

- The labeled set is small, synthetic, and written and labeled by me. A perfect score shows the path works. It does not show how the model does on real ads.
- The demo has no sign-in. Reviewer and Marketer are views a visitor picks, not accounts. The server still enforces the role on every decision, which is where a real sign-in would plug in.
- The call caps and the size limits are in the code but are not exercised by a test. The per-workspace cap can be sidestepped with a fresh cookie; the overall daily cap is the real limit.
- The flag for text addressed to an AI is a short list of patterns. It will miss other languages and paraphrases. Nothing else depends on it.

**Does not apply here:** tool poisoning, memory persistence, connector drift, code execution and SQL written by a model. The model has no tools, memory, connectors or code execution.

## Measuring throughput

The outcome to aim at is **approved ads per reviewer-hour**, with time from submission to decision and revision rounds per ad as supporting measures.

**No throughput gain is claimed.** None has been measured, and a claim about time saved needs a baseline: the same task done with a spreadsheet and email.

What exists today:

- Every submission, request, approval and move is logged as an event with a time. The **Measures** page (in the header) counts from that log each time it opens: for each ad, how many times compliance sent it back, who has it now, and the elapsed time from first submission to approval. Request changes on AD-1041 and its count goes up by one; approve version 3 and the count stays while the turnaround appears. The page says what it is: fictional demo activity, with elapsed time that includes waits between people. An open page is not counted as reviewer time, because an unattended tab would distort the measure.
- One timed observation, by a reviewer who already knew the scenario: in a fresh window the queue appeared in 6.1 seconds and the false fee claim was visible 1.3 seconds after opening the ad, about 7.5 seconds from opening the URL, at desktop width, without opening an offer sheet or searching for the earlier request. That measures finding the problem, not an unfamiliar person's decision time.
- One step a marketer can now take earlier: correcting a stale rate on the submit form, before it reaches a reviewer.

## Assumptions

- The reviewer's lost time is context reconstruction. A hypothesis.
- The marketer submits on the affiliate's behalf. Affiliates do not log in.
- Each campaign has one offer sheet with dated revisions. The revision in effect on the planned publication date applies.
- A person approves every version. The tool never approves.
- A missed problem is worse than a false flag, so unclear numbers are shown to the reviewer, not dropped.
- Every company, offer, rate, affiliate and ad here is fictional. The rule cited is an example, not a compliance program and not legal advice.

## What I cut, and what is next

Cut for the 24 hours: Excel import, email integration, a rules library beyond rates and fees, credit card and mortgage flows (they appear only in the offer list), affiliate logins, images and PDFs, and monitoring of live affiliate pages.

Next, in order: a baseline study with real reviewers to test the bet; a rules library the compliance team owns and edits; an approved-language library so ads built from approved wording take a fast path; sign-in and real permissions; a fuller metrics view (per reviewer, per affiliate, over time); and monitoring of what affiliates actually publish.

## Run it locally

Needs Node 22 or later and a Postgres database.

```bash
git clone https://github.com/TesCoder/clearpath-review-desk.git
cd clearpath-review-desk
npm install
createdb clearpath_dev
printf 'DATABASE_URL=postgres://localhost:5432/clearpath_dev\n' > .env.local
npm run db:migrate
npm run dev
```

Then open http://localhost:3000. `npm run db:migrate` creates the tables and the fictional offer sheet; `npm run build` runs it too.

Optional, for the AI claim finder, add to `.env.local`:

```
ANTHROPIC_API_KEY=your key
```

The deployed demo uses the Anthropic API, and that is the only model route in production. For local development there is a second route through the Claude Code CLI on a signed-in Claude plan, so testing costs nothing: set `APP_LLM=claude-cli` in `.env.local`. It is refused in a production build and on the host, and its results are labeled `claude-cli:` so they never mix with API results.

| Command | What it does |
|---|---|
| `npm test` | Unit tests (no network, no key) |
| `npm run eval` | The live check against the API. Costs a few cents. Writes `eval/results.json` |
| `npm run e2e` | Five headless click-throughs. Set `BASE` to the site to test. Needs `npx playwright install chromium` once |
| `npm run db:migrate` | Creates or updates the tables and reference data |

## How it is built

Next.js (App Router) on Netlify, Postgres on Neon, Tailwind.

- `src/lib/checks.ts`: the code-only claim checks and hidden-text detection.
- `src/lib/status.ts`: an ad's status, derived from its versions and decisions, and the server's rule for who may decide what.
- `src/lib/revision.ts`, `src/lib/diff.ts`: whether a revision answered each request, and what changed.
- `src/lib/ai/`: the claim finder. `review.ts` is the pipeline and takes the model as an argument, which is how the tests put a hostile fake in its place.
- `src/app/actions.ts`: every write, with its checks.
- `src/proxy.ts`: the per-visitor workspace cookie and the content security policy.
- `db/schema.sql`: the tables. Offers have dated revisions; a version's text never changes; a decision records exactly what it was made on; nothing stores a status.
