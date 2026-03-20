CREATE TABLE auth_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider VARCHAR(100) NOT NULL,
    provider_account_id VARCHAR(255) DEFAULT '',
    display_name VARCHAR(255) NOT NULL,
    access_token_enc BYTEA,
    access_token_nonce BYTEA,
    access_token_tag BYTEA,
    refresh_token_enc BYTEA,
    refresh_token_nonce BYTEA,
    refresh_token_tag BYTEA,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_auth_connections_user_id ON auth_connections(user_id);
CREATE UNIQUE INDEX idx_auth_connections_user_provider ON auth_connections(user_id, provider, provider_account_id);
