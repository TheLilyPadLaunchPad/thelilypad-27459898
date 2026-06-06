import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { Keypair, Connection, clusterApiUrl } from 'npm:@solana/web3.js@1.95.3';
import bs58 from 'npm:bs58@5.0.0';
import { createUmi } from 'npm:@metaplex-foundation/umi-bundle-defaults@0.9.2';
import {
  createSignerFromKeypair,
  signerIdentity,
  percentAmount,
  keypairIdentity,
} from 'npm:@metaplex-foundation/umi@0.9.2';
import {
  createFungible,
  mintV1,
  TokenStandard,
  mplTokenMetadata,
} from 'npm:@metaplex-foundation/mpl-token-metadata@3.2.1';

type Network = 'devnet' | 'mainnet';

function endpoint(network: Network) {
  if (network === 'mainnet') {
    const helius = Deno.env.get('HELIUS_API_KEY');
    return helius
      ? `https://mainnet.helius-rpc.com/?api-key=${helius}`
      : clusterApiUrl('mainnet-beta');
  }
  const helius = Deno.env.get('HELIUS_API_KEY');
  return helius
    ? `https://devnet.helius-rpc.com/?api-key=${helius}`
    : clusterApiUrl('devnet');
}

function decodeSecret(raw: string): Uint8Array {
  const trimmed = raw.trim();
  if (trimmed.startsWith('[')) {
    return new Uint8Array(JSON.parse(trimmed));
  }
  return bs58.decode(trimmed);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const userId = claimsData.claims.sub as string;

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: isAdmin, error: roleErr } = await admin.rpc('has_role', {
      _user_id: userId,
      _role: 'admin',
    });
    if (roleErr || !isAdmin) {
      return new Response(JSON.stringify({ error: 'Admin role required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const network: Network = body.network === 'mainnet' ? 'mainnet' : 'devnet';
    const initialSupply: number = Number.isFinite(body.initialSupply)
      ? Number(body.initialSupply)
      : 1_000_000_000;
    const overwrite: boolean = !!body.overwrite;

    // Idempotency
    if (!overwrite) {
      const { data: existing } = await admin
        .from('platform_tokens')
        .select('mint_address, signature, network')
        .eq('symbol', 'L3AP')
        .eq('network', network)
        .maybeSingle();
      if (existing?.mint_address) {
        return new Response(
          JSON.stringify({ ok: true, alreadyMinted: true, ...existing }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    const l3apSecretRaw = Deno.env.get('L3AP_MINT_SECRET_KEY');
    const treasurySecretRaw = Deno.env.get('DEVNET_TREASURY_PRIVATE_KEY');
    if (!l3apSecretRaw) throw new Error('L3AP_MINT_SECRET_KEY not set');
    if (!treasurySecretRaw) throw new Error('DEVNET_TREASURY_PRIVATE_KEY not set');

    const l3apKp = Keypair.fromSecretKey(decodeSecret(l3apSecretRaw));
    const treasuryKp = Keypair.fromSecretKey(decodeSecret(treasurySecretRaw));

    const addr = l3apKp.publicKey.toBase58();
    if (!addr.startsWith('L3AP')) {
      throw new Error(`L3AP secret derives ${addr}, expected L3AP… prefix`);
    }

    const umi = createUmi(endpoint(network)).use(mplTokenMetadata());
    const treasuryUmiKp = umi.eddsa.createKeypairFromSecretKey(treasuryKp.secretKey);
    umi.use(keypairIdentity(treasuryUmiKp));
    const mintUmiKp = umi.eddsa.createKeypairFromSecretKey(l3apKp.secretKey);
    const mintSigner = createSignerFromKeypair(umi, mintUmiKp);

    const createTx = await createFungible(umi, {
      mint: mintSigner,
      name: 'The Lily Pad Token',
      symbol: 'L3AP',
      uri: '',
      decimals: 6,
      sellerFeeBasisPoints: percentAmount(0),
    }).sendAndConfirm(umi);

    let signature = bs58.encode(createTx.signature);

    if (initialSupply > 0) {
      const mintTx = await mintV1(umi, {
        mint: mintSigner.publicKey,
        amount: BigInt(Math.floor(initialSupply * 1_000_000)),
        tokenOwner: umi.identity.publicKey,
        tokenStandard: TokenStandard.Fungible,
      }).sendAndConfirm(umi);
      signature = bs58.encode(mintTx.signature);
    }

    await admin.from('platform_tokens').upsert({
      symbol: 'L3AP',
      network,
      name: 'The Lily Pad Token',
      mint_address: addr,
      decimals: 6,
      signature,
    });

    return new Response(
      JSON.stringify({ ok: true, mint: addr, signature, network, initialSupply }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    console.error('mint-l3ap-token error', err);
    return new Response(
      JSON.stringify({ error: err?.message || String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
