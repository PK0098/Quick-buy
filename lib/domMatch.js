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
//
// Scans every element rather than a fixed tag whitelist: restricting to
// "a, button, li, div, span" seems reasonable but silently breaks on sites that
// wrap clickable text in other tags (e.g. a <p> inside a <li>) -- the <li> then
// gets excluded by the childSameText check below (its only child duplicates its
// text), and the <p> was never a candidate in the first place, leaving zero
// matches even though a perfectly good deepest-element match exists.
function findTextCandidates(text) {
  const candidates = Array.from(document.querySelectorAll('*'));
  return candidates.filter((el) => {
    const ownText = (el.textContent || '').trim();
    if (ownText !== text) return false;
    if (!isElementVisible(el)) return false;
    // Defer to a child only if that child is itself a usable (visible) match --
    // e.g. tooltips are commonly implemented as a hidden (opacity:0 until hover)
    // child that duplicates its clickable parent's full text (seatmap seat cells
    // do this: the visible 28x29 cell's only content is an invisible tooltip
    // holding "Row X Seat Y Price Z"). Deferring unconditionally to any same-text
    // child would wrongly disqualify that parent and, if nothing deeper ever
    // qualifies, mismatching keeps climbing all the way up to some much broader
    // ancestor (e.g. a whole row of seats) that only "matches" by accident.
    const hasUsableChildMatch = Array.from(el.children).some(
      (child) => (child.textContent || '').trim() === text && isElementVisible(child)
    );
    return !hasUsableChildMatch;
  });
}

module.exports = { isElementVisible, findTextCandidates };
