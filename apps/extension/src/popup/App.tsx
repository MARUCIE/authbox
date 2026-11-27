import { useCallback, useEffect, useRef, useState } from "react";
import type {
  GenericResponse,
  SearchResponse,
  StatusResponse,
} from "@/lib/messages";
import { api } from "@/lib/api";
import { VAULT_URL } from "@/lib/config";

const SEARCH_DEBOUNCE_MS = 200;

type SearchResult = SearchResponse["results"][number];

type AppState = "loading" | "login" | "locked" | "unlocked";

export function App() {
  const [appState, setAppState] = useState<AppState>("loading");

  useEffect(() => {
    (async () => {
      try {
        // Check if we have a session token stored
        const stored = await chrome.storage.session.get("authbox_session");
        const hasSession = Boolean(stored.authbox_session);

        if (!hasSession) {
          setAppState("login");
          return;
        }

        // Check vault status
        const status: StatusResponse = await chrome.runtime.sendMessage({
          type: "GET_STATUS",
        });
        setAppState(status.locked ? "locked" : "unlocked");
      } catch {
        setAppState("login");
      }
    })();
  }, []);

  const handleLogin = useCallback(() => setAppState("locked"), []);
  const handleUnlock = useCallback(() => setAppState("unlocked"), []);
  const handleLock = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "LOCK_VAULT" });
    setAppState("locked");
  }, []);
  const handleLogout = useCallback(async () => {
    await chrome.runtime.sendMessage({ type: "LOGOUT" });
    setAppState("login");
  }, []);

  if (appState === "loading") {
    return (
      <div className="app">
        <header className="header">
          <h1 className="logo">Auth Box</h1>
          <p className="subtitle">Loading...</p>
        </header>
      </div>
    );
  }

  return (
    <div className="app">
      {appState === "login" && <LoginView onLogin={handleLogin} />}
      {appState === "locked" && (
        <LockedView onUnlock={handleUnlock} onLogout={handleLogout} />
      )}
      {appState === "unlocked" && (
        <UnlockedView onLock={handleLock} onLogout={handleLogout} />
      )}
    </div>
  );
}

// ── Login view (SRP authentication) ─────────────────────────────────────────

interface LoginViewProps {
  onLogin: () => void;
}

function LoginView({ onLogin }: LoginViewProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingTOTPEmail, setPendingTOTPEmail] = useState<string | null>(null);
  // Single-use challenge from the SRP step; the server requires it for TOTP.
  const [pendingTOTPChallenge, setPendingTOTPChallenge] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingTOTPEmail) {
      if (!totpCode.trim()) return;
    } else if (!email.trim() || !password.trim()) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (pendingTOTPEmail) {
        const session = await api.authApi.loginVerifyTOTP({
          email: pendingTOTPEmail,
          code: totpCode.trim(),
          loginChallenge: pendingTOTPChallenge ?? "",
        });
        await chrome.runtime.sendMessage({
          type: "SET_SESSION",
          payload: { token: session.sessionToken },
        });
        onLogin();
        return;
      }

      // Loaded on demand to keep the popup's first paint free of the crypto bundle.
      const { srpLogin } = await import("@authbox/api-client/login");
      const outcome = await srpLogin(api.authApi, email.trim(), password);

      if (outcome.kind === "totp_required") {
        setPendingTOTPChallenge(outcome.loginChallenge);
        setPendingTOTPEmail(email.trim());
        setTotpCode("");
        return;
      }

      // Store session token in background service worker
      await chrome.runtime.sendMessage({
        type: "SET_SESSION",
        payload: { token: outcome.session.sessionToken },
      });

      onLogin();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="header">
        <h1 className="logo">Auth Box</h1>
        <p className="subtitle">Sign in to your vault</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        {pendingTOTPEmail ? (
          <>
            <p className="subtitle">
              Master password verified. Enter your authenticator code.
            </p>
            <label htmlFor="totp-code" className="label">
              Authenticator Code
            </label>
            <input
              id="totp-code"
              type="text"
              inputMode="numeric"
              className="input"
              placeholder="123456"
              autoComplete="one-time-code"
              value={totpCode}
              onChange={(e) => setTotpCode(e.target.value)}
            />
          </>
        ) : (
          <>
            <label htmlFor="email" className="label">
              Email
            </label>
            <input
              ref={emailRef}
              id="email"
              type="email"
              className="input"
              placeholder="you@example.com"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />

            <label htmlFor="login-password" className="label">
              Master Password
            </label>
            <input
              id="login-password"
              type="password"
              className="input"
              placeholder="Enter master password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </>
        )}

        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting
            ? "Signing in..."
            : pendingTOTPEmail
              ? "Verify Code"
              : "Sign In"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <footer className="footer">
        <a
          className="link"
          href={`${VAULT_URL}/register`}
          target="_blank"
          rel="noreferrer"
        >
          Create Account
        </a>
      </footer>
    </>
  );
}

// ── Locked view ─────────────────────────────────────────────────────────────

interface LockedViewProps {
  onUnlock: () => void;
  onLogout: () => void;
}

function LockedView({ onUnlock, onLogout }: LockedViewProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Send the password exactly as typed: login uses it untrimmed, so a
    // trimmed copy would derive a different key and never unlock.
    if (!password.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const response: GenericResponse = await chrome.runtime.sendMessage({
        type: "UNLOCK_VAULT",
        payload: { password },
      });

      if (response.ok) {
        onUnlock();
      } else {
        setError(response.error || "Unlock failed");
        inputRef.current?.select();
      }
    } catch {
      setError("Extension error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <header className="header">
        <h1 className="logo">Auth Box</h1>
        <p className="subtitle">Vault Locked</p>
      </header>

      <form className="form" onSubmit={handleSubmit}>
        <label htmlFor="master-password" className="label">
          Master Password
        </label>
        <input
          ref={inputRef}
          id="master-password"
          type="password"
          className="input"
          placeholder="Enter master password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? "Unlocking..." : "Unlock"}
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <footer className="footer">
        <button className="link" onClick={onLogout}>
          Sign out
        </button>
      </footer>
    </>
  );
}

// ── Unlocked view ───────────────────────────────────────────────────────────

interface UnlockedViewProps {
  onLock: () => void;
  onLogout: () => void;
}

function UnlockedView({ onLock, onLogout }: UnlockedViewProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [empty, setEmpty] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Auto-search for current tab URI on mount
  useEffect(() => {
    (async () => {
      try {
        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (tab?.url) {
          const response: SearchResponse = await chrome.runtime.sendMessage({
            type: "SEARCH_ITEMS",
            payload: { query: "", uri: tab.url },
          });
          if (response.results.length > 0) {
            setResults(response.results);
          }
        }
      } catch {
        // Ignore -- tab query may fail on special pages
      }
    })();
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);

    const trimmed = query.trim();
    if (!trimmed) {
      // Don't clear URI-based results when search is empty
      setEmpty(false);
      setSearchError("");
      return;
    }

    timerRef.current = setTimeout(async () => {
      try {
        const response: SearchResponse = await chrome.runtime.sendMessage({
          type: "SEARCH_ITEMS",
          payload: { query: trimmed },
        });
        setResults(response.results);
        setEmpty(response.results.length === 0);
        setSearchError("");
      } catch {
        setResults([]);
        setEmpty(false);
        setSearchError("Search failed");
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  const handleItemClick = async (itemId: string) => {
    const response: GenericResponse = await chrome.runtime.sendMessage({
      type: "AUTOFILL_REQUEST",
      payload: { itemId },
    });
    if (!response?.ok) {
      // e.g. the login is saved for a different site than the open tab
      setSearchError(response?.error ?? "Autofill failed");
      return;
    }
    window.close();
  };

  return (
    <>
      <header className="header header-row">
        <h1 className="logo logo-sm">Auth Box</h1>
        <div style={{ display: "flex", gap: "8px" }}>
          <button className="btn btn-ghost" onClick={onLock} title="Lock vault">
            Lock
          </button>
          <button className="btn btn-ghost" onClick={onLogout} title="Sign out">
            Out
          </button>
        </div>
      </header>

      <div className="search-group">
        <input
          ref={searchRef}
          type="text"
          className="input"
          placeholder="Search vault..."
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {searchError && <p className="empty">{searchError}</p>}

      {empty && <p className="empty">No matching items</p>}

      {results.length > 0 && (
        <ul className="results-list">
          {results.map((item) => (
            <li
              key={item.id}
              className="result-item"
              role="button"
              tabIndex={0}
              onClick={() => handleItemClick(item.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  handleItemClick(item.id);
              }}
            >
              <div>
                <div className="result-name">{item.name}</div>
                <div className="result-username">{item.username}</div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <footer className="footer">
        <a className="link" href={VAULT_URL} target="_blank" rel="noreferrer">
          Open Full Vault
        </a>
      </footer>
    </>
  );
}


