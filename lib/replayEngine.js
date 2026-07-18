// tiwall-autobuy/lib/replayEngine.js
const { isPaymentLikeField } = require('./paymentFieldFilter');

async function runClickAction(page, text) {
  return page.evaluate((text) => {
    function isVisible(el) {
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return false;
      const style = window.getComputedStyle(el);
      if (style.visibility === 'hidden') return false;
      if (parseFloat(style.opacity) === 0) return false;
      return true;
    }
    const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], li, div, span'));
    const match = candidates.find((el) => {
      const ownText = (el.textContent || '').trim();
      if (ownText !== text) return false;
      const childSameText = Array.from(el.children).some(
        (child) => (child.textContent || '').trim() === text
      );
      return !childSameText && isVisible(el);
    });
    if (!match) return false;
    match.click();
    return true;
  }, text);
}

async function runFillAction(page, label, value) {
  return page.evaluate(
    `(function () {
      const isPaymentLikeField = ${isPaymentLikeField.toString()};
      function labelFor(input) {
        if (input.id) {
          const byFor = document.querySelector('label[for="' + CSS.escape(input.id) + '"]');
          if (byFor && byFor.textContent.trim()) return byFor.textContent.trim();
        }
        const wrappingLabel = input.closest('label');
        if (wrappingLabel && wrappingLabel.textContent.trim()) return wrappingLabel.textContent.trim();
        if (input.placeholder) return input.placeholder.trim();
        if (input.name) return input.name;
        return null;
      }
      const inputs = Array.from(document.querySelectorAll('input, textarea'));
      const match = inputs.find((el) => labelFor(el) === ${JSON.stringify(label)});
      if (!match) return { found: false, blocked: false };
      if (isPaymentLikeField(match)) return { found: true, blocked: true };
      // Known limitation: on React/Vue-style controlled inputs, direct assignment plus
      // dispatched events may not update the framework's internal value tracker, so the
      // site's own JS state might not observe this fill even though the DOM looks correct.
      match.value = ${JSON.stringify(value)};
      match.dispatchEvent(new Event('input', { bubbles: true }));
      match.dispatchEvent(new Event('change', { bubbles: true }));
      return { found: true, blocked: false };
    })()`
  );
}

async function runAction(page, action) {
  if (action.type === 'click') {
    const found = await runClickAction(page, action.text);
    return { found, blocked: false };
  }
  if (action.type === 'fill') {
    return runFillAction(page, action.label, action.value);
  }
  throw new Error(`Unknown action type: ${action.type}`);
}

async function runSequence(page, actions, log, startOrigin) {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    const result = await runAction(page, action);

    if (result.blocked) {
      return { success: false, blockedAtStep: i, action };
    }
    if (!result.found) {
      return { success: false, stuckAtStep: i, action };
    }

    log(
      action.type === 'click'
        ? `Step ${i + 1}: clicked "${action.text}"`
        : `Step ${i + 1}: filled "${action.label}"`
    );

    let currentOrigin;
    try {
      currentOrigin = new URL(page.url()).origin;
    } catch {
      currentOrigin = startOrigin;
    }
    if (currentOrigin !== startOrigin) {
      return { success: false, domainChanged: true, atStep: i };
    }
  }
  return { success: true };
}

module.exports = { runClickAction, runFillAction, runAction, runSequence };
