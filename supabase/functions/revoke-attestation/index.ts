/**
 * Admin-only: revoke a creator attestation.
 *
 * Issues a follow-up memo tx from the same issuer authority recording the
 * revocation, then clears the `verification_attestation` columns on
 * `user_profiles` and flips `is_verified` to false.
 */

import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
    Connection,
    Keypair,
    PublicKey,
    Transaction,
    TransactionInstruction,
    sendAndConfirmTransaction,
} from 'npm:@solana/web3.js@1.95.3';
import bs58 from 'npm:bs58@5.0.0';

const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ISSUER_KEY =
    Deno.env.get('ATTESTATION_ISSUER_PRIVATE_KEY') ?? Deno.env.get('TREASURY_PRIVATE_KEY')!;

const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr');

interface Body {
    target_user_id: string;
    reason?: string;
    network?: 'devnet' | 'mainnet-beta';
}

function loadIssuer(): Keypair {
    const raw = ISSUER_KEY.trim();
    if (raw.startsWith('[')) return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
    return Keypair.fromSecretKey(bs58.decode(raw));
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) return json({ error: 'Unauthorized' }, 401);

        const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await callerClient.auth.getUser();
        if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: isAdmin } = await admin.rpc('has_role', {
            _user_id: userData.user.id,
            _role: 'admin',
        });
        if (!isAdmin) return json({ error: 'Forbidden' }, 403);

        const body = (await req.json()) as Body;
        if (!body.target_user_id) return json({ error: 'Missing target_user_id' }, 400);

        const { data: profile } = await admin
            .from('user_profiles')
            .select('wallet_address, verification_attestation, verification_attestation_network')
            .eq('user_id', body.target_user_id)
            .maybeSingle();
        if (!profile?.wallet_address) return json({ error: 'Profile not found' }, 404);

        const network = body.network ?? profile.verification_attestation_network ?? 'devnet';
        const rpcUrl =
            network === 'mainnet-beta'
                ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
                : `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

        const connection = new Connection(rpcUrl, 'confirmed');
        const issuer = loadIssuer();

        const memo = `TheLilyPad:v1:attest:revoke:wallet=${profile.wallet_address},prev=${
            profile.verification_attestation ?? 'none'
        },reason=${(body.reason ?? '').slice(0, 64)}`;
        const ix = new TransactionInstruction({
            keys: [{ pubkey: issuer.publicKey, isSigner: true, isWritable: false }],
            programId: MEMO_PROGRAM_ID,
            data: new TextEncoder().encode(memo),
        });

        const tx = new Transaction().add(ix);
        tx.feePayer = issuer.publicKey;
        tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
        const signature = await sendAndConfirmTransaction(connection, tx, [issuer], {
            commitment: 'confirmed',
        });

        await admin
            .from('user_profiles')
            .update({
                is_verified: false,
                verification_attestation: null,
                verification_attestation_network: null,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', body.target_user_id);

        await admin.from('admin_audit_logs').insert({
            admin_id: userData.user.id,
            target_user_id: body.target_user_id,
            action: 'CREATOR_ATTESTATION_REVOKED',
            source: 'revoke_attestation',
            reason: body.reason ?? null,
            metadata: { revoke_signature: signature, prev: profile.verification_attestation, network },
        });

        return json({ signature, network });
    } catch (err) {
        return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
}
