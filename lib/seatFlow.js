const { chooseSeats } = require('./seatSelection');

async function getShowMaxTickets(page) {
  const text = await page.locator('body').innerText();
  const match = text.match(/سقف خرید در هر نوبت (\d+) بلیت است/);
  return match ? parseInt(match[1], 10) : null;
}

// "domcontentloaded" fires once the HTML shell exists, but the session list
// itself is rendered client-side afterward (an AJAX/framework hydration step) --
// waiting for this heading text is what actually tells us clickSession has
// something real to search through, instead of guessing a fixed delay.
async function waitForSessionList(page, timeoutMs = 8000) {
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('سانس مورد نظر'),
      null,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

// A not-yet-on-sale session ("خرید از دوشنبه ساعت ۱۲:۰۰") is the same
// `<a href="javascript:;">` as an open one, just with an extra `disabled`
// class baked in when the page was rendered -- there's no evidence of a
// client-side timer that removes it on its own once the real time arrives,
// so telling "not found yet" apart from "found but still disabled" matters:
// only the latter means a fresh reload (not just another click) is what's
// actually needed to make progress.
async function getSessionState(page, sessionMatch) {
  return page.evaluate(
    ({ sessionMatch }) => {
      const links = Array.from(document.querySelectorAll('a[href="javascript:;"]'));
      const link = links.find((l) => (l.textContent || '').includes(sessionMatch));
      if (!link) return { found: false, disabled: false, soldOut: false };
      const text = (link.textContent || '').trim();
      return {
        found: true,
        disabled: link.classList.contains('disabled'),
        soldOut: text.includes('پُر شد'),
      };
    },
    { sessionMatch }
  );
}

async function clickSession(page, sessionMatch) {
  // Scanning + clicking inside one page.evaluate() avoids one CDP round-trip per
  // candidate link (a show's session list can have 40-50+ "javascript:;" links) --
  // checking each with a separate Playwright call is what made this step slow
  // compared to the single-evaluate seat/reserve steps below.
  return page.evaluate(
    ({ sessionMatch }) => {
      const links = Array.from(document.querySelectorAll('a[href="javascript:;"]'));
      for (const link of links) {
        const text = (link.textContent || '').trim();
        const clickable = !link.classList.contains('disabled') && !text.includes('پُر شد');
        if (text.includes(sessionMatch) && clickable) {
          link.click();
          return true;
        }
      }
      return false;
    },
    { sessionMatch }
  );
}

async function readFreeSeats(page) {
  return page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll('.zb-seatmap .row'));
    const seats = [];
    for (const rowEl of rows) {
      const rowHead = rowEl.querySelector('.row-head');
      const rowNumber = rowHead ? parseInt(rowHead.textContent.trim(), 10) : null;
      if (rowNumber === null || Number.isNaN(rowNumber)) continue;
      const chairs = Array.from(rowEl.querySelectorAll('.chair'));
      for (const chair of chairs) {
        if (
          chair.classList.contains('reserved') ||
          chair.classList.contains('locked-chair') ||
          chair.classList.contains('pending')
        ) {
          continue;
        }
        const seatNumber = parseInt(chair.textContent.trim(), 10);
        if (Number.isNaN(seatNumber)) continue;
        const title = chair.getAttribute('title') || '';
        const priceMatch = title.match(/([0-9۰-۹,]+)\s*تومان/);
        let price = null;
        if (priceMatch) {
          const asciiDigits = priceMatch[1].replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d));
          price = parseInt(asciiDigits.replace(/,/g, ''), 10);
        }
        seats.push({ row: rowNumber, seat: seatNumber, price });
      }
    }
    return seats;
  });
}

async function clickSeat(page, row, seat) {
  return page.evaluate(
    ({ row, seat }) => {
      const rows = Array.from(document.querySelectorAll('.zb-seatmap .row'));
      for (const rowEl of rows) {
        const rowHead = rowEl.querySelector('.row-head');
        const rowNumber = rowHead ? parseInt(rowHead.textContent.trim(), 10) : null;
        if (rowNumber !== row) continue;
        const chairs = Array.from(rowEl.querySelectorAll('.chair'));
        for (const chair of chairs) {
          const seatNumber = parseInt(chair.textContent.trim(), 10);
          const isFree =
            !chair.classList.contains('reserved') &&
            !chair.classList.contains('locked-chair') &&
            !chair.classList.contains('pending');
          if (seatNumber === seat && isFree) {
            chair.click();
            return true;
          }
        }
      }
      return false;
    },
    { row, seat }
  );
}

async function selectSeats(page, preferredSeats, ticketCount) {
  const freeSeats = await readFreeSeats(page);
  const chosen = chooseSeats(freeSeats, preferredSeats, ticketCount);
  for (const seat of chosen) {
    await clickSeat(page, seat.row, seat.seat);
  }
  return chosen;
}

async function clickReserveAndContinue(page) {
  const button = page.getByRole('button', { name: 'رزرو و ادامه' });
  if ((await button.count()) === 0) return false;
  await button.click();
  return true;
}

async function waitForSeatMap(page, timeoutMs = 5000) {
  try {
    await page.locator('.zb-seatmap .chair').first().waitFor({ state: 'attached', timeout: timeoutMs });
    // Chair elements attach before their reservation-status/price data is hydrated in by a
    // follow-up call. Until that happens every chair's title is just "صندلی N از ردیف M" with
    // no price ("... تومان") or purchased marker ("... شده"), and every chair looks free even
    // when most are actually taken. Wait for that hydration before trusting any chair's status.
    await page.waitForFunction(
      () => {
        const chairs = document.querySelectorAll('.zb-seatmap .chair');
        return Array.from(chairs).some((c) => {
          const title = c.getAttribute('title') || '';
          return title.includes('تومان') || title.includes('شده');
        });
      },
      null,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function reservationSucceeded(page, timeoutMs = 4000) {
  try {
    await page.waitForFunction(
      () => document.body.innerText.includes('رزرو موقت شما انجام شده'),
      null,
      { timeout: timeoutMs }
    );
    return true;
  } catch {
    return false;
  }
}

async function fillBuyerForm(page, buyer) {
  const nameInput = page.locator('text=نام و نام خانوادگی').locator('xpath=following::input[1]');
  const phoneInput = page.locator('text=تلفن همراه').locator('xpath=following::input[1]');
  await nameInput.fill(buyer.name);
  await phoneInput.fill(buyer.phone);
  if (buyer.email) {
    const emailInput = page.locator('input[placeholder="اختیاری"]');
    if ((await emailInput.count()) > 0) {
      await emailInput.fill(buyer.email);
    }
  }
}

async function clickPayAndHandoff(page) {
  const payButton = page.getByRole('button', { name: 'پرداخت' });
  await payButton.click();
}

// After tiwall's own "پرداخت" click, the bank's payment aggregator page offers a
// choice of payment method: pay by card ("پرداخت با کارت شتابی"), or -- only when
// already logged into the gateway's own wallet -- a quicker wallet payment
// ("پرداخت سریع از کیف پول ..."). Neither option enters any card/account details
// itself; it only picks which method's form to open next. This still stops short
// of typing anything into a payment field -- that boundary is unchanged.
async function clickBankPaymentMethod(page, timeoutMs = 8000) {
  try {
    await page.waitForFunction(
      () => {
        const text = document.body.innerText;
        return text.includes('کارت شتابی') || text.includes('کیف پول');
      },
      null,
      { timeout: timeoutMs }
    );
  } catch {
    return { clicked: false, reason: 'Bank payment-method page did not load in time.' };
  }

  return page.evaluate(() => {
    function isDisabled(el) {
      if (!el) return true;
      if (el.disabled) return true;
      if (el.getAttribute('aria-disabled') === 'true') return true;
      if (el.classList.contains('disabled') || el.classList.contains('inactive')) return true;
      const style = window.getComputedStyle(el);
      if (style.pointerEvents === 'none') return true;
      if (parseFloat(style.opacity) < 0.6) return true;
      return false;
    }

    function findClickableContaining(text) {
      const candidates = Array.from(
        document.querySelectorAll('button, a, label, [role="button"], div, li, input')
      );
      // Prefer the deepest element containing the text (the actual control),
      // not a large wrapper that happens to contain it too.
      return candidates.find((el) => {
        if (!el.textContent || !el.textContent.includes(text)) return false;
        const childAlsoMatches = Array.from(el.children).some(
          (child) => child.textContent && child.textContent.includes(text)
        );
        return !childAlsoMatches;
      });
    }

    const walletEl = findClickableContaining('کیف پول');
    const cardEl = findClickableContaining('کارت شتابی');

    if (walletEl && !isDisabled(walletEl)) {
      walletEl.click();
      return { clicked: true, option: 'wallet' };
    }
    if (cardEl) {
      cardEl.click();
      return { clicked: true, option: 'card' };
    }
    return { clicked: false, reason: 'Neither payment-method control was found on the page.' };
  });
}

module.exports = {
  getShowMaxTickets,
  waitForSessionList,
  getSessionState,
  clickSession,
  waitForSeatMap,
  readFreeSeats,
  clickSeat,
  selectSeats,
  clickReserveAndContinue,
  reservationSucceeded,
  fillBuyerForm,
  clickPayAndHandoff,
  clickBankPaymentMethod,
};
