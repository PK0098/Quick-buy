// tiwall-autobuy/lib/replayEngine.js
const { isPaymentLikeField } = require('./paymentFieldFilter');
const { isElementVisible, findTextCandidates } = require('./domMatch');

async function runClickAction(page, text, matchIndex) {
  return page.evaluate(
    `(function () {
      const isElementVisible = ${isElementVisible.toString()};
      const findTextCandidates = ${findTextCandidates.toString()};
      const candidates = findTextCandidates(${JSON.stringify(text)});
      if (candidates.length === 0) return false;
      // Older recordings have no matchIndex -- fall back to the first match, same as
      // the original (pre-disambiguation) behavior.
      const requested = ${JSON.stringify(typeof matchIndex === 'number' ? matchIndex : null)};
      const index = requested !== null && requested >= 0 && requested < candidates.length ? requested : 0;
      candidates[index].click();
      return true;
    })()`
  );
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
    const found = await runClickAction(page, action.text, action.matchIndex);
    return { found, blocked: false };
  }
  if (action.type === 'fill') {
    return runFillAction(page, action.label, action.value);
  }
  throw new Error(`Unknown action type: ${action.type}`);
}

// Playwright's internal URL tracking can lag the real navigation by 100ms+ after a
// cross-origin click. Give it a bounded chance to catch up before trusting page.url()
// to decide whether a domain change actually happened.
async function settleOrigin(page, startOrigin, timeoutMs) {
  try {
    await page.waitForURL((url) => new URL(url).origin !== startOrigin, { timeout: timeoutMs });
  } catch {
    // Either no origin change happened, or it didn't complete within the window --
    // fall through to reading whatever page.url() reports now.
  }
  try {
    return new URL(page.url()).origin;
  } catch {
    return startOrigin;
  }
}

async function runSequence(page, actions, log, startOrigin) {
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    let result;
    try {
      result = await runAction(page, action);
    } catch (err) {
      const currentOrigin = await settleOrigin(page, startOrigin, 800);
      if (currentOrigin !== startOrigin) {
        return { success: false, domainChanged: true, atStep: i };
      }
      throw err;
    }

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

    const currentOrigin = await settleOrigin(page, startOrigin, 150);
    if (currentOrigin !== startOrigin) {
      return { success: false, domainChanged: true, atStep: i };
    }
  }
  return { success: true };
}

module.exports = { runClickAction, runFillAction, runAction, runSequence, settleOrigin };
