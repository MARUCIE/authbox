/**
 * Auth Box -- Content Script
 *
 * Injected into every page at document_idle.
 *
 * Responsibilities:
 *   1. Detect login forms on the page
 *   2. Notify background of detected forms (for badge / matching)
 *   3. Inject autofill data when triggered by the popup or background
 *   4. Observe DOM mutations for dynamically injected forms
 */

import type { DetectedField, FormDetectedMessage, InjectAutofillMessage } from '@/lib/messages';

// ── Form detection ─────────────────────────────────────────────────────────

function detectLoginForms(): DetectedField[] {
  const fields: DetectedField[] = [];

  const passwordInputs = document.querySelectorAll<HTMLInputElement>(
    'input[type="password"]',
  );

  for (const pw of passwordInputs) {
    fields.push({
      selector: buildUniqueSelector(pw),
      fieldType: 'password',
    });

    // Look for a sibling or preceding username/email field
    const form = pw.closest('form');
    if (form) {
      const textInputs = form.querySelectorAll<HTMLInputElement>(
        'input[type="text"], input[type="email"], input[autocomplete="username"]',
      );
      for (const ti of textInputs) {
        fields.push({
          selector: buildUniqueSelector(ti),
          fieldType: guessFieldType(ti),
        });
      }

      // Detect TOTP fields
      const totpInputs = form.querySelectorAll<HTMLInputElement>(
        'input[autocomplete="one-time-code"]',
      );
      for (const ti of totpInputs) {
        fields.push({
          selector: buildUniqueSelector(ti),
          fieldType: 'totp',
        });
      }
    }
  }

  return fields;
}

function guessFieldType(el: HTMLInputElement): DetectedField['fieldType'] {
  const autocomplete = (el.autocomplete || '').toLowerCase();
  if (autocomplete === 'username') return 'username';
  if (autocomplete === 'email') return 'email';
  if (autocomplete === 'one-time-code') return 'totp';

  const name = (el.name + el.id).toLowerCase();
  if (name.includes('email')) return 'email';
  if (name.includes('user') || name.includes('login')) return 'username';
  return 'unknown';
}

/** Build a CSS selector that uniquely identifies this element. */
function buildUniqueSelector(el: HTMLElement): string {
  if (el.id) return `#${CSS.escape(el.id)}`;

  const tag = el.tagName.toLowerCase();
  const name = el.getAttribute('name');
  if (name) return `${tag}[name="${CSS.escape(name)}"]`;

  const type = el.getAttribute('type');
  const autocomplete = el.getAttribute('autocomplete');
  if (type && autocomplete) {
    return `${tag}[type="${CSS.escape(type)}"][autocomplete="${CSS.escape(autocomplete)}"]`;
  }
  if (type) return `${tag}[type="${CSS.escape(type)}"]`;
  return tag;
}

// ── Notify background ──────────────────────────────────────────────────────

function notifyFormsDetected(fields: DetectedField[]): void {
  if (fields.length === 0) return;

  const message: FormDetectedMessage = {
    type: 'FORM_DETECTED',
    payload: {
      uri: window.location.href,
      fields,
    },
  };

  chrome.runtime.sendMessage(message).catch(() => {
    // Extension context may be invalidated; safe to ignore
  });
}

// ── Autofill injection ─────────────────────────────────────────────────────

function fillField(selector: string, value: string): void {
  const el = document.querySelector<HTMLInputElement>(selector);
  if (!el) return;

  // Focus the field first (some frameworks need this)
  el.focus();

  // Set value using native setter to bypass React/Vue controlled components
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;

  if (nativeInputValueSetter) {
    nativeInputValueSetter.call(el, value);
  } else {
    el.value = value;
  }

  // Dispatch events that frameworks listen to
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

chrome.runtime.onMessage.addListener(
  (msg: InjectAutofillMessage, _sender, sendResponse) => {
    if (msg.type === 'INJECT_AUTOFILL') {
      fillField(msg.payload.selector, msg.payload.value);
      sendResponse({ ok: true });
    }
    return false;
  },
);

// ── Init ───────────────────────────────────────────────────────────────────

const detected = detectLoginForms();
notifyFormsDetected(detected);

// Observe DOM mutations for dynamically injected forms (SPAs)
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

const observer = new MutationObserver(() => {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    const newFields = detectLoginForms();
    notifyFormsDetected(newFields);
  }, 500);
});

observer.observe(document.body, { childList: true, subtree: true });
