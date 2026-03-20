'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import {
  validateMnemonic,
  mnemonicToSeed,
  deriveAllKeys,
  setWordlist,
} from '@authbox/crypto';
import { ENGLISH_WORDLIST } from '@authbox/crypto';
import { useVaultStore } from '@/lib/vault-store';

setWordlist(ENGLISH_WORDLIST);

type Step = 'seed' | 'password' | 'restoring' | 'done';

export default function RestoreVaultPage() {
  const router = useRouter();
  const unlockVault = useVaultStore((s) => s.unlockVault);

  const [step, setStep] = useState<Step>('seed');
  const [seedWords, setSeedWords] = useState<string[]>(Array(24).fill(''));
  const [seedError, setSeedError] = useState('');
  const [masterPassword, setMasterPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const handleWordChange = useCallback((index: number, value: string) => {
    setSeedWords((prev) => {
      const next = [...prev];
      next[index] = value.trim().toLowerCase();
      return next;
    });
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent, startIndex: number) => {
    const text = e.clipboardData.getData('text');
    const words = text.trim().split(/\s+/);
    if (words.length > 1) {
      e.preventDefault();
      setSeedWords((prev) => {
        const next = [...prev];
        words.forEach((word, i) => {
          if (startIndex + i < 24) {
            next[startIndex + i] = word.toLowerCase();
          }
        });
        return next;
      });
    }
  }, []);

  const handleValidateSeed = useCallback(() => {
    setSeedError('');
    const mnemonic = seedWords.join(' ').trim();
    const wordCount = mnemonic.split(/\s+/).filter(Boolean).length;

    if (wordCount !== 12 && wordCount !== 24) {
      setSeedError('Enter 12 or 24 words. Currently: ' + wordCount);
      return;
    }

    if (!validateMnemonic(mnemonic)) {
      setSeedError('Invalid recovery phrase. Check spelling and word order.');
      return;
    }

    setStep('password');
  }, [seedWords]);

  const handleRestore = useCallback(async () => {
    setPasswordError('');
    if (masterPassword.length < 8) {
      setPasswordError('Master password must be at least 8 characters.');
      return;
    }

    setStep('restoring');

    const mnemonic = seedWords.join(' ').trim();
    const seed = mnemonicToSeed(mnemonic, masterPassword);
    const keys = deriveAllKeys(seed);

    unlockVault(keys.vaultKey);

    setStep('done');
    setTimeout(() => router.push('/passwords'), 1500);
  }, [seedWords, masterPassword, unlockVault, router]);

  return (
    <>
      {/* Step: Enter Seed */}
      {step === 'seed' && (
        <div>
          <div className="text-center mb-6">
            <div className="flex justify-center mb-4">
              <div
                className="flex h-14 w-14 items-center justify-center rounded-2xl"
                style={{ background: 'var(--surface-highest)' }}
              >
                <svg className="h-7 w-7" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="var(--primary)">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 12c0-1.232-.046-2.453-.138-3.662a4.006 4.006 0 0 0-3.7-3.7 48.678 48.678 0 0 0-7.324 0 4.006 4.006 0 0 0-3.7 3.7c-.017.22-.032.441-.046.662M19.5 12l3-3m-3 3-3-3m-12 3c0 1.232.046 2.453.138 3.662a4.006 4.006 0 0 0 3.7 3.7 48.656 48.656 0 0 0 7.324 0 4.006 4.006 0 0 0 3.7-3.7c.017-.22.032-.441.046-.662M4.5 12l3 3m-3-3-3 3" />
                </svg>
              </div>
            </div>
            <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
              Restore Your Vault
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
              Enter your 24-word recovery phrase. You can paste all words at once.
            </p>
          </div>

          {/* Word input grid */}
          <div className="grid grid-cols-3 gap-2 mb-4">
            {seedWords.map((word, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono w-4 text-right shrink-0" style={{ color: 'var(--outline)' }}>
                  {i + 1}
                </span>
                <input
                  type="text"
                  value={word}
                  onChange={(e) => handleWordChange(i, e.target.value)}
                  onPaste={(e) => handlePaste(e, i)}
                  className="w-full rounded-md px-2 py-1.5 text-xs font-mono transition-colors"
                  style={{
                    background: 'var(--surface-highest)',
                    border: '1px solid var(--ghost-border)',
                    color: word ? 'var(--foreground)' : 'var(--outline)',
                  }}
                  placeholder="..."
                  autoCapitalize="none"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            ))}
          </div>

          {seedError && (
            <p className="text-xs mb-4" style={{ color: 'var(--destructive)' }}>{seedError}</p>
          )}

          <button
            onClick={handleValidateSeed}
            className="btn-gradient px-6 py-3 rounded-lg font-medium text-sm w-full"
          >
            Validate Recovery Phrase
          </button>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--muted-foreground)' }}>
            Don&apos;t have a recovery phrase?{' '}
            <a href="/create" className="font-medium" style={{ color: 'var(--primary)' }}>
              Create new vault
            </a>
          </p>
        </div>
      )}

      {/* Step: Master Password */}
      {step === 'password' && (
        <div>
          <div className="text-center mb-6">
            <div className="flex justify-center mb-3">
              <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="var(--tertiary)">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
            </div>
            <h2 className="text-xl font-bold" style={{ fontFamily: 'var(--font-heading)' }}>
              Recovery Phrase Valid
            </h2>
            <p className="text-sm mt-2" style={{ color: 'var(--muted-foreground)' }}>
              Enter the master password you used when creating this vault.
            </p>
          </div>

          <div className="flex flex-col gap-4 mb-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium">Master Password</label>
              <Input
                type="password"
                placeholder="Your master password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </div>
          </div>

          {passwordError && (
            <p className="text-xs mb-4" style={{ color: 'var(--destructive)' }}>{passwordError}</p>
          )}

          <button
            onClick={handleRestore}
            className="btn-gradient px-6 py-3 rounded-lg font-medium text-sm w-full"
          >
            Restore Vault
          </button>
        </div>
      )}

      {/* Step: Restoring */}
      {step === 'restoring' && (
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-transparent"
                 style={{ borderTopColor: 'var(--primary)' }} />
          </div>
          <p className="text-sm font-medium">Deriving keys...</p>
          <p className="text-xs mt-1" style={{ color: 'var(--muted-foreground)' }}>
            Reconstructing vault encryption keys from seed phrase
          </p>
        </div>
      )}

      {/* Step: Done */}
      {step === 'done' && (
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
            Vault Restored
          </h2>
          <p className="text-sm" style={{ color: 'var(--tertiary)' }}>
            Your identity is yours. Unstoppable.
          </p>
        </div>
      )}
    </>
  );
}
