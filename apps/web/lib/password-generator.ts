/**
 * Cryptographic password generator using Web Crypto API.
 *
 * Uses crypto.getRandomValues() for uniform random sampling,
 * avoiding modulo bias via rejection sampling.
 */

const CHAR_SETS = {
  lowercase: 'abcdefghijklmnopqrstuvwxyz',
  uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  digits: '0123456789',
  symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?',
} as const;

export interface GeneratorOptions {
  length: number;
  lowercase: boolean;
  uppercase: boolean;
  digits: boolean;
  symbols: boolean;
}

export const DEFAULT_OPTIONS: GeneratorOptions = {
  length: 20,
  lowercase: true,
  uppercase: true,
  digits: true,
  symbols: true,
};

/**
 * Generate a cryptographically random password.
 *
 * Uses rejection sampling to avoid modulo bias: we generate random bytes
 * and only accept values that fall within a range evenly divisible by
 * the character set length.
 */
export function generatePassword(options: GeneratorOptions = DEFAULT_OPTIONS): string {
  const charset = buildCharset(options);
  if (charset.length === 0) {
    throw new Error('At least one character set must be enabled');
  }

  const result: string[] = [];
  const maxValid = 256 - (256 % charset.length); // rejection threshold

  while (result.length < options.length) {
    const batch = new Uint8Array(options.length * 2); // overshoot for rejections
    crypto.getRandomValues(batch);

    for (const byte of batch) {
      if (result.length >= options.length) break;
      if (byte < maxValid) {
        result.push(charset[byte % charset.length]);
      }
    }
  }

  return result.join('');
}

/**
 * Estimate password entropy in bits.
 */
export function estimateEntropy(options: GeneratorOptions): number {
  const charsetSize = buildCharset(options).length;
  if (charsetSize === 0) return 0;
  return Math.floor(options.length * Math.log2(charsetSize));
}

/**
 * Get a human-readable strength label for the given entropy.
 */
export function strengthLabel(entropy: number): {
  label: string;
  level: 'weak' | 'fair' | 'strong' | 'excellent';
} {
  if (entropy < 40) return { label: 'Weak', level: 'weak' };
  if (entropy < 60) return { label: 'Fair', level: 'fair' };
  if (entropy < 80) return { label: 'Strong', level: 'strong' };
  return { label: 'Excellent', level: 'excellent' };
}

function buildCharset(options: GeneratorOptions): string {
  let charset = '';
  if (options.lowercase) charset += CHAR_SETS.lowercase;
  if (options.uppercase) charset += CHAR_SETS.uppercase;
  if (options.digits) charset += CHAR_SETS.digits;
  if (options.symbols) charset += CHAR_SETS.symbols;
  return charset;
}
