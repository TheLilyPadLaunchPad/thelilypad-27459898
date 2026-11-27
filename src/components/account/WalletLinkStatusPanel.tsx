import { AlertCircle, CheckCircle2, Loader2, Wallet } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useWallet } from '@/providers/WalletProvider';
import { useAccountSession } from '@/hooks/useAccountSession';
import { useUserProfile } from '@/hooks/useUserProfile';
import { resolveWalletLinkState, WALLET_LINK_COPY } from '@/lib/walletLinkStatus';
import { AccountWalletSteps } from './AccountWalletSteps';

const short = (value: string) => (value.length > 12 ? `${value.slice(0, 4)}…${value.slice(-4)}` : value);

/** Shows whether the member's wallet is connected and saved to their account, and what to do next. */
export function WalletLinkStatusPanel({ returnTo, className = '' }: { returnTo: string; className?: string }) {
  const { user, loading: sessionLoading } = useAccountSession();
  const { address, isConnected, chainType, walletType } = useWallet();
  const { profile, loading: profileLoading } = useUserProfile();

  const walletAddress = isConnected && address ? address : null;
  const state = resolveWalletLinkState({
    checking: sessionLoading || (!!walletAddress && profileLoading),
    accountId: user?.id ?? null,
    walletAddress,
    profile: profile ? { user_id: (profile as any).user_id ?? null, wallet_address: profile.wallet_address ?? null } : null,
    canSign: walletType === 'reown' && chainType !== 'xrpl',
  });
  const copy = WALLET_LINK_COPY[state];
  const linked = state === 'linked';
  const Icon = state === 'checking' ? Loader2 : linked ? CheckCircle2 : AlertCircle;

  return (
    <section aria-label="Wallet link status" className={`rounded-lg border border-border bg-card p-5 space-y-4 ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Wallet className="h-5 w-5 text-primary" />Wallet link</h2>
        <Badge variant={linked ? 'default' : 'secondary'} data-testid="wallet-link-state">{copy.label}</Badge>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Wallet</dt>
        <dd className="font-medium">{walletAddress ? `Connected: ${short(walletAddress)}` : 'Not connected'}</dd>
        <dt className="text-muted-foreground">Account</dt>
        <dd className="truncate font-medium">{user ? user.email : sessionLoading ? 'Checking…' : 'Not signed in'}</dd>
      </dl>
      <p role="status" className="flex gap-2 text-sm">
        <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${linked ? 'text-primary' : 'text-muted-foreground'} ${state === 'checking' ? 'animate-spin' : ''}`} />
        <span><span className="font-medium">Next step: </span>{copy.nextStep}</span>
      </p>
      {!linked && state !== 'checking' && <AccountWalletSteps returnTo={returnTo} />}
    </section>
  );
}
