'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  generateMnemonic,
  validateMnemonic,
  mnemonicToSeed,
  deriveAllKeys,
  setWordlist,
} from '@authbox/crypto';
import { ENGLISH_WORDLIST } from '@authbox/crypto';
import { useVaultStore } from '@/lib/vault-store';

// Initialize wordlist
setWordlist(ENGLISH_WORDLIST);

type Step = 'generate' | 'backup' | 'verify' | 'password' | 'ready';

export default function CreateVaultPage() {
  const router = useRouter();
  const unlockVault = useVaultStore((s) => s.unlockVault);

  const [step, setStep] = useState<Step>('generate');
  const [mnemonic, setMnemonic] = useState('');
  const [words, setWords] = useState<string[]>([]);
  const [verifyIndices, setVerifyIndices] = useState<number[]>([]);
  const [verifyInputs, setVerifyInputs] = useState<Record<number, string>>({});
  const [verifyError, setVerifyError] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleGenerate = useCallback(() => {
    const m = generateMnemonic(256);
    setMnemonic(m);
    setWords(m.split(' '));

    // Pick 3 random indices for verification
    const indices: number[] = [];
    while (indices.length < 3) {
      const idx = Math.floor(Math.random() * 24);
      if (!indices.includes(idx)) indices.push(idx);
    }
    setVerifyIndices(indices.sort((a, b) => a - b));
    setStep('backup');
  }, []);

  const handleVerify = useCallback(() => {
    setVerifyError('');
    for (const idx of verifyIndices) {
      if ((verifyInputs[idx] || '').trim().toLowerCase() !== words[idx]) {
        setVerifyError(`Word #${idx + 1} is incorrect. Please check your backup.`);
        return;
      }
    }
    setStep('password');
  }, [verifyIndices, verifyInputs, words]);

  const handleComplete = useCallback(async () => {
    setPasswordError('');
    if (masterPassword.length < 8) {
      setPasswordError('Master password must be at least 8 characters.');
      return;
    }
    if (masterPassword !== confirmPassword) {
      setPasswordError('Passwords do not match.');
      return;
    }

    // Derive keys from seed
    const seed = mnemonicToSeed(mnemonic, masterPassword);
    const keys = deriveAllKeys(seed);

    // Store vault key in memory (Zustand)
    unlockVault(keys.vaultKey);

    setStep('ready');

    // Navigate to vault after brief delay
    setTimeout(() => router.push('/passwords'), 1500);
  }, [mnemonic, masterPassword, confirmPassword, unlockVault, router]);

  return (
    <>
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-2 mb-6">
        {(['generate', 'backup', 'verify', 'password', 'ready'] as Step[]).map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className="h-2 w-2 rounded-full transition-all"
              style={{
                background: step === s ? 'var(--primary)' :
                  (['generate', 'backup', 'verify', 'password', 'ready'].indexOf(step) > i
                    ? 'var(--tertiary)' : 'var(--surface-highest)'),
                width: step === s ? 24 : 8,
              }}
            />
          </div>
        ))}
      </div>

      {/* Step: Generate */}
      {step === 'generate' && (
        <div className="text-center">
          <div className="flex justify-center mb-6">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'var(--primary-container)' }}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Create Your Vault
          </h2>
          <p className="text-sm mb-2" style={{ color: 'var(--muted-foreground)' }}>
            Your vault is protected by a 24-word recovery phrase.
          </p>
          <p className="text-sm mb-8" style={{ color: 'var(--muted-foreground)' }}>
            No email. No account. No server dependency.
            <br />
            <strong style={{ color: 'var(--foreground)' }}>Your keys, your identity.</strong>
          </p>

          <button
            onClick={handleGenerate}
            className="btn-gradient px-8 py-3.5 rounded-lg font-medium text-base w-full"
          >
            Generate Recovery Phrase
          </button>

          <p className="text-xs mt-6" style={{ color: 'var(--outline)' }}>
            Already have a recovery phrase?{' '}
            <button
              onClick={() => {/* TODO: import flow */}}
              className="font-medium"
              style={{ color: 'var(--primary)' }}
            >
              Restore vault
            </button>
          </p>
        </div>
      )}

      {/* Step: Backup */}
      {step === 'backup' && (
        <div>
          <h2 className="text-xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Write Down Your Recovery Phrase
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
            These 24 words are the ONLY way to recover your vault. Write them down on paper and store safely.
          </p>

          {/* Word grid */}
          <div className="grid grid-cols-3 gap-2 mb-6">
            {words.map((word, i) => (
              <div
                key={i}
                className="flex items-center gap-2 rounded-lg px-3 py-2"
                style={{ background: 'var(--surface-highest)' }}
              >
                <span className="text-xs font-mono w-5 text-right" style={{ color: 'var(--outline)' }}>
                  {i + 1}
                </span>
                <span className="text-sm font-medium font-mono">{word}</span>
              </div>
            ))}
          </div>

          {/* Warning */}
          <div className="flex items-start gap-2 rounded-lg p-3 mb-6" style={{ background: 'rgba(255, 183, 125, 0.1)' }}>
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--secondary)">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--secondary)' }}>This phrase cannot be recovered</p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--muted-foreground)' }}>
                If you lose these words, your vault is permanently inaccessible. Even Auth Box cannot help you.
              </p>
            </div>
          </div>

          <button
            onClick={() => setStep('verify')}
            className="btn-gradient px-6 py-3 rounded-lg font-medium text-sm w-full"
          >
            I&apos;ve Written It Down
          </button>
        </div>
      )}

      {/* Step: Verify */}
      {step === 'verify' && (
        <div>
          <h2 className="text-xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Verify Your Backup
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
            Enter the following words from your recovery phrase to confirm you&apos;ve saved it correctly.
          </p>

          <div className="flex flex-col gap-4 mb-6">
            {verifyIndices.map((idx) => (
              <div key={idx} className="flex flex-col gap-1.5">
                <label className="text-sm font-medium">
                  Word #{idx + 1}
                </label>
                <Input
                  type="text"
                  placeholder={`Enter word #${idx + 1}`}
                  value={verifyInputs[idx] || ''}
                  onChange={(e) => setVerifyInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                  autoComplete="off"
                  autoCapitalize="none"
                />
              </div>
            ))}
          </div>

          {verifyError && (
            <p className="text-sm mb-4" style={{ color: 'var(--destructive)' }}>{verifyError}</p>
          )}

          <button
            onClick={handleVerify}
            className="btn-gradient px-6 py-3 rounded-lg font-medium text-sm w-full"
          >
            Verify
          </button>
        </div>
      )}

      {/* Step: Master Password */}
      {step === 'password' && (
        <div>
          <h2 className="text-xl font-bold text-center mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Set Device Password
          </h2>
          <p className="text-sm text-center mb-6" style={{ color: 'var(--muted-foreground)' }}>
            This password encrypts your vault on this device. It works offline -- no server involved.
          </p>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Master Password</label>
              <Input
                type="password"
                placeholder="At least 8 characters"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Confirm Password</label>
              <Input
                type="password"
                placeholder="Re-enter password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg p-3 mb-6" style={{ background: 'var(--surface-highest)' }}>
            <svg className="h-4 w-4 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--tertiary)">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
              Your master password strengthens the seed phrase encryption. Even if someone finds your 24 words, they need this password too.
            </p>
          </div>

          {passwordError && (
            <p className="text-sm mb-4" style={{ color: 'var(--destructive)' }}>{passwordError}</p>
          )}

          <button
            onClick={handleComplete}
            className="btn-gradient px-6 py-3 rounded-lg font-medium text-sm w-full"
          >
            Create Vault
          </button>
        </div>
      )}

      {/* Step: Ready */}
      {step === 'ready' && (
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'var(--tertiary-container)' }}
            >
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="var(--tertiary)">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
          </div>
          <h2 className="text-2xl font-bold mb-2" style={{ fontFamily: 'var(--font-heading)' }}>
            Vault Created
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--tertiary)' }}>
            Your identity is yours. Unstoppable.
          </p>
          <p className="text-xs" style={{ color: 'var(--muted-foreground)' }}>
            Redirecting to your vault...
          </p>
        </div>
      )}
    </>
  );
}
