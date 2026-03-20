CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    srp_salt BYTEA NOT NULL,
    srp_verifier BYTEA NOT NULL,
    encrypted_vault_key BYTEA NOT NULL,
    vault_key_nonce BYTEA NOT NULL,
    vault_key_tag BYTEA NOT NULL,
    kdf_params JSONB NOT NULL DEFAULT '{"algorithm":"argon2id","memory":262144,"iterations":3,"parallelism":4,"keyLength":32}',
    public_key BYTEA,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
