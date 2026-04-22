-- mint_sessions: tracks every checkout attempt so we can detect duplicates,
-- surface partial-mint status to the creator, and enable retry flows.

CREATE TABLE IF NOT EXISTS mint_sessions (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_address  TEXT        NOT NULL,
    status           TEXT        NOT NULL DEFAULT 'pending'
                                 CHECK (status IN ('pending', 'success', 'partial', 'failed')),
    items_requested  INTEGER     NOT NULL,
    items_minted     INTEGER     NOT NULL DEFAULT 0,
    collection_address TEXT,
    tree_address     TEXT,
    asset_ids        TEXT[]      NOT NULL DEFAULT '{}',
    error_message    TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- mint_transactions: one row per on-chain tx within a session (collection, tree, each batch).
CREATE TABLE IF NOT EXISTS mint_transactions (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id   UUID        NOT NULL REFERENCES mint_sessions(id) ON DELETE CASCADE,
    tx_signature TEXT        NOT NULL,
    tx_type      TEXT        NOT NULL CHECK (tx_type IN ('collection', 'tree', 'mint_batch')),
    batch_start  INTEGER,
    batch_end    INTEGER,
    status       TEXT        NOT NULL DEFAULT 'confirmed'
                             CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mint_sessions_creator   ON mint_sessions  (creator_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mint_transactions_sess  ON mint_transactions (session_id);

ALTER TABLE mint_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mint_transactions ENABLE ROW LEVEL SECURITY;

-- Creators can read/write their own sessions only.
CREATE POLICY "mint_sessions_creator_rw" ON mint_sessions
    FOR ALL USING (creator_address = (auth.jwt() ->> 'sub'));

CREATE POLICY "mint_transactions_creator_rw" ON mint_transactions
    FOR ALL USING (
        session_id IN (
            SELECT id FROM mint_sessions
            WHERE creator_address = (auth.jwt() ->> 'sub')
        )
    );

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_mint_sessions_updated_at ON mint_sessions;
CREATE TRIGGER trg_mint_sessions_updated_at
    BEFORE UPDATE ON mint_sessions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
