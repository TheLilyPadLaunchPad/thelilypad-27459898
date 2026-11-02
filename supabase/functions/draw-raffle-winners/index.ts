import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RaffleEntry {
  id: string;
  user_id: string;
  ticket_count: number;
}

interface Raffle {
  id: string;
  name: string;
  winner_count: number;
  prize_type: string;
  prize_details: any;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Two callers: the scheduled job (shared secret) or a signed-in admin drawing one raffle.
  const cronSecret = Deno.env.get('CRON_SECRET');
  const authHeader = req.headers.get('Authorization') ?? '';
  let targetRaffleId: string | null = null;
  const isCron = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  if (!isCron) {
    const token = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData } = token ? await supabase.auth.getUser(token) : { data: { user: null } };
    const uid = userData?.user?.id;
    let isAdmin = false;
    if (uid) {
      const { data: role } = await supabase.from('user_roles').select('role').eq('user_id', uid).eq('role', 'admin').maybeSingle();
      isAdmin = !!role;
    }
    if (!isAdmin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    try {
      const body = await req.json();
      if (typeof body?.raffle_id === 'string' && /^[0-9a-f-]{36}$/i.test(body.raffle_id)) targetRaffleId = body.raffle_id;
    } catch { /* no body */ }
    if (!targetRaffleId) {
      return new Response(JSON.stringify({ error: 'raffle_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
  }

  try {
    console.log('Starting raffle winner draw process...');

    // Find all raffles that have ended but not yet drawn
    const now = new Date().toISOString();
    const { data: endedRaffles, error: raffleError } = targetRaffleId
      ? await supabase.from('lily_raffles').select('*').eq('id', targetRaffleId).eq('is_drawn', false)
      : await supabase
          .from('lily_raffles')
          .select('*')
          .eq('is_active', true)
          .eq('is_drawn', false)
          .lt('end_date', now);

    if (raffleError) {
      console.error('Error fetching ended raffles:', raffleError);
      throw raffleError;
    }

    console.log(`Found ${endedRaffles?.length || 0} raffles to draw`);

    const results: { raffle_id: string; raffle_name: string; winners: string[]; status: string }[] = [];

    for (const raffle of (endedRaffles || []) as Raffle[]) {
      console.log(`Processing raffle: ${raffle.name} (${raffle.id})`);

      // Get all entries for this raffle
      const { data: entries, error: entriesError } = await supabase
        .from('lily_raffle_entries')
        .select('id, user_id, ticket_count')
        .eq('raffle_id', raffle.id);

      if (entriesError) {
        console.error(`Error fetching entries for raffle ${raffle.id}:`, entriesError);
        results.push({
          raffle_id: raffle.id,
          raffle_name: raffle.name,
          winners: [],
          status: `Error: ${entriesError.message}`
        });
        continue;
      }

      if (!entries || entries.length === 0) {
        console.log(`No entries for raffle ${raffle.id}, marking as drawn`);

        // Mark raffle as drawn with no winners
        await supabase
          .from('lily_raffles')
          .update({
            is_drawn: true,
            drawn_at: now,
            winners: []
          })
          .eq('id', raffle.id);

        results.push({
          raffle_id: raffle.id,
          raffle_name: raffle.name,
          winners: [],
          status: 'No entries - marked as drawn'
        });
        continue;
      }

      // Build weighted ticket pool
      const ticketPool: string[] = [];
      for (const entry of entries as RaffleEntry[]) {
        for (let i = 0; i < entry.ticket_count; i++) {
          ticketPool.push(entry.user_id);
        }
      }

      console.log(`Total tickets in pool: ${ticketPool.length}`);

      // Draw winners (unique users only)
      const winners: string[] = [];
      const usedIndices = new Set<number>();
      const winnerCount = Math.min(raffle.winner_count, new Set(ticketPool).size);

      while (winners.length < winnerCount && usedIndices.size < ticketPool.length) {
        const randomIndex = Math.floor(Math.random() * ticketPool.length);

        if (usedIndices.has(randomIndex)) continue;
        usedIndices.add(randomIndex);

        const winnerId = ticketPool[randomIndex];
        if (!winners.includes(winnerId)) {
          winners.push(winnerId);
          console.log(`Winner ${winners.length}: ${winnerId}`);
        }
      }

      // Update raffle with winners
      const { error: updateError } = await supabase
        .from('lily_raffles')
        .update({
          is_drawn: true,
          drawn_at: now,
          winners: winners.map(id => ({ user_id: id }))
        })
        .eq('id', raffle.id);

      if (updateError) {
        console.error(`Error updating raffle ${raffle.id}:`, updateError);
        results.push({
          raffle_id: raffle.id,
          raffle_name: raffle.name,
          winners: [],
          status: `Error updating: ${updateError.message}`
        });
        continue;
      }

      // Send notifications to winners
      for (const winnerId of winners) {
        const { error: notifError } = await supabase
          .from('notifications')
          .insert({
            user_id: winnerId,
            type: 'raffle_win',
            title: '🎉 You Won a Raffle!',
            message: `Congratulations! You won the "${raffle.name}" raffle!`,
            link: '/raffles',
            metadata: {
              raffle_id: raffle.id,
              raffle_name: raffle.name,
              prize_type: raffle.prize_type,
              prize_details: raffle.prize_details
            }
          });

        if (notifError) {
          console.error(`Error sending notification to ${winnerId}:`, notifError);
        }
      }

      results.push({
        raffle_id: raffle.id,
        raffle_name: raffle.name,
        winners: winners,
        status: 'Success'
      });

      console.log(`Raffle ${raffle.name} drawn successfully with ${winners.length} winners`);
    }

    console.log('Raffle draw process completed');

    return new Response(JSON.stringify({
      success: true,
      processed: results.length,
      results
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in draw-raffle-winners:', error);
    return new Response(JSON.stringify({
      success: false,
      error: errorMessage
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
