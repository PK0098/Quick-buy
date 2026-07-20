const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chooseSeats } = require('./seatSelection');

test('returns preferred seats in order when all are free', () => {
  const free = [
    { row: 8, seat: 21, price: 500000 },
    { row: 8, seat: 20, price: 500000 },
    { row: 8, seat: 19, price: 500000 },
  ];
  const preferred = [{ row: 8, seat: 21 }, { row: 8, seat: 20 }];
  const result = chooseSeats(free, preferred, 2);
  assert.deepEqual(result, [
    { row: 8, seat: 21, price: 500000 },
    { row: 8, seat: 20, price: 500000 },
  ]);
});

test('falls back to cheapest remaining free seat when a preferred seat is taken', () => {
  const free = [
    { row: 8, seat: 19, price: 500000 },
    { row: 1, seat: 1, price: 900000 },
  ];
  const preferred = [{ row: 8, seat: 21 }, { row: 8, seat: 19 }];
  const result = chooseSeats(free, preferred, 2);
  assert.deepEqual(result, [
    { row: 8, seat: 19, price: 500000 },
    { row: 1, seat: 1, price: 900000 },
  ]);
});

test('with no preferred seats, picks cheapest-first up to ticketCount', () => {
  const free = [
    { row: 1, seat: 1, price: 900000 },
    { row: 8, seat: 19, price: 500000 },
    { row: 6, seat: 3, price: 700000 },
  ];
  const result = chooseSeats(free, [], 2);
  assert.deepEqual(result, [
    { row: 8, seat: 19, price: 500000 },
    { row: 6, seat: 3, price: 700000 },
  ]);
});

test('returns fewer than ticketCount when not enough free seats exist', () => {
  const free = [{ row: 8, seat: 19, price: 500000 }];
  const result = chooseSeats(free, [], 5);
  assert.equal(result.length, 1);
});

test('never returns the same seat twice', () => {
  const free = [{ row: 8, seat: 19, price: 500000 }];
  const preferred = [{ row: 8, seat: 19 }];
  const result = chooseSeats(free, preferred, 3);
  assert.equal(result.length, 1);
});

test('seats with unknown price sort after seats with known price in fallback', () => {
  const free = [
    { row: 2, seat: 2, price: null },
    { row: 8, seat: 19, price: 500000 },
  ];
  const result = chooseSeats(free, [], 2);
  assert.deepEqual(result, [
    { row: 8, seat: 19, price: 500000 },
    { row: 2, seat: 2, price: null },
  ]);
});
