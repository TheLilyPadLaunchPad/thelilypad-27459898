-- Add native_token_balance to user_profiles
ALTER TABLE user_profiles 
ADD COLUMN IF NOT EXISTS native_token_balance NUMERIC DEFAULT 0;

-- Create token_transactions table to trace the economy
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  amount NUMERIC NOT NULL,
  transaction_type TEXT NOT NULL, -- 'deposit', 'purchase', 'sale', 'buyback_allocation'
  reference_id TEXT, -- e.g., tx_hash for deposit, or item_id for purchase
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS for token_transactions
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own token transactions"
  ON token_transactions FOR SELECT
  USING (auth.uid() = user_id);

-- Add locked_buyback_tokens to buyback_program_collections
ALTER TABLE buyback_program_collections
ADD COLUMN IF NOT EXISTS locked_buyback_tokens NUMERIC DEFAULT 0;

-- Insert Mock Mode feature lock
INSERT INTO feature_locks (feature_key, feature_name, description, is_enabled) 
VALUES ('mock_mode', 'Mock Mode (Native Tokens)', 'Enable Web2 Native Token economy and hide real SOL/USDC purchases.', true)
ON CONFLICT (feature_key) DO NOTHING;
