/**
 * Polls Solana via Helius for a transaction that includes the given Solana Pay
 * `reference` pubkey, validates that it transferred the expected SOL amount to
 * the expected recipient and carried the expected protocol memo, and records
 * the result in `earnings` (for tips) or `shop_purchases` (for purchases).
 *
 * Idempotent: re-invoking with the same `reference` returns the existing
 * signature without writing duplicate rows.
 */

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface Body {
    reference: string;
    recipient: string;
    amountSol: number;
    action: string;
    memo: string;
    network?: 'devnet' | 'mainnet-beta';
    context?: Record<string, string | number>;
}

const rpcUrl = (network: string) =>
    network === 'mainnet-beta'
        ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
        : `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

async function rpc<T = unknown>(url: string, method: string, params: unknown[]): Promise<T> {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    });
    const json = await res.json();
    if (json.error) throw new Error(json.error.message);
    return json.result;
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const body = (await req.json()) as Body;
        if (!body.reference || !body.recipient || !body.amountSol || !body.action) {
            return new Response(JSON.stringify({ error: 'Missing required fields' }), {
                status: 400,
                headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
        }

        const network = body.network ?? 'devnet';
        const url = rpcUrl(network);

        // 1. Find signatures referencing this reference key
        const sigs = await rpc<Array<{ signature: string; err: unknown }>>(
            url,
            'getSignaturesForAddress',
            [body.reference, { limit: 5 }],
        );
        const candidate = sigs.find((s) => !s.err);
        if (!candidate) {
            return new Response(JSON.stringify({ signature: null, status: 'pending' }), {
                headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
        }

        // 2. Fetch and validate the tx
        const tx = await rpc<any>(url, 'getTransaction', [
            candidate.signature,
            { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 },
        ]);
        if (!tx) {
            return new Response(JSON.stringify({ signature: null, status: 'pending' }), {
                headers: { ...corsHeaders, 'content-type': 'application/json' },
            });
        }

        // Validate transfer: find a SOL transfer to recipient of expected amount
        const instructions: any[] =
            tx.transaction?.message?.instructions ?? [];
        const lamportsExpected = Math.round(body.amountSol * 1e9);
        const transferOk = instructions.some(
            (ix) =>
                ix?.program === 'system' &&
                ix?.parsed?.type === 'transfer' &&
                ix?.parsed?.info?.destination === body.recipient &&
                Math.abs(Number(ix?.parsed?.info?.lamports ?? 0) - lamportsExpected) <
                    Math.max(5000, lamportsExpected * 0.001),
        );
        if (!transferOk) {
            return new Response(
                JSON.stringify({ error: 'Tx does not match expected transfer', signature: candidate.signature }),
                { status: 422, headers: { ...corsHeaders, 'content-type': 'application/json' } },
            );
        }

        // Validate memo present (loose: must include the LilyPad protocol prefix + action)
        const logs: string[] = tx.meta?.logMessages ?? [];
        const memoOk = logs.some((l) => l.includes('TheLilyPad:v1:') && l.includes(body.action));
        if (!memoOk) {
            return new Response(
                JSON.stringify({ error: 'Protocol memo missing', signature: candidate.signature }),
                { status: 422, headers: { ...corsHeaders, 'content-type': 'application/json' } },
            );
        }

        const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

        // 3. Record (idempotent by signature)
        const payerAddress: string | undefined =
            tx.transaction?.message?.accountKeys?.[0]?.pubkey ??
            tx.transaction?.message?.accountKeys?.[0];

        if (body.action === 'tip:creator') {
            // Find recipient creator profile
            const { data: profile } = await supabase
                .from('user_profiles')
                .select('user_id, display_name')
                .eq('wallet_address', body.recipient)
                .maybeSingle();

            if (profile?.user_id) {
                // Dedupe via metadata->>tx_signature
                const { data: existing } = await supabase
                    .from('earnings')
                    .select('id')
                    .eq('user_id', profile.user_id)
                    .eq('tx_signature', candidate.signature)
                    .maybeSingle();

                if (!existing) {
                    await supabase.from('earnings').insert({
                        user_id: profile.user_id,
                        type: 'tip',
                        amount: body.amountSol,
                        currency: 'SOL',
                        tx_signature: candidate.signature,
                        from_address: payerAddress,
                        message: (body.context?.message as string) ?? null,
                    });
                }
            }
        } else if (body.action.startsWith('shop:')) {
            const { data: existing } = await supabase
                .from('shop_purchases')
                .select('id')
                .eq('tx_signature', candidate.signature)
                .maybeSingle();

            if (!existing) {
                await supabase.from('shop_purchases').insert({
                    tx_signature: candidate.signature,
                    amount: body.amountSol,
                    buyer_address: payerAddress,
                    item_id: (body.context?.item_id as string) ?? null,
                    metadata: body.context ?? {},
                });
            }
        }

        return new Response(
            JSON.stringify({ signature: candidate.signature, status: 'confirmed' }),
            { headers: { ...corsHeaders, 'content-type': 'application/json' } },
        );
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return new Response(JSON.stringify({ error: msg }), {
            status: 500,
            headers: { ...corsHeaders, 'content-type': 'application/json' },
        });
    }
});
