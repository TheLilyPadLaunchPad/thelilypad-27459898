import { useQuery } from '@tanstack/react-query';
import { getAddressTransactions } from '@/chains/solana/helius';
import { useWallet } from '@/providers/WalletProvider';

/**
 * Hook to fetch and manage Helius parsed transaction history
 */
export const useHeliusTransactions = () => {
    const { address, network, chainType } = useWallet();

    const isSolanaDevnet = chainType === 'solana' && network !== 'mainnet';

    return useQuery({
        queryKey: ['helius-transactions', address, network, chainType],
        queryFn: async () => {
            if (!address || !isSolanaDevnet) return [];
            return await getAddressTransactions(address);
        },
        enabled: !!address && isSolanaDevnet,
        // Refetch on window focus to get latest on-chain activity
        refetchOnWindowFocus: true,
        // Cache for 1 minute
        staleTime: 1000 * 60,
    });
};

/**
 * Hook to parse a specific transaction signature using Helius
 */
export const useParseHeliusTransaction = (signature: string | null) => {
    const { network, chainType } = useWallet();
    const isSolanaDevnet = chainType === 'solana' && network !== 'mainnet';

    return useQuery({
        queryKey: ['helius-parse-tx', signature, network, chainType],
        queryFn: async () => {
            if (!signature || !isSolanaDevnet) return null;
            const { parseTransactions } = await import('@/chains/solana/helius');
            const results = await parseTransactions([signature]);
            return results.length > 0 ? results[0] : null;
        },
        enabled: !!signature && isSolanaDevnet,
        staleTime: 1000 * 60 * 5, // Cache for 5 mins
    });
};
