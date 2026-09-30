import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana RPC endpoints
const SOLANA_RPC = {
  mainnet: 'https://api.mainnet-beta.solana.com',
  devnet: 'https://api.devnet.solana.com',
};

interface VerifyRequest {
  signature: string;
  expectedAmount: number; // in SOL
  expectedRecipient: string;
  expectedSender?: string;
  network: 'mainnet' | 'devnet';
}

interface TransactionDetails {
  signature: string;
  amount: number;
  sender: string;
  recipient: string;
  confirmedAt: string;
  slot: number;
  fee: number;
}

// Fetch transaction details from Solana RPC
async function getTransactionDetails(
  signature: string,
  rpcUrl: string
): Promise<TransactionDetails | null> {
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          {
            encoding: 'jsonParsed',
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0,
          },
        ],
      }),
    });

    const data = await response.json();

    if (data.error || !data.result) {
      console.error('RPC error:', data.error);
      return null;
    }

    const tx = data.result;
    const meta = tx.meta;
    const message = tx.transaction.message;

    // Check if transaction was successful
    if (meta.err !== null) {
      console.error('Transaction failed on-chain:', meta.err);
      return null;
    }

    // Extract transfer details from parsed instructions
    const instructions = message.instructions;
    let transferInfo: { sender: string; recipient: string; amount: number } | null = null;

    for (const ix of instructions) {
      if (ix.program === 'system' && ix.parsed?.type === 'transfer') {
        transferInfo = {
          sender: ix.parsed.info.source,
          recipient: ix.parsed.info.destination,
          amount: ix.parsed.info.lamports / 1e9, // Convert lamports to SOL
        };
        break;
      }
    }

    if (!transferInfo) {
      // Fallback: calculate from balance changes
      const preBalances = meta.preBalances;
      const postBalances = meta.postBalances;
      const accountKeys = message.accountKeys.map((k: any) =>
        typeof k === 'string' ? k : k.pubkey
      );

      // Find sender (balance decreased) and recipient (balance increased)
      let senderIdx = -1;
      let recipientIdx = -1;
      let maxDecrease = 0;
      let maxIncrease = 0;

      for (let i = 0; i < preBalances.length; i++) {
        const change = postBalances[i] - preBalances[i];
        if (change < maxDecrease) {
          maxDecrease = change;
          senderIdx = i;
        }
        if (change > maxIncrease) {
          maxIncrease = change;
          recipientIdx = i;
        }
      }

      if (senderIdx >= 0 && recipientIdx >= 0) {
        transferInfo = {
          sender: accountKeys[senderIdx],
          recipient: accountKeys[recipientIdx],
          amount: maxIncrease / 1e9,
        };
      }
    }

    if (!transferInfo) {
      console.error('Could not extract transfer info from transaction');
      return null;
    }

    return {
      signature,
      amount: transferInfo.amount,
      sender: transferInfo.sender,
      recipient: transferInfo.recipient,
      confirmedAt: new Date(tx.blockTime * 1000).toISOString(),
      slot: tx.slot,
      fee: meta.fee / 1e9,
    };
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

// Check if transaction signature already exists in database
async function checkDuplicateSignature(
  supabase: any,
  signature: string
): Promise<boolean> {
  // Check multiple tables for duplicate tx_hash
  const tables = [
    'nft_transactions',
    'nft_listings',
    'lily_raffle_entries',
    'lily_blind_box_purchases',
    'earnings',
  ];

  for (const table of tables) {
    const { data } = await supabase
      .from(table)
      .select('id')
      .eq('tx_hash', signature)
      .maybeSingle();

    if (data) {
      console.log(`Duplicate signature found in ${table}`);
      return true;
    }
  }

  return false;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Require a valid Supabase JWT — prevents anonymous signature probing
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Authentication required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace('Bearer ', '')
    );
    if (authError || !user) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Invalid or expired token' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      );
    }

    const body: VerifyRequest = await req.json();
    const { signature, expectedAmount, expectedRecipient, expectedSender, network } = body;

    console.log('Verifying transaction:', { signature, expectedAmount, expectedRecipient, network });

    // Validate inputs
    if (!signature || typeof signature !== 'string') {
      return new Response(
        JSON.stringify({ verified: false, error: 'Invalid signature' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!expectedAmount || expectedAmount <= 0) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Invalid expected amount' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    if (!expectedRecipient) {
      return new Response(
        JSON.stringify({ verified: false, error: 'Invalid expected recipient' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Fetch transaction from Solana
    const rpcUrl = network === 'mainnet' ? SOLANA_RPC.mainnet : SOLANA_RPC.devnet;
    const txDetails = await getTransactionDetails(signature, rpcUrl);

    if (!txDetails) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: 'Transaction not found or failed'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    console.log('Transaction details:', txDetails);

    // Verify recipient matches
    if (txDetails.recipient.toLowerCase() !== expectedRecipient.toLowerCase()) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: 'Recipient mismatch',
          details: { expected: expectedRecipient, actual: txDetails.recipient }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Verify amount (allow small tolerance for rounding)
    const amountTolerance = 0.000001; // 1 lamport tolerance
    if (Math.abs(txDetails.amount - expectedAmount) > amountTolerance) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: 'Amount mismatch',
          details: { expected: expectedAmount, actual: txDetails.amount }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Optional: Verify sender only if provided
    if (expectedSender && txDetails.sender.toLowerCase() !== expectedSender.toLowerCase()) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: 'Sender mismatch',
          details: { expected: expectedSender, actual: txDetails.sender }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Only after the caller proves the transaction details (incl. sender) do we
    // reveal whether it was already used.
    // Check for duplicate transaction
    const isDuplicate = await checkDuplicateSignature(supabase, signature);
    if (isDuplicate) {
      return new Response(
        JSON.stringify({
          verified: false,
          error: 'Transaction signature already used'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // Transaction verified successfully
    console.log('Transaction verified successfully:', signature);

    return new Response(
      JSON.stringify({
        verified: true,
        transaction: {
          signature: txDetails.signature,
          amount: txDetails.amount,
          sender: txDetails.sender,
          recipient: txDetails.recipient,
          confirmedAt: txDetails.confirmedAt,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Verification error:', error);
    return new Response(
      JSON.stringify({ verified: false, error: error.message || 'Verification failed' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
