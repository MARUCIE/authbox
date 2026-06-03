-- Crypto wallet: watch-only account + address metadata.
--
-- This schema is watch-only BY CONSTRUCTION: there is no column for a private
-- key or seed. The server stores the account xpub (extended PUBLIC key) and
-- derived addresses, which is enough to scan balances/history via public
-- indexers but never enough to spend. Private keys are derived client-side
-- from the BIP-39 seed and never transmitted.
--
-- Balances use NUMERIC, not BIGINT: ETH wei (up to ~1.2e29) overflows int8.

CREATE TABLE wallet_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    coin VARCHAR(16) NOT NULL,                         -- 'btc' | 'eth'
    network VARCHAR(16) NOT NULL DEFAULT 'mainnet',    -- 'mainnet' | 'testnet'
    script_type VARCHAR(16),                           -- BTC only: 'p2wpkh' | 'p2pkh'
    account_index INT NOT NULL DEFAULT 0,              -- BIP-44 account'
    derivation_path VARCHAR(64) NOT NULL,              -- account-level, e.g. m/84'/0'/0'
    xpub TEXT NOT NULL,                                -- watch-only extended public key
    label VARCHAR(255) NOT NULL DEFAULT '',
    cached_balance NUMERIC(40, 0) NOT NULL DEFAULT 0,  -- smallest unit (sats / wei)
    cached_balance_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_accounts_user_id ON wallet_accounts(user_id);
-- One account per (user, coin, network, script_type, account_index). COALESCE
-- folds the nullable script_type (NULL for ETH) into the uniqueness key.
CREATE UNIQUE INDEX idx_wallet_accounts_unique
    ON wallet_accounts(user_id, coin, network, COALESCE(script_type, ''), account_index);

CREATE TABLE wallet_addresses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES wallet_accounts(id) ON DELETE CASCADE,
    address VARCHAR(128) NOT NULL,
    derivation_path VARCHAR(64) NOT NULL,              -- full path, e.g. m/84'/0'/0'/0/0
    change SMALLINT NOT NULL DEFAULT 0,                -- 0 = receive, 1 = change
    address_index INT NOT NULL DEFAULT 0,
    public_key VARCHAR(66) NOT NULL,                   -- compressed hex; never a private key
    cached_balance NUMERIC(40, 0) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_addresses_account_id ON wallet_addresses(account_id);
CREATE UNIQUE INDEX idx_wallet_addresses_unique
    ON wallet_addresses(account_id, change, address_index);
CREATE INDEX idx_wallet_addresses_address ON wallet_addresses(address);
