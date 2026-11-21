# ClearPath ad review desk: design notes

**Live demo:** https://clearpath-review-desk.netlify.app (no sign-up; every visitor gets a private copy of the demo data)
**Code:** https://github.com/TesCoder/clearpath-review-desk

These notes go with the take-home. The README in the repo has the full detail. This is the short version: what I built, the decisions behind it, what it cost, and what I chose not to fix.

## 1. The problem, and who I built for

The brief says ClearPath's compliance marketing team reviews ads in Excel and email, and that this is slowing growth. I built for the person every other role waits on: the compliance reviewer who decides whether an ad can go live. The second user is the marketer who gets an affiliate's copy approved. The affiliate stays outside the app.

My working assumption is that a reviewer's time goes to rebuilding context: which offer applies on the day the ad runs, what was asked last round, and whether the new version fixed it. That is a hypothesis, not a measurement. The desk is built so that, if it is right, each of those lookups disappears.

I chose one workflow and built it end to end (affiliate personal-loan ads, from submission to approved copy) over covering more products thinly.

## 2. What it does

- **A queue that says what to do next.** Ads waiting for a decision come first. The code's offer check and the AI's read are separate columns, so one is never mistaken for the other.
- **A check before the reviewer sees the ad.** As the marketer types, rates and the origination fee are compared with the offer in effect on the planned publication date. The check follows the date: the same sentence can pass for December and be flagged for January, when the offer's lowest rate rises.
- **A revision view.** For each request made on the previous version, the reviewer sees what the comparison of the two versions found, the change word by word, and anything newly added. It saves rereading to find what changed. It does not decide whether the request was answered: the reviewer does.
- **An approval of an exact thing.** An approval covers one version's exact words, for one publication date, one placement and one revision of the offer. Change any of them and the ad goes back to review.
- **An offer sheet that sends approvals back.** When the terms change, the approved ads the change covers return to the queue by themselves, each with the old and new terms side by side. Before saving, the form names the ads it would send back.
- **An optional AI wording check.** The AI reads for wording a number check cannot catch, such as "Guaranteed approval". The marketer can run it before submitting. When the check was answered and recorded, the reviewer is told it ran and sees the same findings.

The README's "Try it in six steps" walks through most of this in about five minutes, starting from ad AD-1041. The wording check is one of the three extra examples under those steps.

## 3. The rule: code for numbers, AI for wording, a person for the decision

A model can be talked out of a finding. Code cannot. So the checks that must hold do not depend on the model.

- **Code** compares the rates and fees it can read with the offer sheet, and decides whether an approval still counts.
- **The AI** (Claude Sonnet 5.5) points at wording a reviewer should read. It has no tools. It cannot approve, block or change a status.
- **The reviewer** decides.

Ad copy is untrusted text, and a model reads it. I assumed steering will sometimes work and put the protections in code:

- Every quote the AI gives must be in the ad word for word, or it is discarded.
- If the AI leaves out a rate or fee that the code could read, or answers nothing on copy the code sees is addressed to it, the read is marked "incomplete", never "clean". A call that fails outright shows "unavailable".
- Hidden characters are recognized by what Unicode says they are and flagged to the reviewer, as are unusual digits and look-alike letters mixed into mostly Latin text. The rate check runs on a cleaned-up copy, so a rate split by invisible characters is still read.
- A demo ad (AD-1043) carries a plain-text instruction telling an AI reviewer to report nothing. The rate and fee problems still show, and the instruction itself is flagged.

The README lists six named attacks, each with a test.

## 4. Decisions that cost something

| Decision | What it buys | What it costs |
|---|---|---|
| A figure is shown as a match only when the ad's own words state it ("from 8.99% APR", "up to 35.99% APR", "8.99% to 35.99% APR", or a plain fee sentence) and nothing follows it in its sentence. Other wording is held for the reviewer. | The right number in a sentence that says something else is held. "Our APR never exceeds 8.99%" names the offer's lowest rate and says the opposite of the offer; "Rates from 8.99% APR for the first six months" puts a condition on it, and so does "If you have an 800 credit score, rates start at 8.99% APR". | Amber flags on true statements, such as "8.99% APR." alone or "Rates from 8.99% APR today". And it is still a check of one sentence at a time: see the limits below. |
| Code reads a short list of exact forms and holds the rest for a person. | The check stopped growing. Each time I taught it more wording, a review found a new false match. After the second time I reversed the rule, and almost every later change made it say less (one put back a red flag that the round before it had lost). The last changes are about the shape of a sentence and where a line ends, not its words. | It understands less than it could. Loose wording goes to the AI and the reviewer. |
| Status is never stored. It is worked out from what the approval was made on. | When the offer changes, the approvals it covered stop counting by themselves. There is no stale status to clean up. | Every page works it out again from the records. |
| The AI only advises. | Hostile copy cannot approve an ad or hide a number. | A missed wording claim cannot be detected. The reviewer still reads the ad. |
| The screen never says "Resolved". It reports what it compared. | No green verdict on a half-fixed ad. | The reviewer confirms more by eye. |
| A form opened before another change is refused. | An old tab cannot undo a move, a new version or an offer change. A marketer's edit is tied to the offer terms, date and placement it was written against. An offer change cannot send back an ad its preview did not list. | Now and then someone is asked to reload. |
| Free text, not fields for the rate and fee. | The reviewer approves the exact words consumers will read. | Numbers have to be read out of prose, which is why the rule above is so strict. |
| No sign-in. Reviewer and Marketer are views. | Anyone can try the demo in one click. The server still checks the view on every edit and decision. | It is not authorization. |

## 5. Where it runs, and how fast

| Part | Where |
|---|---|
| The server functions (every page and action) | Netlify, AWS us-east-2 (Ohio), Netlify's default region, as the site's settings show. Static files come from Netlify's edge network |
| The database | Neon Postgres, Oregon (us-west-2), the region I chose for the project |
| The AI | Anthropic API, called from a server function in its own request |

The functions and the database are in different regions, so every query crosses the country. I found out late, by timing a new visitor's first page on the live site: 5 to 8 seconds.

- **The cause was round trips, not work.** A first visit creates the visitor's demo and seeds it. The database client is set to run without prepared statements (my setting, the cautious one behind a connection pooler). By my reading of the client's code, each query with parameters then costs two round trips and queries are not sent together, so about forty single-row inserts were about eighty trips between Ohio and Oregon. That count is an estimate from the code and the timings, not a trace.
- **The fix.** The seed now makes its own ids and writes one insert per table, five in all. Measured on the live site on the morning of Nov 21, with curl from one home connection, as the time to the complete page: 1.5 to 1.8 seconds for a new visitor when the server was warm, about 3 on a cold start, and about 0.7 for a return visit. The first page after several idle minutes can take longer: an independent check saw 6.5 seconds once.
- **What is still slow.** A click that changes something takes about a second (0.7 to 1.4 seconds in a browser for the view switch). The Reviewer and Marketer switch now shows the chosen view at once, so the click never looks ignored.
- **Not fixed, on purpose.** Putting both in one region is the real fix. Netlify offers a choice of region only on a paid plan, and moving the database means a new Neon project. It is the first thing I would change in production.
- **The AI is the slowest part, so nothing waits on it.** A call took between 3 and 13 seconds on the evening I measured it. The app allows 9 seconds, its own budget and not a limit of the host, and does not retry. A slow call shows "AI claim finder unavailable" with a Try again button, and the code checks and the decision work as before. Results are stored by exact text, so the seeded ads open with no model call.

## 6. Known limits, left as they are

- **"No detected offer mismatch" is not "compliant".** The desk compares rates and the origination fee with the offer sheet. It does not check required disclosures.
- **A match is a statement about one sentence, and the check can still be wrong about it.** It reads one sentence at a time and knows a few forms. Of the words before a figure it reads only a few negating words ("no", "not", "never", "without", "cannot", "waive", a word ending in "n't") and a comma. So these still show a figure as a match: a condition in the next sentence ("A 2% origination fee applies. Only on your second loan."), a denial with no "not" in it ("Nobody pays rates from 8.99% APR"), a qualifier before the figure ("Rates after the introductory period are from 8.99% APR"), and the right figure about the wrong thing ("Our credit cards start at 8.99% APR"). These are examples, not a complete list. After ten rounds I stopped trying to close this with rules, because each one closed the reported sentence and left the one beside it, and one of them broke something that worked until the next put it right. An eleventh and a twelfth round, after the fourth and fifth reviews, added no rule: they kept six lookups inside the claim's own line or paragraph, where they had read past it. One of the six had taken a wrong rate, and its red flag, out of the results when an unrelated number started the next line. A thirteenth round took half of one rule away for the same fault on one line ("Rates from 6.99% APR 36 months"): a number after a rate no longer takes the rate out of the results. A number straight before a wrong rate ("Rates from 1 6.99% APR") still does: the two are held in amber as one unread expression, not flagged red. The README says why I left that. A fourteenth, after a sixth review, only adds holds: a line that says "No fees" with a footnote digit typed against it had shown no flag at all, and is now held in amber. A fifteenth closed what the same review found in ordinary wording: a footnote mark typed against "APR" or "fee" no longer hides the claim, a rate straight after a fee word is read as a rate, and a rate written in words can no longer run across a paragraph break. Green means "this figure, in this sentence, is on the offer sheet". It never means the ad is true. Those sentences are what the AI read and the reviewer are for.
- **An ad pasted as separate lines, with no full stops, is mostly held in amber, line by line.** A line break ends a statement only after a full stop, "!" or "?", or before a blank line; otherwise "No fees" on one line and "for late payments" on the next would read as a plain claim. The cost is that a true list ("Rates from 8.99% APR" on one line, "2% origination fee" on the next) is held for the reviewer, not green. The last line of a list is the exception: nothing follows it, so a plain rate there is a match.
- **Red false alarms are kept on the safe side.** "No fees for late payments" is flagged red against the origination fee: code cannot tell which fee a "no fees" sentence means. A percentage on a line that also says "rate" or "APR" is read as an APR unless a fee word is nearer to it, so "Low rates and a 100% online application" is flagged red too. The reviewer approves past them.
- **Some wrong claims are held in amber, not flagged red.** On a line that says "interest", a rate is read as an APR only when "APR" comes straight after it or after the range it begins: "Low interest rates from 6.99% to 35.99% APR" is flagged, but "Interest rate: 7.00% | APR: 6.99%" holds both figures. A wrong rate with a bare number straight before it is held with that number. In each case the words are quoted to the reviewer and are never a match.
- **A public demo with no sign-in can be abused.** There is no limit on new demo workspaces, and about 38 fresh visitors can use up the day's 1,500 AI calls. A limit on new workspaces would let a script lock real visitors out. The real fix is sign-in.
- **Stored AI results are shared between visitors by exact text and kept with no time limit.** A second visitor sees a stored result only for words they typed themselves.
- **One product.** Credit cards and mortgages are listed and refused. The README says what adding them would take.
- **The desk pins down the approved text at handoff. It cannot see what an affiliate publishes.**
- **One database in one region, with no replica, no export and no alerting.**

## 7. How it was checked

- **312 unit tests,** 15 of them against a real Postgres. They include hostile ads against a fake model that does whatever the ad says: where the ad has a rate its mismatch still shows, and in every case the AI read is not presented as complete.
- **Eight browser scripts with 178 checks,** run against a local server and against the live site. Among them: an old tab trying to approve a moved ad, two approvals sent at once, an offer change that a second visitor's browser does not see, and a wording check on a draft with an injected instruction.
- **An evaluation against the real model, rerun on the final code at 9:26 a.m. Pacific on Nov 21:** 18 of 18 labeled claims found; the outcome protected in 24 of 24 runs on hostile ads that contain a rate; the claim reported in 9 of 9 runs on hostile ads with wording claims only; no call left unanswered.
- **A before-and-after run for every change to a rule that reads ad text.** The old and the new rule run on the same texts (645 in the last round), and every difference is read: each new match, each new or lost red flag, each new one-click edit. Rounds 3 to 10 passed only with nothing newly called a match. From round 11 on, some true ads became a match as the rule stopped reading across paragraphs and began reading a few more ordinary forms, and each was checked by hand. Round 13 accepted two red flags on harmless percentages, of a kind already listed as a false alarm. That run speaks only for those texts. It did not catch a true ad that one round turned red (a fee on its own line, put right in the next round), and it does not show the rule is complete: the reviews found sentences it had not seen.
- **Several rounds of independent review** of the code, the README and the live site. I fixed what they found, or wrote down why I left it.

## 8. Throughput: what I can and cannot claim

No throughput gain is claimed. None has been measured, and a claim about time saved needs a baseline: the same ads reviewed with a spreadsheet and email.

- **The measure to aim at:** approved ads per reviewer-hour, with time to decision and revision rounds per ad beside it.
- **The test I would run:** the same set of ads reviewed the current way and with this desk, timing active review and counting missed problems and unnecessary flags. Speed only counts if the misses do not go up.
- **What exists today:** every submission, request, approval and move is logged with a time, and the Measures page counts revision rounds and turnaround from that log. The time a reviewer actively spends is the missing piece.

## 9. What I would build next

1. A baseline study with real reviewers, to test the bet.
2. One region for the functions and the database, then error tracking and an uptime alert.
3. Sign-in and real permissions.
4. Approved terms inserted from the offer sheet, so a wrong rate cannot be typed in the first place.
5. A rules library the compliance team owns, and an approved-language library so ads built from approved wording take a fast path.
6. Monitoring of what affiliates actually publish, against the approved version.
