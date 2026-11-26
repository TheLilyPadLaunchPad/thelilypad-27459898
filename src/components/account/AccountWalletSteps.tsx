import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAppKitProvider } from '@reown/appkit/react';
import { CheckCircle2, Circle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useWallet } from '@/providers/WalletProvider';
import { useAccountSession } from '@/hooks/useAccountSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { authUrl } from '@/lib/guestEntry';
import { linkWalletToAccount } from '@/lib/walletLink';

const short = (value: string) => (value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value);

function Step({ done, title, children }: { done: boolean; title: string; children?: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      {done ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /> : <Circle className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />}
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-medium">{title}</p>
        {children}
      </div>
    </li>
  );
}

/** Three steps to a saved wallet registration: email account, Reown wallet, link the two. */
export function AccountWalletSteps({ returnTo, onSignInClick }: { returnTo: string; onSignInClick?: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user, loading } = useAccountSession();
  const { address, isConnected, chainType, walletType, connect, getSolanaProvider } = useWallet();
  const { walletProvider: evmProvider } = useAppKitProvider<any>('eip155');
  const { profile } = useUserProfile();
  const [linking, setLinking] = useState(false);

  const walletReady = isConnected && !!address;
  const linked = !!user && walletReady && profile?.user_id === user.id && profile.wallet_address === address;
  const canSign = walletType === 'reown' && chainType !== 'xrpl';

  const link = async () => {
    if (!address) return;
    if (!profile) { navigate('/profile-setup'); return; }
    setLinking(true);
    const chain = chainType === 'solana' ? 'solana' : 'evm';
    try {
      const solana = chainType === 'solana';
      const status = await linkWalletToAccount(supabase, {
        chain: solana ? 'solana' : 'evm', address, provider: solana ? getSolanaProvider() : evmProvider,
      });
      try {
        window.__lovableEvents?.track?.('project.wallet_linked', { chain, result: status === 'claim' ? 'existing_profile_moved' : status });
      } catch { /* Analytics must never block linking. */ }
      if (status === 'no_profile') { navigate('/profile-setup'); return; }
      await queryClient.invalidateQueries({ queryKey: ['user-profile'] });
      await queryClient.invalidateQueries({ queryKey: ['whitelist-eligibility'] });
      toast.success('Wallet linked to your account');
    } catch (e) {
      try { window.__lovableEvents?.track?.('project.wallet_link_failed', { chain }); } catch { /* No error text or address. */ }
      toast.error(e instanceof Error ? e.message : 'Could not link this wallet.');
    } finally {
      setLinking(false);
    }
  };

  return (
    <ol className="space-y-4">
      <Step done={!!user} title={user ? `Signed in as ${user.email}` : 'Sign in with your email'}>
        {!user && <Button className="w-full" disabled={loading} onClick={() => { onSignInClick?.(); navigate(authUrl(returnTo)); }}>Sign in or create account</Button>}
      </Step>
      <Step done={walletReady} title={walletReady ? `Wallet connected: ${short(address!)}` : 'Connect your wallet'}>
        {!walletReady && <Button className="w-full" variant={user ? 'default' : 'outline'} onClick={() => void connect()}>Connect wallet</Button>}
      </Step>
      <Step done={linked} title={linked ? 'Wallet saved to your account' : 'Save this wallet to your account'}>
        {!!user && walletReady && !linked && (canSign || !profile ? (
          <>
            <Button className="w-full" disabled={linking} onClick={() => void link()}>
              {linking ? 'Waiting for your wallet…' : profile ? 'Link wallet' : 'Finish your profile'}
            </Button>
            {profile && <p className="text-xs text-muted-foreground">Your wallet will ask you to sign a free message. It is not a transaction.</p>}
          </>
        ) : <p className="text-xs text-muted-foreground">Linking a saved profile works with Solana and EVM wallets connected through Reown.</p>)}
      </Step>
    </ol>
  );
}
