// tiwall-autobuy/lib/recording.js
const { isPaymentLikeField } = require('./paymentFieldFilter');

function buildInjectedScript() {
  return `
    (function () {
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

      document.addEventListener(
        'click',
        function (event) {
          const text = (event.target.textContent || '').trim();
          if (text && window.__recorderOnClick) window.__recorderOnClick(text);
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
          if (window.__recorderOnFill) window.__recorderOnFill(label, el.value);
        },
        true
      );

      function attachButton() {
        const btn = document.createElement('button');
        btn.textContent = 'Done — continue';
        btn.style.cssText =
          'position:fixed;bottom:20px;right:20px;z-index:2147483647;' +
          'background:#1f5c4f;color:#fff;border:none;border-radius:999px;' +
          'padding:12px 22px;font-size:15px;font-family:sans-serif;cursor:pointer;' +
          'box-shadow:0 4px 12px rgba(0,0,0,0.3);';
        btn.addEventListener('click', function () {
          if (window.__recorderOnDone) window.__recorderOnDone();
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
  let resolveDone;
  const donePromise = new Promise((resolve) => {
    resolveDone = resolve;
  });
  let stoppedEarly = false;

  await page.exposeFunction('__recorderOnClick', (text) => {
    actions.push({ type: 'click', text });
  });
  await page.exposeFunction('__recorderOnFill', (label, value) => {
    actions.push({ type: 'fill', label, value });
  });
  await page.exposeFunction('__recorderOnDone', () => {
    resolveDone();
  });

  await page.addInitScript(buildInjectedScript());

  return {
    actions,
    async waitForDone(startOrigin) {
      const domainCheckInterval = setInterval(() => {
        try {
          const currentOrigin = new URL(page.url()).origin;
          if (currentOrigin !== startOrigin) {
            stoppedEarly = true;
            resolveDone();
          }
        } catch {
          // ignore transient navigation states (e.g. about:blank)
        }
      }, 500);
      await donePromise;
      clearInterval(domainCheckInterval);
      return { actions, stoppedEarly };
    },
  };
}

module.exports = { prepareRecording, buildInjectedScript };
