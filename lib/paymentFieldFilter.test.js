const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPaymentLikeField } = require('./paymentFieldFilter');

function fakeInput({ type = 'text', name = '', id = '', autocomplete = '' } = {}) {
  const attrs = { name, id, autocomplete };
  return {
    type,
    getAttribute: (attr) => attrs[attr] || '',
  };
}

test('detects password-type inputs', () => {
  assert.equal(isPaymentLikeField(fakeInput({ type: 'password' })), true);
});

test('detects card-number-like autocomplete attribute', () => {
  assert.equal(isPaymentLikeField(fakeInput({ autocomplete: 'cc-number' })), true);
});

test('detects cvv-like name attribute', () => {
  assert.equal(isPaymentLikeField(fakeInput({ name: 'cvv_code' })), true);
});

test('detects expiry-like id attribute', () => {
  assert.equal(isPaymentLikeField(fakeInput({ id: 'card-expiry-date' })), true);
});

test('does not flag an ordinary name field', () => {
  assert.equal(isPaymentLikeField(fakeInput({ name: 'fullName', id: 'name-input' })), false);
});

test('does not flag an ordinary phone field', () => {
  assert.equal(isPaymentLikeField(fakeInput({ type: 'tel', name: 'phone' })), false);
});

test('returns false for a null element', () => {
  assert.equal(isPaymentLikeField(null), false);
});
