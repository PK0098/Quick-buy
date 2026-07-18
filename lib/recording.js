// tiwall-autobuy/lib/recording.js
const { isPaymentLikeField } = require('./paymentFieldFilter');
const { isElementVisible, findTextCandidates } = require('./domMatch');

const LOG_KEY = '__recorderLog';

function buildInjectedScript() {
  return `
    (function () {
      const isPaymentLikeField = ${isPaymentLikeField.toString()};
      const isElementVisible = ${isElementVisible.toString()};
      const findTextCandidates = ${findTextCandidates.toString()};
      const LOG_KEY = ${JSON.stringify(LOG_KEY)};

      function readLog() {
        try {
          const raw = sessionStorage.getItem(LOG_KEY);
          return raw ? JSON.parse(raw) : { actions: [], done: false };
        } catch {
          return { actions: [], done: false };
        }
      }

      function writeLog(log) {
        try {
          sessionStorage.setItem(LOG_KEY, JSON.stringify(log));
        } catch {
          // sessionStorage unavailable -- that one interaction is lost, not the
          // whole recording.
        }
      }

      // Writing straight to sessionStorage (synchronous, survives same-origin
      // navigation) rather than calling an exposed Node function directly: a click
      // that also triggers navigation (e.g. a real <a href> link, common on sites
      // that aren't SPAs) can tear the document down before an async exposeFunction
      // bridge call reaches Node, silently dropping exactly the click that mattered.
      // Node polls this log independently of any single document's lifetime instead.
      function appendAction(action) {
        const log = readLog();
        log.actions.push(action);
        writeLog(log);
      }

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

      document.addEventListener(
        'click',
        function (event) {
          if (event.target.closest && event.target.closest('[data-recorder-ui]')) return;

          // Purely visual controls (icon squares, decorative markers) often carry no
          // text of their own -- e.g. a seatmap seat is a small colored div whose only
          // sibling is an otherwise-hidden tooltip holding "Row X Seat Y Price Z".
          // Climbing to the nearest ancestor that actually has text is what lets us
          // record anything useful at all for these, instead of silently recording
          // nothing (which would drop the click entirely, breaking every later step).
          let source = event.target;
          while (source && !(source.textContent || '').trim()) {
            source = source.parentElement;
          }
          if (!source) return;
          const text = (source.textContent || '').trim();
          if (!text) return;

          // Several elements can carry identical text (e.g. every row's own "Buy a
          // ticket" button) -- record which one of them was actually clicked so replay
          // can pick the same one instead of always landing on the first DOM match.
          const matching = findTextCandidates(text);
          let matchIndex = matching.indexOf(source);
          if (matchIndex === -1) {
            const ancestorMatch = matching.find((el) => el.contains(source));
            matchIndex = ancestorMatch ? matching.indexOf(ancestorMatch) : 0;
          }
          appendAction({ type: 'click', text, matchIndex });
        },
        true
      );

      document.addEventListener(
        'change',
        function (event) {
          const el = event.target;
          if (!(el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
          if (isPaymentLikeField(el)) return;
          const label = labelFor(el);
          if (!label) return;
          appendAction({ type: 'fill', label, value: el.value });
        },
        true
      );

      function attachButton() {
        const btn = document.createElement('button');
        btn.setAttribute('data-recorder-ui', 'true');
        btn.textContent = 'Done — continue';
        btn.style.cssText =
          'position:fixed;bottom:20px;right:20px;z-index:2147483647;' +
          'background:#1f5c4f;color:#fff;border:none;border-radius:999px;' +
          'padding:12px 22px;font-size:15px;font-family:sans-serif;cursor:pointer;' +
          'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        btn.addEventListener('click', function () {
          const log = readLog();
          log.done = true;
          writeLog(log);
        });
        document.body.appendChild(btn);
      }

      if (document.body) {
        attachButton();
      } else {
        document.addEventListener('DOMContentLoaded', attachButton);
      }
    })();
  `;
}

async function prepareRecording(page) {
  const actions = [];

  await page.addInitScript(buildInjectedScript());

  return {
    actions,
    async waitForDone(startOrigin) {
      return new Promise((resolve) => {
        let settled = false;
        const finish = (stoppedEarly) => {
          if (settled) return;
          settled = true;
          clearInterval(poll);
          resolve({ actions, stoppedEarly });
        };

        const poll = setInterval(async () => {
          if (settled) return;

          let currentOrigin = null;
          try {
            currentOrigin = new URL(page.url()).origin;
          } catch {
            // transient navigation state (e.g. about:blank); retry next tick
          }
          if (currentOrigin && currentOrigin !== startOrigin) {
            finish(true);
            return;
          }

          let log;
          try {
            log = await page.evaluate(([key]) => {
              try {
                const raw = sessionStorage.getItem(key);
                return raw ? JSON.parse(raw) : null;
              } catch {
                return null;
              }
            }, [LOG_KEY]);
          } catch {
            return; // page mid-navigation; retry next tick
          }
          if (settled || !log) return;

          while (actions.length < log.actions.length) {
            actions.push(log.actions[actions.length]);
          }
          if (log.done) finish(false);
        }, 300);
      });
    },
  };
}

module.exports = { prepareRecording, buildInjectedScript };
