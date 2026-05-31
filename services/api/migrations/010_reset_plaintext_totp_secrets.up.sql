-- TOTP secrets are now stored in an authenticated encrypted envelope.
-- Existing plaintext seeds cannot be safely migrated without the application key.
UPDATE users
SET totp_secret = NULL,
    totp_enabled = FALSE,
    totp_verified_at = NULL,
    updated_at = NOW()
WHERE totp_secret IS NOT NULL;
