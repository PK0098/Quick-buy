// tiwall-autobuy/lib/replayEngine.js
const { isPaymentLikeField } = require('./paymentFieldFilter');
const { isElementVisible, findTextCandidates } = require('./domMatch');

async function runClickAction(page, text, matchIndex) {
  // Resolve which element to click via an ElementHandle, then click it through
  // Playwright's own real, actionability-aware click() (scrolls into view, waits for
  // stability, dispatches a genuine mouse event sequence) rather than a DOM .click()
  // call: some sites bind their real handler to mousedown/pointerdown or otherwise
  // don't react to a bare synthetic click -- Playwright's own click() is what reliably
  // reproduces a real one.
  const handle = await page.evaluateHandle(
    `(function () {
      const isElementVisible = ${isElementVisible.toString()};
      const findTextCandidates = ${findTextCandidates.toString()};
      const candidates = findTextCandidates(${JSON.stringify(text)});
      if (candidates.length === 0) return null;
      // Older recordings have no matchIndex -- fall back to the first match, same as
      // the original (pre-disambiguation) behavior.
      const requested = ${JSON.stringify(typeof matchIndex === 'number' ? matchIndex : null)};
      const index = requested !== null && requested >= 0 && requested < candidates.length ? requested : 0;
      return candidates[index];
    })()`
  );
  let current = handle.asElement();
  if (!current) {
    await handle.dispose();
    return false;
  }

  // The text-matched element is sometimes wrapped by an ancestor that visually
  // overlays it (e.g. a list item with its own hover-highlight layer sitting above the
  // text label it wraps) -- Playwright's click() reports that ancestor as
  // "intercepting pointer events" and times out trying to click the element itself.
  // Climb the ancestor chain, retrying on each level, until one actually receives the
  // click. Each attempt's own timeout also comfortably waits out transient overlays
  // (e.g. a loading spinner) that clear on their own within a couple of seconds.
  const maxLevels = 4;
  for (let level = 0; level < maxLevels; level++) {
    try {
      await current.click({ timeout: 5000 });
      await current.dispose();
      return true;
    } catch {
      const parentHandle = await current.evaluateHandle((el) => el.parentElement);
      const parentEl = parentHandle.asElement();
      await current.dispose();
      if (!parentEl) {
        await parentHandle.dispose();
        return false;
      }
      current = parentEl;
    }
  }
  await current.dispose();
  return false;
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
    const urlBefore = page.url();
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

    // A click that navigates to a new (same-origin) page leaves its content still
    // rendering -- the next action would otherwise run immediately against a mostly
    // empty document and find nothing. Only same-origin URL changes need this: a
    // cross-origin change already returned above, and clicks that don't navigate at
    // all (the common case) skip it entirely.
    if (page.url() !== urlBefore) {
      await page.waitForLoadState('domcontentloaded').catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return { success: true };
}

module.exports = { runClickAction, runFillAction, runAction, runSequence, settleOrigin };
