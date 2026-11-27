/**
 * Auth Box -- Background Service Worker (MV3)
 *
 * Responsibilities:
 *   1. Hold the decrypted vault cache in service worker memory
 *   2. Handle messages from popup and content scripts
 *   3. Manage auto-lock via chrome.alarms
 *   4. Match detected forms against vault items and set badge
 *   5. Send autofill data to content scripts
 */

import type {
  ExtensionMessage,
  GenericResponse,
  SearchResponse,
  StatusResponse,
  InjectAutofillMessage,
} from '@/lib/messages';
import * as vault from '@/lib/vault-cache';
import { uriMatchesPage } from '@/lib/item-format';

// ── Auto-lock alarm ────────────────────────────────────────────────────────

const AUTO_LOCK_ALARM = 'authbox-auto-lock';
const AUTO_LOCK_MINUTES = 15;

function resetAutoLock(): void {
  chrome.alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: AUTO_LOCK_MINUTES });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === AUTO_LOCK_ALARM) {
    vault.lock();
    chrome.action.setBadgeText({ text: '' });
  }
});

// ── Badge management ───────────────────────────────────────────────────────

function updateBadgeForUri(uri: string): void {
  if (!vault.isUnlocked()) {
    chrome.action.setBadgeText({ text: '' });
    return;
  }

  // Search vault items matching this URI
  const matches = vault.search('', uri);
  if (matches.length > 0) {
    chrome.action.setBadgeText({ text: String(matches.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

// ── Message router ─────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener(
  (
    message: ExtensionMessage,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response: GenericResponse | StatusResponse | SearchResponse) => void,
  ) => {
    handleMessage(message, sender)
      .then(sendResponse)
      .catch((err) => sendResponse({ ok: false, error: String(err) }));

    // Return true to indicate async sendResponse
    return true;
  },
);

/**
 * True for messages from the extension's own pages (the popup). Content
 * scripts run inside every web page, so a compromised renderer could forge
 * any message type; only the popup may unlock, search, autofill or change
 * the session.
 */
function fromExtensionPage(sender: chrome.runtime.MessageSender): boolean {
  return (
    sender.id === chrome.runtime.id &&
    sender.tab === undefined &&
    typeof sender.url === 'string' &&
    sender.url.startsWith(chrome.runtime.getURL(''))
  );
}

async function handleMessage(
  msg: ExtensionMessage,
  sender: chrome.runtime.MessageSender,
): Promise<GenericResponse | StatusResponse | SearchResponse> {
  if (msg.type === 'FORM_DETECTED') {
    // The only message a content script sends. Use the sending frame's real
    // URL, not the one the page put in the payload. sender.url is set for
    // content scripts without the "tabs" permission; sender.tab.url is not.
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || !sender.url) {
      return { ok: false, error: 'Not allowed' };
    }
    updateBadgeForUri(sender.url);
    return { ok: true };
  }
  if (!fromExtensionPage(sender)) {
    return { ok: false, error: 'Not allowed' };
  }

  switch (msg.type) {
    case 'UNLOCK_VAULT': {
      const success = await vault.unlock(msg.payload.password);
      if (success) resetAutoLock();
      return { ok: success, error: success ? undefined : 'Invalid password' };
    }

    case 'LOCK_VAULT': {
      vault.lock();
      chrome.alarms.clear(AUTO_LOCK_ALARM);
      chrome.action.setBadgeText({ text: '' });
      return { ok: true };
    }

    case 'GET_STATUS': {
      return {
        locked: !vault.isUnlocked(),
        itemCount: vault.itemCount(),
      };
    }

    case 'SEARCH_ITEMS': {
      const results = vault.search(msg.payload.query, msg.payload.uri);
      return { results };
    }

    case 'AUTOFILL_REQUEST': {
      const item = vault.getItem(msg.payload.itemId);
      if (!item) return { ok: false, error: 'Item not found' };

      // Only the popup reaches here (see fromExtensionPage), so fill the
      // active tab, and only if the page belongs to one of the item's saved
      // addresses: the popup list can be stale by the time the user clicks.
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!activeTab?.id || !activeTab.url) return { ok: false, error: 'No active tab' };
      if (!item.uri.some((u) => uriMatchesPage(u, activeTab.url!))) {
        return { ok: false, error: 'This login is not saved for this site' };
      }

      await sendAutofillToTab(activeTab.id, item.username, item.password);
      return { ok: true };
    }

    case 'SET_SESSION': {
      // Popup passes session token after SRP login so vault cache can fetch data
      await vault.setSessionToken(msg.payload.token);
      return { ok: true };
    }

    case 'LOGOUT': {
      // Full logout: lock vault, clear session, clear badge
      await vault.clearSession();
      chrome.alarms.clear(AUTO_LOCK_ALARM);
      chrome.action.setBadgeText({ text: '' });
      return { ok: true };
    }

    case 'INJECT_AUTOFILL': {
      // This message type is handled by content scripts, not background
      return { ok: true };
    }
  }
}

/** Send username + password to a specific tab's content script. */
async function sendAutofillToTab(
  tabId: number,
  username: string,
  password: string,
): Promise<void> {
  // Send username to the first username/email field
  const usernameMsg: InjectAutofillMessage = {
    type: 'INJECT_AUTOFILL',
    payload: {
      selector: 'input[type="email"], input[type="text"][autocomplete="username"], input[type="text"]',
      value: username,
    },
  };

  const passwordMsg: InjectAutofillMessage = {
    type: 'INJECT_AUTOFILL',
    payload: {
      selector: 'input[type="password"]',
      value: password,
    },
  };

  // Top frame only: the content script runs there, and a cross-origin iframe
  // must never receive credentials.
  await chrome.tabs.sendMessage(tabId, usernameMsg, { frameId: 0 }).catch(() => {});
  await chrome.tabs.sendMessage(tabId, passwordMsg, { frameId: 0 }).catch(() => {});
}

// ── Install / Update handler ───────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.tabs.create({ url: 'https://authbox.dev/welcome' });
  }
});
