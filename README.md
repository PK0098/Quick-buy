# tiwall-autobuy

Semi-automated assistant for buying tiwall.com theater tickets the instant a sale opens.

New here? Open `manual.html` in any browser for a full illustrated walkthrough
before reading the reference notes below.

## What it does

At a configured date/time, opens a visible Chromium window, selects your chosen
session, selects your preferred seats (falling back to the cheapest available if
any are taken), places a reservation, and fills in your name/phone/email. It then
clicks "پرداخت", and on the bank's own payment-method page picks "پرداخت با کارت
شتابی" (or the quicker wallet option, if you're already logged into it there) --
then stops completely. **You always type your card number, expiry, and CVV
yourself.** The tool never stores or touches payment credentials or your tiwall
account password.

### How the countdown actually works

When you launch a profile with a future `targetDatetime`, the tool opens the
browser immediately and pre-loads the show page right away (to warm up the
connection), then just waits -- it doesn't sit there watching that same loaded
page for the sale to open. At the target moment it does a **fresh reload**,
because tiwall's "not yet on sale" sessions (`خرید از دوشنبه ساعت ۱۲:۰۰`) are
rendered with a `disabled` class baked into the page at load time, with no
visible client-side timer that removes it on its own -- so only a reload can
reveal that a session just went on sale. If that first reload happens to land
a moment before the real cutover, the tool keeps noticing the session is still
marked `disabled` and **reloads again** every retry (not just re-clicking the
same stale page) until either it opens or the retry window runs out.

## Setup

```bash
npm install
npx playwright install chromium
cp settings.example.json settings.json
```

Edit your new `settings.json` (it's gitignored if you put this under git, so
your real name/phone/email won't accidentally get committed):
- `testMode`: `false` (default) runs at full speed. `true` pauses **after every
  step** (session click, seat selection, reserve, form fill, submit, payment
  method) so you can watch each one happen in the browser window. Use `true`
  while getting familiar with the tool or diagnosing a problem; set back to
  `false` for the real timed run.
- `testModeDelayMs`: how long that pause is, in milliseconds. Defaults to
  `2000` (2 seconds) if omitted; only used when `testMode` is `true`.
- `buyer`: your name, phone, and optional email.
- `profiles.<name>`: one entry per show/session you want to target.
  - `showUrl`: the tiwall show page, e.g. `https://www.tiwall.com/s/uncle.vanya`.
  - `sessionMatch`: a substring that identifies the session row you want
    (e.g. `چهارشنبه ۰۷ مرداد`) — copy it from the show page's session list.
  - `sessionTime` (optional): the session's start time, e.g. `۱۹:۰۰`. When a
    single date has more than one show (a 19:00 and a 21:00), the date alone is
    ambiguous — add this and the tool requires it to also be present in the row,
    pinning the exact slot. Omit it if the date is already unique.
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
explicit wait for the session list's own heading text; and a not-yet-open
session is marked with a `disabled` class rather than just being absent from
the page, which the retry loop now checks for specifically so it reloads the
page (instead of uselessly re-clicking the same stale DOM) when that's what's
actually blocking it. If tiwall changes its markup in the future, re-run the
same dry run against an already-open show and inspect the DOM in the open
browser window (dev tools) to see what changed, then update the relevant
selector in `lib/seatFlow.js`.

## Known limitations

- If tiwall adds a CAPTCHA or other bot-detection challenge, the tool does not
  attempt to solve it — you'll need to do that manually in the open browser
  window.
- `sessionMatch` and seat rows/numbers are read off the page as of 2026-07-18;
  if the show's session list or seat map layout changes, update `settings.json`
  or re-verify `lib/seatFlow.js`'s selectors accordingly.
