// dom-utils.js

export function waitForElement(selectorFn, { timeout = 8000, interval = 150 } = {}) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      const el = selectorFn();
      if (el) { resolve(el); return; }
      if (Date.now() - start >= timeout) { resolve(null); return; }
      setTimeout(check, interval);
    };
    check();
  });
}

export function setInputValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }

  // Trigger full lifecycle events required by Banner JS widgets
  el.dispatchEvent(new Event('focus', { bubbles: true }));
  el.dispatchEvent(new Event('keydown', { bubbles: true }));
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('keyup', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.dispatchEvent(new Event('blur', { bubbles: true }));
}