# tiwall-autobuy

Semi-automated assistant for buying tiwall.com theater tickets the instant a sale opens.

## What it does

At a configured date/time, opens a visible Chromium window, selects your chosen
session, selects your preferred seats (falling back to the cheapest available if
any are taken), places a reservation, and fills in your name/phone/email. It then
clicks "پرداخت", and on the bank's own payment-method page picks "پرداخت با کارت
شتابی" (or the quicker wallet option, if you're already logged into it there) --
then stops completely. **You always type your card number, expiry, and CVV
yourself.** The tool never stores or touches payment credentials or your tiwall
account password.

## Setup

```bash
npm install
npx playwright install chromium
```

`settings.json` already exists in the project with placeholder values — edit it
directly (it's gitignored, so your real name/phone/email never get committed):
- `testMode`: `false` (default) runs at full speed. `true` pauses **2 seconds
  after every step** (session click, seat selection, reserve, form fill,
  submit, payment method) so you can watch each one happen in the browser
  window. Use `true` while getting familiar with the tool or diagnosing a
  problem; set back to `false` for the real timed run.
- `buyer`: your name, phone, and optional email.
- `profiles.<name>`: one entry per show/session you want to target.
  - `showUrl`: the tiwall show page, e.g. `https://www.tiwall.com/s/uncle.vanya`.
  - `sessionMatch`: a substring that uniquely identifies the session row you want
    (e.g. `چهارشنبه ۰۷ مرداد`) — copy it from the show page's session list.
  - `targetDatetime`: ISO 8601 datetime with timezone offset, e.g.
    `2026-08-04T12:00:00+03:30`. Set to `null` to run immediately (useful for
    testing against an already-open show).
  - `ticketCount`: how many seats to reserve (capped automatically at whatever
    the show page itself states as its per-purchase maximum).
  - `preferredSeats`: ordered list of `{ "row": N, "seat": N }` to try first.
    Leave as `[]` to just grab the cheapest available seats.

## Optional: staying logged in

The tool reuses a persistent browser profile at `browser-profile/`. If you want
to be logged into your tiwall account (for loyalty perks etc.), open that same
profile once yourself and log in manually — the tool will reuse the resulting
session. It never stores or enters your password.

## Running

```bash
node run.js murakami-test   # dry run against an already-open show
node run.js vanya-real      # the real target run, waits until targetDatetime
```

A log file is written per run under `logs/`. When the tool reaches the bank
payment page, it prints a banner and beeps — that's your cue to take over and
pay manually within the 15-minute reservation window.

The browser window is left open after the script finishes (success or
failure) so you can act on whatever state it reached — close it yourself, or
Ctrl+C the terminal, when you're done. If a run reserves a seat and you decide
not to pay, use tiwall's own "لغو رزرو" (cancel reservation) button in that
window to release it immediately instead of waiting out the 15-minute hold.

## Testing

```bash
npm test
```

Runs the unit tests for the pure logic (seat-selection fallback, config
validation, countdown timing, logger, alert) — 24 tests, all passing.

The browser-driving flow in `lib/seatFlow.js` isn't unit tested — it's
verified by actually running `node run.js murakami-test` against the live
site. This is how several real bugs were caught and fixed during development:
seat/price data hydrates into the seat map slightly after the chair elements
themselves attach (reading too early makes every seat look free with no
price); seats another shopper currently has on hold carry a `pending` class
that must be excluded alongside `reserved` and `locked-chair`; the session
list itself renders client-side slightly after the page's DOM shell exists,
so a dedicated readiness wait was needed rather than a fixed delay; and
`page.goto()`'s default wait condition ("load" -- every image/font/analytics
script) made the first step look slow (~22s) even though the actual click
logic was fast, fixed by waiting only for `"domcontentloaded"` plus an
explicit wait for the session list's own heading text. If tiwall changes its
markup in the future, re-run the same dry run and use the troubleshooting
notes in `docs/superpowers/plans/2026-07-18-tiwall-ticket-autobuy.md`
(Task 9) to diagnose.

## Known limitations

- If tiwall adds a CAPTCHA or other bot-detection challenge, the tool does not
  attempt to solve it — you'll need to do that manually in the open browser
  window.
- `sessionMatch` and seat rows/numbers are read off the page as of 2026-07-18;
  if the show's session list or seat map layout changes, update `settings.json`
  or re-verify `lib/seatFlow.js`'s selectors accordingly.
