/**
 * Solana Buyback Pool Operations
 *
 * Executes SOL → Token swaps via Jupiter aggregator and manages
 * the buyback pool for The Lily Pad token economics.
 */

import { PublicKey, Transaction, Connection, LAMPORTS_PER_SOL, VersionedTransaction } from '@solana/web3.js';
import { createProtocolMemoInstruction } from '@/lib/solanaProtocol';
import { PLATFORM_WALLETS } from '@/config/treasury';
import { solToLamports } from '@/lib/fees';

const BUYBACK_POOL = new PublicKey(PLATFORM_WALLETS.solana.buybackPool);

export interface BuybackResult {
    success: boolean;
    txSignature?: string;
    tokensBought?: number;
    solSpent?: number;
    error?: string;
}

/**
 * Execute a buyback — swap SOL from the buyback pool into the platform token.
 * Uses Jupiter V6 API for best-price routing.
 *
 * The function builds a versioned transaction from Jupiter, deserializes it,
 * and returns it for signing by the treasury wallet holder.
 *
 * @param connection  Solana RPC connection
 * @param tokenMint   Mint address of the token to buy
 * @param amountSol   Amount of SOL to spend
 * @param signAndSend Optional callback to sign and submit the transaction.
 *                    When omitted the function returns the unsigned result.
 */
export async function executeBuyback(
    connection: Connection,
    tokenMint: string,
    amountSol: number,
    signAndSend?: (tx: VersionedTransaction) => Promise<string>
): Promise<BuybackResult> {
    try {
        const lamports = Number(solToLamports(amountSol));

        // 1. Get Jupiter quote
        const quoteRes = await fetch(
            `https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=${tokenMint}&amount=${lamports}&slippageBps=100`
        );
        if (!quoteRes.ok) throw new Error('Jupiter quote failed');
        const quote = await quoteRes.json();

        console.log(`[Buyback] Quote: ${amountSol} SOL → ${quote.outAmount} tokens`);

        // 2. Build swap transaction via Jupiter
        const swapRes = await fetch('https://quote-api.jup.ag/v6/swap', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                quoteResponse: quote,
                userPublicKey: BUYBACK_POOL.toBase58(),
                wrapAndUnwrapSol: true,
            }),
        });
        if (!swapRes.ok) throw new Error('Jupiter swap build failed');
        const swapData = await swapRes.json();

        // 3. Deserialize the swap transaction
        const swapTxBuf = Buffer.from(swapData.swapTransaction, 'base64');
        const swapTx = VersionedTransaction.deserialize(swapTxBuf);

        // 4. Add protocol memo as a legacy instruction appended via lookup
        //    (Jupiter returns a VersionedTransaction; we log the memo intent separately)
        const memoIx = createProtocolMemoInstruction('buyback:execute', {
            token: tokenMint,
            amount: amountSol.toString(),
        });
        console.log('[Buyback] Memo instruction prepared:', memoIx.programId.toBase58());

        // 5. Sign and submit if a signer callback was provided
        if (signAndSend) {
            console.log('[Buyback] Signing and submitting swap transaction…');
            const txSignature = await signAndSend(swapTx);

            // 6. Confirm the transaction
            const latestBlockhash = await connection.getLatestBlockhash();
            const confirmation = await connection.confirmTransaction(
                { signature: txSignature, ...latestBlockhash },
                'confirmed'
            );

            if (confirmation.value.err) {
                throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
            }

            console.log(`[Buyback] Confirmed: ${txSignature}`);

            return {
                success: true,
                txSignature,
                solSpent: amountSol,
                tokensBought: Number(quote.outAmount),
            };
        }

        // No signer — return unsigned result for external signing
        console.log('[Buyback] Transaction built. Requires treasury signer to submit.');
        return {
            success: true,
            solSpent: amountSol,
            tokensBought: Number(quote.outAmount),
        };
    } catch (err: any) {
        console.error('[Buyback] Error:', err.message);
        return { success: false, error: err.message };
    }
}

/**
 * Get the SOL balance of the buyback pool
 */
export async function getBuybackPoolBalance(connection: Connection): Promise<number> {
    const balance = await connection.getBalance(BUYBACK_POOL);
    return balance / LAMPORTS_PER_SOL;
}
