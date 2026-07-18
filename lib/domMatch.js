// Shared element-matching logic for the generic recorder/replay feature.
// Embedded into browser contexts via .toString() (see recording.js, replayEngine.js) --
// never called directly from Node.

function isElementVisible(el) {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  const style = window.getComputedStyle(el);
  if (style.visibility === 'hidden') return false;
  if (parseFloat(style.opacity) === 0) return false;
  return true;
}

// Multiple elements can share identical text (e.g. every row in a list has its own
// "Buy a ticket" button) -- callers disambiguate by index into this same list,
// computed the same way at record time and replay time so the ordering matches.
function findTextCandidates(text) {
  const candidates = Array.from(document.querySelectorAll('a, button, [role="button"], li, div, span'));
  return candidates.filter((el) => {
    const ownText = (el.textContent || '').trim();
    if (ownText !== text) return false;
    const childSameText = Array.from(el.children).some(
      (child) => (child.textContent || '').trim() === text
    );
    return !childSameText && isElementVisible(el);
  });
}

module.exports = { isElementVisible, findTextCandidates };
