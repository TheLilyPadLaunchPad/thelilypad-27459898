import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Ticket, Trophy, Minus, Plus, Loader2, CheckCircle, ExternalLink } from "lucide-react";
import { getErrorMessage } from "@/lib/errorUtils";
import { useSolanaPayment } from "@/hooks/useSolanaPayment";
import { useMonadPayment } from "@/hooks/useMonadPayment";
import { SupportedChain } from "@/config/chains";
import { getPlatformWallet } from "@/config/treasury";

interface Raffle {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  prize_type: string;
  prize_details: any;
  entry_price: number;
  max_tickets_per_user: number | null;
  total_tickets: number | null;
  required_collection_id: string | null;
  start_date: string;
  end_date: string;
  winner_count: number;
}

interface RaffleEntryModalProps {
  raffle: Raffle;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  currency?: string;
  chain?: SupportedChain;
}

export const RaffleEntryModal: React.FC<RaffleEntryModalProps> = ({
  raffle,
  open,
  onOpenChange,
  onSuccess,
  currency = "SOL",
  chain = "solana"
}) => {
  const [ticketCount, setTicketCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [userEntries, setUserEntries] = useState(0);
  const [success, setSuccess] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const { toast } = useToast();

  const { sendAndVerifyPayment: sendSolanaPayment } = useSolanaPayment();
  const { sendPayment: sendMonadPayment } = useMonadPayment();

  const maxTickets = raffle.max_tickets_per_user || 100;
  const remainingTickets = maxTickets - userEntries;
  const totalCost = ticketCount * raffle.entry_price;

  useEffect(() => {
    if (open) {
      fetchUserEntries();
      setSuccess(false);
      setTicketCount(1);
    }
  }, [open, raffle.id]);

  const fetchUserEntries = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('lily_raffle_entries')
      .select('ticket_count')
      .eq('raffle_id', raffle.id)
      .eq('user_id', user.id);

    const total = (data || []).reduce((sum, entry) => sum + (entry as any).ticket_count, 0);
    setUserEntries(total);
  };

  const handleSubmit = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast({
        title: "Please sign in",
        description: "You need to be signed in to enter raffles",
        variant: "destructive"
      });
      return;
    }

    if (ticketCount > remainingTickets) {
      toast({
        title: "Ticket limit exceeded",
        description: `You can only purchase ${remainingTickets} more tickets`,
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setTxHash(null);

    try {
      let hash = "";

      // 1. Handle Payment if totalCost > 0
      if (totalCost > 0) {
        const treasury = getPlatformWallet('treasury', chain as 'solana' | 'monad');
        
        if (chain === 'solana') {
          const result = await sendSolanaPayment({
            amount: totalCost,
            recipient: treasury,
            transactionType: 'raffleEntry',
            memo: `Raffle entry: ${raffle.name}`
          });
          if (!result.success) throw new Error(result.error || "Solana payment failed");
          hash = result.signature || "";
        } 
        else if (chain === 'monad') {
          const result = await sendMonadPayment(totalCost.toString(), treasury);
          if (!result.success) throw new Error(result.error || "Monad payment failed");
          hash = result.hash || "";
        }
      }

      // 2. Insert Entry into Database
      const { error } = await supabase
        .from('lily_raffle_entries')
        .insert({
          raffle_id: raffle.id,
          user_id: user.id,
          ticket_count: ticketCount,
          total_paid: totalCost,
          tx_hash: hash || null
        } as any);

      if (error) throw error;

      setTxHash(hash);
      setSuccess(true);
      toast({
        title: "Entry successful!",
        description: `You've entered ${ticketCount} ticket${ticketCount > 1 ? 's' : ''} into the raffle`
      });
      onSuccess();
    } catch (error: unknown) {
      toast({
        title: "Entry failed",
        description: getErrorMessage(error),
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <div className="text-center py-8">
            <CheckCircle className="w-16 h-16 text-primary mx-auto mb-4" />
            <h3 className="text-xl font-bold mb-2">You're In!</h3>
            <p className="text-muted-foreground mb-4">
              You've entered {ticketCount} ticket{ticketCount > 1 ? 's' : ''} into "{raffle.name}"
            </p>
            <p className="text-sm text-muted-foreground">
              Good luck! Winners will be announced when the raffle ends.
            </p>
            {txHash && (
              <div className="mt-4 p-2 bg-muted rounded border flex items-center justify-between text-xs">
                <span className="text-muted-foreground font-mono truncate mr-2">TX: {txHash}</span>
                <Button variant="ghost" size="sm" className="h-6 px-2 text-primary" onClick={() => {
                  window.open(chain === 'solana' ? `https://solscan.io/tx/${txHash}?cluster=devnet` : 
                              `https://testnet.explorer.monad.xyz/tx/${txHash}`, '_blank');
                }}>
                  <ExternalLink className="w-3 h-3 mr-1" /> View
                </Button>
              </div>
            )}
            <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ticket className="w-5 h-5 text-primary" />
            Enter Raffle
          </DialogTitle>
          <DialogDescription>
            Purchase tickets for "{raffle.name}"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Raffle Info */}
          <div className="flex gap-4">
            {raffle.image_url && (
              <img
                src={raffle.image_url}
                alt={raffle.name}
                className="w-24 h-24 object-cover rounded-lg"
              />
            )}
            <div className="flex-1">
              <h4 className="font-semibold">{raffle.name}</h4>
              <div className="flex gap-2 mt-2">
                <Badge variant="outline">
                  <Trophy className="w-3 h-3 mr-1" />
                  {raffle.winner_count} Winner{raffle.winner_count > 1 ? 's' : ''}
                </Badge>
                <Badge variant="secondary">
                  {raffle.entry_price > 0 ? `${raffle.entry_price} ${currency}/ticket` : 'Free'}
                </Badge>
              </div>
            </div>
          </div>

          {/* Ticket Selector */}
          <div className="space-y-3">
            <Label>Number of Tickets</Label>
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTicketCount(Math.max(1, ticketCount - 1))}
                disabled={ticketCount <= 1}
              >
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number"
                value={ticketCount}
                onChange={(e) => setTicketCount(Math.max(1, Math.min(remainingTickets, parseInt(e.target.value) || 1)))}
                className="w-24 text-center"
                min={1}
                max={remainingTickets}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => setTicketCount(Math.min(remainingTickets, ticketCount + 1))}
                disabled={ticketCount >= remainingTickets}
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {userEntries > 0 && (
              <p className="text-sm text-muted-foreground">
                You already have {userEntries} ticket{userEntries > 1 ? 's' : ''}.
                {remainingTickets > 0 ? ` You can buy ${remainingTickets} more.` : ' Maximum reached.'}
              </p>
            )}
          </div>

          {/* Cost Summary */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Ticket Price</span>
              <span>{raffle.entry_price > 0 ? `${raffle.entry_price} ${currency}` : 'Free'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Quantity</span>
              <span>×{ticketCount}</span>
            </div>
            <div className="border-t border-border pt-2 flex justify-between font-semibold">
              <span>Total</span>
              <span>{totalCost > 0 ? `${totalCost} ${currency}` : 'Free'}</span>
            </div>
          </div>

          <Button
            className="w-full"
            onClick={handleSubmit}
            disabled={loading || remainingTickets === 0}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                <Ticket className="w-4 h-4 mr-2" />
                {totalCost > 0 ? `Pay ${totalCost} ${currency}` : 'Enter Raffle'}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
