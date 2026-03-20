/**
 * Extension message protocol.
 *
 * All communication between popup, content script, and background service
 * worker flows through chrome.runtime messages using this typed protocol.
 */

// ── Request types ──────────────────────────────────────────────────────────

export type MessageType =
  | 'UNLOCK_VAULT'
  | 'LOCK_VAULT'
  | 'GET_STATUS'
  | 'SEARCH_ITEMS'
  | 'AUTOFILL_REQUEST'
  | 'FORM_DETECTED'
  | 'INJECT_AUTOFILL'
  | 'SET_SESSION'
  | 'LOGOUT';

export interface UnlockVaultMessage {
  type: 'UNLOCK_VAULT';
  payload: { password: string };
}

export interface LockVaultMessage {
  type: 'LOCK_VAULT';
}

export interface GetStatusMessage {
  type: 'GET_STATUS';
}

export interface SearchItemsMessage {
  type: 'SEARCH_ITEMS';
  payload: { query: string; uri?: string };
}

export interface AutofillRequestMessage {
  type: 'AUTOFILL_REQUEST';
  payload: { itemId: string };
}

export interface FormDetectedMessage {
  type: 'FORM_DETECTED';
  payload: { uri: string; fields: DetectedField[] };
}

export interface DetectedField {
  selector: string;
  fieldType: 'username' | 'password' | 'email' | 'totp' | 'unknown';
}

export interface InjectAutofillMessage {
  type: 'INJECT_AUTOFILL';
  payload: { selector: string; value: string };
}

export interface SetSessionMessage {
  type: 'SET_SESSION';
  payload: { token: string };
}

export interface LogoutMessage {
  type: 'LOGOUT';
}

export type ExtensionMessage =
  | UnlockVaultMessage
  | LockVaultMessage
  | GetStatusMessage
  | SearchItemsMessage
  | AutofillRequestMessage
  | FormDetectedMessage
  | InjectAutofillMessage
  | SetSessionMessage
  | LogoutMessage;

// ── Response types ─────────────────────────────────────────────────────────

export interface StatusResponse {
  locked: boolean;
  itemCount: number;
}

export interface SearchResponse {
  results: Array<{ id: string; name: string; username: string; uri: string[] }>;
}

export interface GenericResponse {
  ok: boolean;
  error?: string;
}
