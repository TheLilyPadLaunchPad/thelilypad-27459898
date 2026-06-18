import { useState, useCallback } from 'react';
import { useWallet } from '@/providers/WalletProvider';
import { toast } from 'sonner';
import { ethers } from 'ethers';

export function useMonadPayment() {
    const [isProcessing, setIsProcessing] = useState(false);

    const sendPayment = useCallback(async (amount: string, destination: string) => {
        setIsProcessing(true);
        try {
            // Use Reown AppKit for EVM provider
            const { useAppKitProvider } = await import('@reown/appkit/react');
            const { walletProvider } = useAppKitProvider('eip155');
            
            if (!walletProvider) {
                toast.error("Wallet provider not found");
                return { success: false };
            }

            const provider = new ethers.BrowserProvider(walletProvider as any);
            const signer = await provider.getSigner();

            const tx = await signer.sendTransaction({
                to: destination,
                value: ethers.parseEther(amount)
            });

            toast.loading("Monad transaction pending...", { id: "monad-tx" });
            const receipt = await tx.wait();
            toast.dismiss("monad-tx");

            if (receipt?.status === 1) {
                toast.success("Monad payment successful!");
                return { success: true, hash: tx.hash };
            } else {
                toast.error("Monad payment failed");
                return { success: false, error: "Transaction failed" };
            }
        } catch (error: any) {
            console.error("Monad Payment error:", error);
            toast.error(error.message || "Monad payment failed");
            return { success: false, error: error.message };
        } finally {
            setIsProcessing(false);
        }
    }, []);

    return {
        sendPayment,
        isProcessing
    };
}
