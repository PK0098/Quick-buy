// Self-contained on purpose: this function's source is serialized via
// .toString() and re-executed inside a browser page context (see
// lib/recording.js and lib/replayEngine.js). It must not reference any
// outer closure variables - only its own parameter and browser globals.
function isPaymentLikeField(el) {
  if (!el) return false;
  if (el.type === 'password') return true;
  const name = el.getAttribute('name') || '';
  const id = el.getAttribute('id') || '';
  const autocomplete = el.getAttribute('autocomplete') || '';
  const combined = (name + ' ' + id + ' ' + autocomplete).toLowerCase();
  const patterns = [
    /cc-number/,
    /cc-csc/,
    /cc-exp/,
    /card/,
    /cvv/,
    /cvc/,
    /security.?code/,
    /expir/,
    /iban/,
    /account.?number/,
    /routing/,
    /bank/,
    /payment/,
    /\bpan\b/,
  ];
  return patterns.some((re) => re.test(combined));
}

module.exports = { isPaymentLikeField };
