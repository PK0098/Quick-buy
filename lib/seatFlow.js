const { chooseSeats } = require('./seatSelection');

async function getShowMaxTickets(page) {
  const text = await page.locator('body').innerText();
  const match = text.match(/سقف خرید در هر نوبت (\d+) بلیت است/);
  return match ? parseInt(match[1], 10) : null;
}

async function clickSession(page, sessionMatch) {
  const links = page.locator('a[href="javascript:;"]');
  const count = await links.count();
  for (let i = 0; i < count; i++) {
    const el = links.nth(i);
    const text = (await el.innerText()).trim();
    if (text.includes(sessionMatch) && !text.includes('پُر شد')) {
      await el.click();
      return true;
    }
  }
  return false;
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
        if (chair.classList.contains('reserved') || chair.classList.contains('locked-chair')) {
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
          const isFree = !chair.classList.contains('reserved') && !chair.classList.contains('locked-chair');
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

async function reservationSucceeded(page) {
  const text = await page.locator('body').innerText();
  return text.includes('رزرو موقت شما انجام شده');
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

module.exports = {
  getShowMaxTickets,
  clickSession,
  readFreeSeats,
  clickSeat,
  selectSeats,
  clickReserveAndContinue,
  reservationSucceeded,
  fillBuyerForm,
  clickPayAndHandoff,
};
