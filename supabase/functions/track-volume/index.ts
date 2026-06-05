import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Volume weights for different source types (in basis points, 10000 = 100%)
const VOLUME_WEIGHTS: Record<string, number> = {
  nft_sell: 10000,   // 100% weight
  nft_buy: 10000,    // 100% weight
  offer: 5000,       // 50% weight (only when accepted)
  listing: 2500,     // 25% weight
  sticker: 10000,    // 100% weight
  emote: 10000,      // 100% weight
  emoji: 10000,      // 100% weight
};

// Platform fee configuration
const PLATFORM_FEE_BPS = 250; // 2.5%
const BUYBACK_ALLOCATION_BPS = 5000; // 50% of platform fee

// Actions that require authentication (write operations)
const AUTHENTICATED_ACTIONS = ['record_volume', 'record_fee', 'record_transaction'];

interface VolumeEvent {
  source_type: 'nft_sell' | 'nft_buy' | 'offer' | 'listing' | 'sticker' | 'emote' | 'emoji';
  volume_amount: number;
  tx_hash: string;
  collection_id?: string;
  shop_item_id?: string;
  user_id?: string;
  chain?: string;
}

interface PlatformFeeEvent {
  collection_id?: string;
  shop_item_id?: string;
  tx_hash: string;
  fee_amount: number;
  fee_type: string;
  source_volume: number;
  chain?: string;
}

async function authenticateRequest(req: Request, supabase: any): Promise<{ userId: string | null; error: string | null }> {
  const authHeader = req.headers.get('Authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return { userId: null, error: 'Missing or invalid authorization header' };
  }

  const token = authHeader.replace('Bearer ', '');

  try {
    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      console.error('Auth error:', error?.message || 'No user found');
      return { userId: null, error: 'Invalid or expired token' };
    }

    return { userId: data.user.id, error: null };
  } catch (err) {
    console.error('Authentication failed:', err);
    return { userId: null, error: 'Authentication failed' };
  }
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

    // Create client with anon key for auth verification
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') || '' } }
    });

    // Create service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { action, data } = await req.json();
    console.log(`Processing action: ${action}`);

    // Check if action requires authentication
    if (AUTHENTICATED_ACTIONS.includes(action)) {
      const { userId, error: authError } = await authenticateRequest(req, supabaseAuth);

      if (authError || !userId) {
        console.warn(`Unauthorized attempt for action: ${action}`);
        return new Response(
          JSON.stringify({ error: 'Unauthorized', details: authError }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Authenticated user ${userId} for action: ${action}`);

      // For write operations, always overwrite user_id with the authenticated caller's ID
      // to prevent spoofing volume credit to other users.
      if (data) {
        data.user_id = userId;
      }
    }

    switch (action) {
      case 'record_volume': {
        const event = data as VolumeEvent;

        // Validate required fields
        if (!event.source_type || !event.volume_amount || !event.tx_hash) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: source_type, volume_amount, tx_hash' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate source_type
        if (!VOLUME_WEIGHTS[event.source_type]) {
          return new Response(
            JSON.stringify({ error: 'Invalid source_type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate volume_amount is positive
        if (event.volume_amount <= 0) {
          return new Response(
            JSON.stringify({ error: 'volume_amount must be positive' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = await recordVolume(supabase, event);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'record_fee': {
        const event = data as PlatformFeeEvent;

        // Validate required fields
        if (!event.tx_hash || !event.fee_amount || !event.fee_type || !event.source_volume) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: tx_hash, fee_amount, fee_type, source_volume' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate fee_amount is positive
        if (event.fee_amount <= 0) {
          return new Response(
            JSON.stringify({ error: 'fee_amount must be positive' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = await recordPlatformFee(supabase, event);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'record_transaction': {
        // Validate required fields
        if (!data?.source_type || !data?.volume_amount || !data?.tx_hash) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: source_type, volume_amount, tx_hash' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate source_type
        if (!VOLUME_WEIGHTS[data.source_type]) {
          return new Response(
            JSON.stringify({ error: 'Invalid source_type' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Validate volume_amount is positive
        if (data.volume_amount <= 0) {
          return new Response(
            JSON.stringify({ error: 'volume_amount must be positive' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        const result = await recordTransaction(supabase, data);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_pool_status': {
        // Public read - no auth required
        const chain = data?.chain || 'solana';
        const result = await getPoolStatus(supabase, chain);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'get_volume_stats': {
        // Public read - no auth required
        const result = await getVolumeStats(supabase, data?.period || '24h');
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(
          JSON.stringify({ error: 'Unknown action' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in track-volume:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function recordVolume(supabase: any, event: VolumeEvent) {
  const weight = VOLUME_WEIGHTS[event.source_type] || 10000;
  const weightedVolume = (event.volume_amount * weight) / 10000;
  const chain = event.chain || 'solana';

  // Get current day period
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const periodEnd = new Date(periodStart.getTime() + 24 * 60 * 60 * 1000);

  // Insert volume tracking record
  const { data: volumeRecord, error: volumeError } = await supabase
    .from('volume_tracking')
    .insert({
      source_type: event.source_type,
      volume_amount: event.volume_amount,
      weight: weight / 10000, // Store as decimal
      weighted_volume: weightedVolume,
      tx_hash: event.tx_hash,
      collection_id: event.collection_id || null,
      user_id: event.user_id || null,
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      chain: chain,
    })
    .select()
    .single();

  if (volumeError) {
    console.error('Error inserting volume record:', volumeError);
    throw volumeError;
  }

  // Update buyback pool accumulated volume
  await updateBuybackPool(supabase, weightedVolume, chain);

  console.log(`Recorded volume: ${event.volume_amount} ${event.source_type}, weighted: ${weightedVolume} on ${chain}`);

  return {
    success: true,
    volume_id: volumeRecord.id,
    weighted_volume: weightedVolume,
  };
}

async function recordPlatformFee(supabase: any, event: PlatformFeeEvent) {
  // Calculate buyback contribution (50% of platform fee)
  const buybackContribution = (event.fee_amount * BUYBACK_ALLOCATION_BPS) / 10000;
  const chain = event.chain || 'solana';

  const { data: feeRecord, error: feeError } = await supabase
    .from('platform_fees')
    .insert({
      collection_id: event.collection_id || null,
      shop_item_id: event.shop_item_id || null,
      tx_hash: event.tx_hash,
      fee_amount: event.fee_amount,
      fee_type: event.fee_type,
      source_volume: event.source_volume,
      contributed_to_buyback: buybackContribution,
      chain: chain,
    })
    .select()
    .single();

  if (feeError) {
    console.error('Error inserting fee record:', feeError);
    throw feeError;
  }

  // Update buyback pool balance
  await updateBuybackPoolBalance(supabase, buybackContribution, chain);

  console.log(`Recorded fee: ${event.fee_amount}, buyback contribution: ${buybackContribution} on ${chain}`);

  return {
    success: true,
    fee_id: feeRecord.id,
    buyback_contribution: buybackContribution,
  };
}

async function recordTransaction(supabase: any, data: any) {
  const {
    source_type,
    volume_amount,
    tx_hash,
    collection_id,
    shop_item_id,
    user_id,
    chain = 'solana',
  } = data;

  // Calculate platform fee (2.5% of volume)
  const platformFee = (volume_amount * PLATFORM_FEE_BPS) / 10000;
  const buybackContribution = (platformFee * BUYBACK_ALLOCATION_BPS) / 10000;

  // Record volume
  const volumeResult = await recordVolume(supabase, {
    source_type,
    volume_amount,
    tx_hash,
    collection_id,
    user_id,
    chain,
  } as any);

  // Record platform fee
  const feeResult = await recordPlatformFee(supabase, {
    collection_id,
    shop_item_id,
    tx_hash,
    fee_amount: platformFee,
    fee_type: source_type,
    source_volume: volume_amount,
    chain,
  } as any);

  return {
    success: true,
    volume: volumeResult,
    fee: feeResult,
    total_volume: volume_amount,
    platform_fee: platformFee,
    buyback_contribution: buybackContribution,
  };
}

async function updateBuybackPool(supabase: any, weightedVolume: number, chain: string) {
  // Get current pool status by chain
  const { data: pool, error: fetchError } = await supabase
    .from('buyback_pool')
    .select('*')
    .eq('chain', chain)
    .single();

  if (fetchError) {
    console.error(`Error fetching buyback pool for ${chain}:`, fetchError);
    // Silent fail if pool doesn't exist yet for this chain? 
    // Or maybe insert on demand? Ideally seeded by migration.
    return;
  }

  if (pool) {
    // Update existing pool
    const newAccumulatedVolume = Number(pool.accumulated_volume) + weightedVolume;

    const { error: updateError } = await supabase
      .from('buyback_pool')
      .update({
        accumulated_volume: newAccumulatedVolume,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pool.id);

    if (updateError) {
      console.error('Error updating buyback pool volume:', updateError);
    }

    // Check if threshold reached
    if (newAccumulatedVolume >= Number(pool.buyback_threshold)) {
      console.log(`Buyback threshold reached for ${chain}! Volume: ${newAccumulatedVolume}, Threshold: ${pool.buyback_threshold}`);
    }
  }
}

async function updateBuybackPoolBalance(supabase: any, buybackContribution: number, chain: string) {
  const { data: pool, error: fetchError } = await supabase
    .from('buyback_pool')
    .select('*')
    .eq('chain', chain)
    .single();

  if (fetchError) {
    console.error(`Error fetching buyback pool for ${chain}:`, fetchError);
    return;
  }

  if (pool) {
    const newBalance = Number(pool.pool_balance) + buybackContribution;

    const { error: updateError } = await supabase
      .from('buyback_pool')
      .update({
        pool_balance: newBalance,
        updated_at: new Date().toISOString(),
      })
      .eq('id', pool.id);

    if (updateError) {
      console.error('Error updating buyback pool balance:', updateError);
    }
  }
}

async function getPoolStatus(supabase: any, chain: string = 'solana') {
  const { data: pool, error } = await supabase
    .from('buyback_pool')
    .select('*')
    .eq('chain', chain)
    .maybeSingle();

  if (error) {
    console.error('Error fetching pool status:', error);
    throw error;
  }

  // If no pool found for chain (e.g. before migration), return defaults
  if (!pool) {
    return {
      pool_balance: 0,
      accumulated_volume: 0,
      buyback_threshold: 100,
      progress_percent: 0,
      total_buybacks_executed: 0,
      last_buyback_at: null,
      can_execute_buyback: false,
      chain: chain
    };
  }

  const progress = pool.buyback_threshold > 0
    ? (Number(pool.accumulated_volume) / Number(pool.buyback_threshold)) * 100
    : 0;

  return {
    pool_balance: Number(pool.pool_balance),
    accumulated_volume: Number(pool.accumulated_volume),
    buyback_threshold: Number(pool.buyback_threshold),
    progress_percent: Math.min(progress, 100),
    total_buybacks_executed: pool.total_buybacks_executed,
    last_buyback_at: pool.last_buyback_at,
    can_execute_buyback: progress >= 100,
    chain: pool.chain
  };
}

async function getVolumeStats(supabase: any, period: string) {
  let startDate: Date;
  const now = new Date();

  switch (period) {
    case '1h':
      startDate = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case '24h':
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case '7d':
      startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '30d':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    default:
      startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  }

  const { data: volumes, error } = await supabase
    .from('volume_tracking')
    .select('source_type, volume_amount, weighted_volume')
    .gte('created_at', startDate.toISOString());

  if (error) {
    console.error('Error fetching volume stats:', error);
    throw error;
  }

  // Aggregate by source type
  const bySource: Record<string, { total: number; weighted: number; count: number }> = {};
  let totalVolume = 0;
  let totalWeighted = 0;

  for (const v of volumes || []) {
    const source = v.source_type;
    if (!bySource[source]) {
      bySource[source] = { total: 0, weighted: 0, count: 0 };
    }
    bySource[source].total += Number(v.volume_amount);
    bySource[source].weighted += Number(v.weighted_volume);
    bySource[source].count += 1;
    totalVolume += Number(v.volume_amount);
    totalWeighted += Number(v.weighted_volume);
  }

  return {
    period,
    total_volume: totalVolume,
    total_weighted_volume: totalWeighted,
    transaction_count: volumes?.length || 0,
    by_source: bySource,
  };
}
