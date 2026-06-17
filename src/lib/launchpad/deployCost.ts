/**
 * Launchpad deploy cost estimator + creator pre-payment helper.
 *
 * Mirrors the Metaplex Core Candy Machine standard where the wallet that
 * signs `createCandyMachine` pays rent. Because our edge function signs with
 * a platform treasury keypair, we instead have the creator pre-pay an
 * equivalent SOL amount (rent + platform fee) to the treasury BEFORE the
 * deploy, tagged with an SPL memo, then verify it server-side.
 */
import {
    Connection,
    PublicKey,
    Transaction,
    SystemProgram,
    LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { PLATFORM_WALLETS } from "@/config/treasury";
import { createProtocolMemoInstruction } from "@/lib/solanaProtocol";
import { getSolanaRpcUrl } from "@/config/solana";

/** Platform deploy fee in basis points (15%). */
export const PLATFORM_DEPLOY_FEE_BPS = 1500;

/** Approximate rent costs (SOL) — derived from mpl-core-candy-machine. */
const RENT_COLLECTION_SOL = 0.003;
const RENT_CM_HIDDEN_SOL = 0.012;
const RENT_CM_CONFIGLINES_PER_ITEM_SOL = 0.0028;
const RENT_CANDY_GUARD_SOL = 0.0023;
const TX_FEE_INSERT_BATCH_SOL = 0.00001; // batches of 10
const SAFETY_BUFFER_SOL = 0.002;

export interface DeployCostBreakdown {
    collectionRentSol: number;
    candyMachineRentSol: number;
    candyGuardRentSol: number;
    insertTxFeesSol: number;
    bufferSol: number;
    rentSubtotalSol: number;
    platformFeeSol: number;
    totalSol: number;
    lamports: bigint;
}

export interface EstimateInput {
    itemsAvailable: number;
    /** true → hiddenSettings CM (single-account), false → configLines CM (per-item rent). */
    hiddenSettings: boolean;
    /** Skip CM entirely (e.g. 1-of-1 collection). */
    collectionOnly?: boolean;
}

export function estimateDeployCost(input: EstimateInput): DeployCostBreakdown {
    const collectionRentSol = RENT_COLLECTION_SOL;

    let candyMachineRentSol = 0;
    let candyGuardRentSol = 0;
    let insertTxFeesSol = 0;
    if (!input.collectionOnly && input.itemsAvailable > 0) {
        candyMachineRentSol = input.hiddenSettings
            ? RENT_CM_HIDDEN_SOL
            : RENT_CM_HIDDEN_SOL + input.itemsAvailable * RENT_CM_CONFIGLINES_PER_ITEM_SOL;
        candyGuardRentSol = RENT_CANDY_GUARD_SOL;
        if (!input.hiddenSettings) {
            const batches = Math.ceil(input.itemsAvailable / 10);
            insertTxFeesSol = batches * TX_FEE_INSERT_BATCH_SOL;
        }
    }

    const rentSubtotalSol =
        collectionRentSol +
        candyMachineRentSol +
        candyGuardRentSol +
        insertTxFeesSol +
        SAFETY_BUFFER_SOL;
    const platformFeeSol = (rentSubtotalSol * PLATFORM_DEPLOY_FEE_BPS) / 10000;
    const totalSol = rentSubtotalSol + platformFeeSol;
    const lamports = BigInt(Math.ceil(totalSol * LAMPORTS_PER_SOL));

    return {
        collectionRentSol,
        candyMachineRentSol,
        candyGuardRentSol,
        insertTxFeesSol,
        bufferSol: SAFETY_BUFFER_SOL,
        rentSubtotalSol,
        platformFeeSol,
        totalSol,
        lamports,
    };
}

export interface SendDeployPaymentParams {
    provider: any; // WalletProvider native solana provider
    network: "mainnet" | "devnet" | "testnet";
    lamports: bigint;
    collectionId: string;
    /** Optional fallback wallet address (base58) when provider.publicKey is missing. */
    senderAddress?: string;
}

export interface SendDeployPaymentResult {
    signature: string;
    recipient: string;
    lamports: string;
}

/**
 * Sends a single SOL transfer + protocol memo `TheLilyPad:v1:launchpad:deploy_collection`
 * from the connected wallet to the platform treasury. Returns the confirmed signature
 * so the edge function can verify it before performing the deploy.
 */
export async function sendDeployPayment({
    provider,
    network,
    lamports,
    collectionId,
    senderAddress,
}: SendDeployPaymentParams): Promise<SendDeployPaymentResult> {
    if (lamports <= 0n) throw new Error("Invalid deploy cost");
    if (!provider || typeof provider.signTransaction !== "function") {
        throw new Error("Wallet signer unavailable. Please reconnect your Solana wallet and try again.");
    }

    // Normalize publicKey — Reown/WalletConnect providers may expose it as a
    // base58 string. Fall back to the address from WalletProvider when not present.
    let sender: PublicKey;
    try {
        const raw = provider.publicKey;
        if (raw instanceof PublicKey) sender = raw;
        else if (typeof raw === "string") sender = new PublicKey(raw);
        else if (raw && typeof raw.toBase58 === "function") sender = new PublicKey(raw.toBase58());
        else if (senderAddress) sender = new PublicKey(senderAddress);
        else throw new Error("missing publicKey");
    } catch {
        throw new Error("Wallet not connected. Please reconnect your Solana wallet and try again.");
    }

    const rpcUrl = getSolanaRpcUrl(network);
    const connection = new Connection(rpcUrl, "confirmed");
    const recipient = new PublicKey(PLATFORM_WALLETS.solana.treasury);


    const balance = await connection.getBalance(sender);
    if (BigInt(balance) < lamports + 5000n) {
        throw new Error(
            `Insufficient SOL for deploy. Need ~${(Number(lamports) / LAMPORTS_PER_SOL).toFixed(4)} SOL, have ${(balance / LAMPORTS_PER_SOL).toFixed(4)} SOL.`,
        );
    }

    const tx = new Transaction();
    tx.add(
        SystemProgram.transfer({
            fromPubkey: sender,
            toPubkey: recipient,
            lamports: Number(lamports),
        }),
    );
    tx.add(
        createProtocolMemoInstruction("launchpad:deploy_collection", {
            cid: collectionId.slice(0, 16),
        }),
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
    tx.recentBlockhash = blockhash;
    tx.feePayer = sender;

    const signed = await provider.signTransaction(tx);
    const signature = await connection.sendRawTransaction(signed.serialize(), {
        skipPreflight: false,
        preflightCommitment: "confirmed",
    });
    const conf = await connection.confirmTransaction(
        { signature, blockhash, lastValidBlockHeight },
        "confirmed",
    );
    if (conf.value.err) throw new Error("Deploy pre-payment failed on-chain");

    return {
        signature,
        recipient: recipient.toBase58(),
        lamports: lamports.toString(),
    };
}
