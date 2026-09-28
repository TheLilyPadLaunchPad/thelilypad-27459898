import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useLinkedWallets } from '@/hooks/useLinkedWallets';
import { Link2, Plus, Trash2, Star, Loader2, Wallet } from 'lucide-react';
import { toast } from 'sonner';
import { getActiveChains, SupportedChain } from '@/config/chains';
import { ChainIcon } from '@/components/launchpad/ChainSelector';

export function LinkedWalletsManager() {
  const { wallets, loading, linkWallet, unlinkWallet, setPrimary } = useLinkedWallets();
  const [showAdd, setShowAdd] = useState(false);
  const [newAddress, setNewAddress] = useState('');
  const [newChain, setNewChain] = useState('solana');
  const [newLabel, setNewLabel] = useState('');
  const [adding, setAdding] = useState(false);

  const activeChains = getActiveChains();

  const handleAdd = async () => {
    if (!newAddress.trim()) {
      toast.error('Enter a wallet address');
      return;
    }
    setAdding(true);
    try {
      await linkWallet(newAddress.trim(), newChain, newLabel.trim() || undefined);
      setNewAddress('');
      setNewLabel('');
      setShowAdd(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to link wallet');
    } finally {
      setAdding(false);
    }
  };

  const chainIcon = (chain: string) => (
    <ChainIcon chain={chain as SupportedChain} className="h-4 w-4" />
  );

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-primary" />
          Linked Wallets
        </CardTitle>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAdd(!showAdd)}
          className="gap-1"
        >
          <Plus className="h-4 w-4" />
          Add Wallet
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {showAdd && (
          <div className="p-4 rounded-lg border border-border/50 bg-muted/30 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Chain</Label>
                <Select value={newChain} onValueChange={setNewChain}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {activeChains.map(chain => (
                      <SelectItem key={chain.id} value={chain.id}>
                        {chain.name} ({chain.symbol})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Label (optional)</Label>
                <Input
                  value={newLabel}
                  onChange={e => setNewLabel(e.target.value)}
                  placeholder="e.g. Main, Burner..."
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Wallet Address</Label>
              <Input
                value={newAddress}
                onChange={e => setNewAddress(e.target.value)}
                placeholder="Enter wallet address..."
                className="font-mono text-sm"
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>Cancel</Button>
              <Button size="sm" onClick={handleAdd} disabled={adding} className="gap-1">
                {adding && <Loader2 className="h-3 w-3 animate-spin" />}
                Link Wallet
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : wallets.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground">
            <Wallet className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No linked wallets yet. Add wallets to showcase your cross-chain NFTs.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {wallets.map(wallet => (
              <div
                key={wallet.id}
                className="flex items-center gap-3 p-3 rounded-lg bg-muted/30 border border-border/50"
              >
                <Badge variant="outline" className="text-xs shrink-0">
                  {chainIcon(wallet.chain)}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-mono truncate">
                    {wallet.wallet_address}
                  </p>
                  {wallet.label && (
                    <p className="text-xs text-muted-foreground">{wallet.label}</p>
                  )}
                </div>
                {wallet.is_primary && (
                  <Badge className="bg-primary/20 text-primary border-primary/30 text-xs">
                    Primary
                  </Badge>
                )}
                <div className="flex gap-1 shrink-0">
                  {!wallet.is_primary && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setPrimary(wallet.id)}
                      title="Set as primary"
                    >
                      <Star className="h-3.5 w-3.5" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => unlinkWallet(wallet.id)}
                    title="Remove wallet"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
