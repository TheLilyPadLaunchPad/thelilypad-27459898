/**
 * Mint the LilyPad Launchpad Agent on Solana devnet.
 *
 * Run: npx tsx scripts/mint-agent.ts
 *
 * Prerequisites:
 *   - PLATFORM_WALLET_PRIVATE_KEY env var set (base58-encoded 64-byte secret key)
 *     OR run `npx tsx scripts/generate-platform-wallet.ts` first and export the key
 *   - Devnet SOL in the wallet for tx fees + Arweave upload (~0.01 SOL)
 */

import 'dotenv/config';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { keypairIdentity } from '@metaplex-foundation/umi';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { mplAgentIdentity } from '@metaplex-foundation/mpl-agent-registry';
// import { irysUploader } from '@metaplex-foundation/umi-uploader-irys';
import { base58 } from '@metaplex-foundation/umi/serializers';

// Agent helpers — import from source using tsx
import {
    buildAgentNftMetadata,
    mintLilyPadAgent,
    verifyAgent,
} from '../src/chains/solana/agent';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const RPC_ENDPOINT = 'https://api.devnet.solana.com';
const NETWORK = 'solana-devnet' as const;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log('\n🐸 LilyPad Agent Minter\n');
    console.log('='.repeat(50));
    console.log(`Network : ${NETWORK}`);
    console.log(`RPC     : ${RPC_ENDPOINT}\n`);

    // 1. Load keypair from env
    const secretKeyEnv = process.env.PLATFORM_WALLET_PRIVATE_KEY;
    if (!secretKeyEnv) {
        console.error('❌ PLATFORM_WALLET_PRIVATE_KEY not set.');
        console.error('   Run: npx tsx scripts/generate-platform-wallet.ts');
        console.error('   Then: set PLATFORM_WALLET_PRIVATE_KEY=<base58 private key>');
        process.exit(1);
    }

    // 2. Create Umi with agent plugin
    const umi = createUmi(RPC_ENDPOINT)
        .use(mplCore())
        .use(mplAgentIdentity())
        // Irys uploader omitted — devnet endpoint unreliable.
        // Metadata will be uploaded inline as a data URI.
        ;

    // Attach the platform keypair as identity
    // Supports JSON array [1,2,3,...], comma-separated numbers, or base58 string
    let secretKeyBytes: Uint8Array;
    const trimmed = secretKeyEnv.trim();
    if (trimmed.startsWith('[')) {
        // JSON array format (solana-keygen or Phantom export)
        secretKeyBytes = Uint8Array.from(JSON.parse(trimmed));
    } else if (trimmed.includes(',')) {
        // Comma-separated numbers
        secretKeyBytes = Uint8Array.from(trimmed.split(',').map(Number));
    } else {
        // Base58-encoded string (e.g. from generate-platform-wallet or Phantom)
        secretKeyBytes = base58.serialize(trimmed);
    }
    const keypair = umi.eddsa.createKeypairFromSecretKey(secretKeyBytes);
    umi.use(keypairIdentity(keypair));

    const walletAddress = keypair.publicKey.toString();
    console.log(`Wallet  : ${walletAddress}`);

    // 3. Check balance
    const balance = await umi.rpc.getBalance(keypair.publicKey);
    const solBalance = Number(balance.basisPoints) / 1e9;
    console.log(`Balance : ${solBalance.toFixed(4)} SOL`);

    if (solBalance < 0.005) {
        console.error('\n❌ Insufficient balance. Need at least 0.005 SOL on devnet.');
        console.error('   Run: solana airdrop 1 ' + walletAddress + ' --url devnet');
        process.exit(1);
    }

    // 4. Build metadata URI
    // The on-chain uri field has a strict length limit. Use a short placeholder for devnet.
    // On mainnet, upload proper metadata to Arweave and use that URI.
    console.log('\n📦 Building agent NFT metadata...');
    const nftMetadata = buildAgentNftMetadata();
    console.log('   Metadata:', JSON.stringify(nftMetadata).slice(0, 80) + '...');
    // Short placeholder URI for devnet (on-chain field has ~200 char limit)
    const metadataUri = 'https://thelilypad.app/agent-metadata.json';
    console.log(`   URI: ${metadataUri}`);

    // 5. Mint the agent
    console.log('\n🪙  Minting LilyPad Agent...');
    const result = await mintLilyPadAgent(umi, {
        network: NETWORK,
        metadataUri,
    });

    console.log('\n✅ Agent minted successfully!');
    console.log(`   Asset Address : ${result.assetAddress}`);
    console.log(`   Signature     : ${Buffer.from(result.signature).toString('base64').slice(0, 32)}...`);

    // 6. Verify (non-fatal — account may take a few seconds to propagate on devnet)
    console.log('\n🔍 Verifying agent registration...');
    await new Promise(resolve => setTimeout(resolve, 8000));
    try {
        const verification = await verifyAgent(umi, result.assetAddress);
        if (verification.registered) {
            console.log('   ✅ Agent Identity PDA registered!');
            console.log(`   Registration URI : ${verification.registrationUri}`);
            console.log(`   Transfer hook    : ${JSON.stringify(verification.transferHook)}`);
            console.log(`   Update hook      : ${JSON.stringify(verification.updateHook)}`);
        } else {
            console.warn('   ⚠️  Agent identity not yet visible. Transaction may still be confirming.');
        }
    } catch (verifyErr) {
        console.warn('   ⚠️  Verification skipped — account not yet propagated on devnet.');
        console.warn('   The mint was successful. Verify manually in a few seconds.');
    }

    // 7. Output config snippet
    console.log('\n' + '='.repeat(50));
    console.log('\n📝 Add this to src/config/agent.ts:\n');
    console.log(`export const LILYPAD_AGENT_ADDRESS = '${result.assetAddress}';`);
    console.log(`export const LILYPAD_AGENT_METADATA_URI = '${metadataUri}';`);
    console.log(`export const LILYPAD_AGENT_NETWORK = '${NETWORK}';`);
    console.log('\n' + '='.repeat(50));
}

main().catch((err) => {
    console.error('\n❌ Minting failed:', err);
    process.exit(1);
});
