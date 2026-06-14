/**
 * Issues an on-chain attestation that a wallet is a verified creator on The
 * Lily Pad. Admin-only.
 *
 * v1 implementation uses a signed protocol-memo transaction from the platform
 * issuer wallet (`TREASURY_PRIVATE_KEY`). The tx signature is the canonical
 * attestation identifier and is stored on `user_profiles.verification_attestation`.
 * The memo format is:
 *
 *   TheLilyPad:v1:attest:creator:wallet=<base58>,tier=<n>,issued=<unix>
 *
 * Verifiers can fetch the tx, validate the issuer == platform authority, parse
 * the memo, and trust the claim. This is API-compatible with a future swap to
 * the Solana Attestation Service (SAS) — only the function internals change.
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
    wallet: string;
    tier?: number;
    network?: 'devnet' | 'mainnet-beta';
}

function loadIssuer(): Keypair {
    const raw = ISSUER_KEY.trim();
    // Accept either base58 or JSON array secret format
    try {
        if (raw.startsWith('[')) {
            return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw)));
        }
        return Keypair.fromSecretKey(bs58.decode(raw));
    } catch (e) {
        throw new Error(`Invalid issuer key format: ${(e as Error).message}`);
    }
}

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

    try {
        // Auth: caller must be an admin
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return json({ error: 'Unauthorized' }, 401);
        }
        const callerClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
            global: { headers: { Authorization: authHeader } },
        });
        const { data: userData } = await callerClient.auth.getUser();
        if (!userData?.user) return json({ error: 'Unauthorized' }, 401);

        const admin = createClient(SUPABASE_URL, SERVICE_ROLE);
        const { data: isAdminData } = await admin.rpc('has_role', {
            _user_id: userData.user.id,
            _role: 'admin',
        });
        if (!isAdminData) return json({ error: 'Forbidden' }, 403);

        const body = (await req.json()) as Body;
        if (!body.target_user_id || !body.wallet) {
            return json({ error: 'Missing target_user_id or wallet' }, 400);
        }

        const network = body.network ?? 'devnet';
        const rpcUrl =
            network === 'mainnet-beta'
                ? `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`
                : `https://devnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

        const connection = new Connection(rpcUrl, 'confirmed');
        const issuer = loadIssuer();
        const recipient = new PublicKey(body.wallet); // validates address
        const tier = Math.max(0, Math.min(255, body.tier ?? 1));
        const issued = Math.floor(Date.now() / 1000);

        const memo = `TheLilyPad:v1:attest:creator:wallet=${recipient.toBase58()},tier=${tier},issued=${issued}`;
        const memoIx = new TransactionInstruction({
            keys: [
                { pubkey: issuer.publicKey, isSigner: true, isWritable: false },
                { pubkey: recipient, isSigner: false, isWritable: false },
            ],
            programId: MEMO_PROGRAM_ID,
            data: new TextEncoder().encode(memo),
        });

        const tx = new Transaction().add(memoIx);
        tx.feePayer = issuer.publicKey;
        const { blockhash } = await connection.getLatestBlockhash();
        tx.recentBlockhash = blockhash;

        const signature = await sendAndConfirmTransaction(connection, tx, [issuer], {
            commitment: 'confirmed',
        });

        await admin
            .from('user_profiles')
            .update({
                is_verified: true,
                verification_attestation: signature,
                verification_attestation_network: network,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', body.target_user_id);

        await admin.from('admin_audit_logs').insert({
            admin_id: userData.user.id,
            target_user_id: body.target_user_id,
            action: 'CREATOR_ATTESTED',
            source: 'attest_creator',
            metadata: { signature, network, tier, wallet: body.wallet },
        });

        return json({
            signature,
            network,
            issuer: issuer.publicKey.toBase58(),
            explorer: `https://solscan.io/tx/${signature}${network === 'devnet' ? '?cluster=devnet' : ''}`,
        });
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return json({ error: msg }, 500);
    }
});

function json(payload: unknown, status = 200) {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { ...corsHeaders, 'content-type': 'application/json' },
    });
}
