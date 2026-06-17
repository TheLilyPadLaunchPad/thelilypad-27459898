import {
    createPublicClient,
    createWalletClient,
    custom,
    http,
    parseEther,
    type Address,
} from 'viem';
import { monadTestnet } from 'viem/chains';
import { MonadCollectionParams, MonadDeployResult } from './types';
import { MONAD_ERC721_ABI } from './abi/ERC721';
import { MONAD_FACTORY_ABI } from './abi/Factory';
import { MONAD_NETWORKS, DEFAULT_MONAD_NETWORK, MONAD_CONTRACTS } from '@/config/monad';

/**
 * Deploy ERC-721A collection on Monad via Factory contract.
 */
export async function deployMonadCollection(
    params: MonadCollectionParams
): Promise<MonadDeployResult> {
    console.log("[Monad] Deploying ERC-721A collection:", params.name);

    const factoryAddress = MONAD_CONTRACTS[DEFAULT_MONAD_NETWORK].nftFactory;

    if (!factoryAddress) {
        return {
            success: false,
            error: "Monad NFT factory contract not deployed yet on this network. Please try another chain.",
        };
    }

    if (typeof window === 'undefined' || !window.ethereum) {
        return {
            success: false,
            error: "No EVM wallet detected. Please install a wallet and enable Monad support.",
        };
    }

    try {
        const walletClient = createWalletClient({
            chain: monadTestnet,
            transport: custom(window.ethereum),
        });

        const [account] = await walletClient.getAddresses();

        const hash = await walletClient.writeContract({
            account,
            chain: monadTestnet,
            address: factoryAddress as Address,
            abi: MONAD_FACTORY_ABI,
            functionName: 'createCollection',
            args: [
                params.name,
                params.symbol,
                params.metadataBaseUri || '',
                BigInt(params.totalSupply),
                parseEther(params.mintPrice || '0'),
                BigInt(params.royaltyBasisPoints || 500),
                account,
            ],
        });

        return {
            success: true,
            address: factoryAddress,
            transactionHash: hash,
        };
    } catch (err: any) {
        console.error("[Monad] Factory deployment failed:", err);
        return {
            success: false,
            error: err?.shortMessage || err?.message || "Monad deployment failed",
        };
    }
}

/**
 * Mint NFTs from a deployed Monad collection
 */
export async function mintMonadNFT(
    contractAddress: string,
    quantity: number = 1,
    mintPrice: string = "0"
): Promise<MonadDeployResult> {
    console.log(`[Monad] Minting ${quantity} NFTs from ${contractAddress}`);

    if (typeof window === 'undefined' || !window.ethereum) {
        return {
            success: false,
            error: "No EVM wallet detected. Please install a wallet and enable Monad support.",
        };
    }

    if (!contractAddress?.startsWith('0x') || contractAddress.length !== 42 || contractAddress.includes('...')) {
        return {
            success: false,
            error: `Invalid Monad contract address: ${contractAddress}. This collection may not have been deployed on-chain.`,
        };
    }

    try {
        const publicClient = createPublicClient({
            chain: monadTestnet,
            transport: http(MONAD_NETWORKS[DEFAULT_MONAD_NETWORK].url),
        });

        const walletClient = createWalletClient({
            chain: monadTestnet,
            transport: custom(window.ethereum),
        });

        const [account] = await walletClient.getAddresses();

        const { request } = await publicClient.simulateContract({
            account,
            address: contractAddress as `0x${string}`,
            abi: MONAD_ERC721_ABI,
            functionName: 'batchMint',
            args: [account, BigInt(quantity)],
            value: parseEther(mintPrice) * BigInt(quantity),
        });

        const hash = await walletClient.writeContract(request);

        return {
            success: true,
            address: contractAddress,
            transactionHash: hash,
        };
    } catch (err: any) {
        console.error("[Monad] Mint failed:", err);
        return {
            success: false,
            error: err?.shortMessage || err?.message || "Monad mint failed",
        };
    }
}

/**
 * Read collection info from a deployed contract
 */
export async function getMonadCollectionInfo(contractAddress: Address) {
    const publicClient = createPublicClient({
        chain: monadTestnet,
        transport: http(MONAD_NETWORKS[DEFAULT_MONAD_NETWORK].url),
    });

    const [name, symbol, totalSupply, maxSupply, price] = await Promise.all([
        publicClient.readContract({ address: contractAddress, abi: MONAD_ERC721_ABI, functionName: 'name' } as any),
        publicClient.readContract({ address: contractAddress, abi: MONAD_ERC721_ABI, functionName: 'symbol' } as any),
        publicClient.readContract({ address: contractAddress, abi: MONAD_ERC721_ABI, functionName: 'totalSupply' } as any),
        publicClient.readContract({ address: contractAddress, abi: MONAD_ERC721_ABI, functionName: 'maxSupply' } as any),
        publicClient.readContract({ address: contractAddress, abi: MONAD_ERC721_ABI, functionName: 'mintPrice' } as any),
    ]);

    return { name, symbol, totalSupply, maxSupply, mintPrice: price };
}
