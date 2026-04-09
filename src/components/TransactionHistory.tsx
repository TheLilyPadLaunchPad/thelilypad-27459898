import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, Clock, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { useWallet } from "@/providers/WalletProvider";

interface Transaction {
  id: string;
  tx_hash: string;
  tx_type: string;
  quantity: number;
  price_paid: number;
  status: string;
  created_at: string;
  confirmed_at: string | null;
  collection: {
    name: string;
    image_url: string | null;
  } | null;
}

interface TransactionHistoryProps {
  userId?: string;
  collectionId?: string;
  limit?: number;
}

export function TransactionHistory({ userId, collectionId, limit = 10 }: TransactionHistoryProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { chainType } = useWallet();
  const chainSymbol = chainType === 'monad' ? 'MON' : 'SOL';

  useEffect(() => {
    const fetchTransactions = async () => {
      setIsLoading(true);
      let query = supabase
        .from("nft_transactions")
        .select(`
          id,
          tx_hash,
          tx_type,
          quantity,
          price_paid,
          status,
          created_at,
          confirmed_at,
          collection:collections(name, image_url)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (userId) {
        query = query.eq("user_id", userId);
      }
      if (collectionId) {
        query = query.eq("collection_id", collectionId);
      }

      const { data, error } = await query;

      if (!error && data) {
        setTransactions(data as unknown as Transaction[]);
      }
      setIsLoading(false);
    };

    fetchTransactions();
  }, [userId, collectionId, limit]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "confirmed":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "pending":
        return <Loader2 className="h-4 w-4 text-yellow-500 animate-spin" />;
      case "failed":
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      confirmed: "default",
      pending: "secondary",
      failed: "destructive",
    };
    return (
      <Badge variant={variants[status] || "outline"} className="capitalize">
        {status}
      </Badge>
    );
  };

  const formatTxHash = (hash: string) => {
    return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
  };

  const explorerUrl = (hash: string) => {
    return `https://explorer.solana.com/tx/${hash}`;
  };

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-8">
            No transactions yet
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Transaction History</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {transactions.map((tx) => (
          <div
            key={tx.id}
            className="flex items-center justify-between p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
          >
            <div className="flex items-center gap-3">
              {tx.collection?.image_url ? (
                <img
                  src={tx.collection.image_url}
                  alt={tx.collection.name}
                  className="h-10 w-10 rounded-md object-cover"
                />
              ) : (
                <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center">
                  <span className="text-xs font-medium text-primary">NFT</span>
                </div>
              )}
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium capitalize">{tx.tx_type}</span>
                  {getStatusIcon(tx.status)}
                </div>
                <div className="text-sm text-muted-foreground">
                  {tx.collection?.name || "Unknown Collection"} · {tx.quantity} NFT{tx.quantity > 1 ? "s" : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <div className="font-medium">
                  {tx.price_paid > 0 ? `${tx.price_paid} ${chainSymbol}` : "Free"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {!isNaN(new Date(tx.created_at).getTime()) ? formatDistanceToNow(new Date(tx.created_at), { addSuffix: true }) : "Unknown"}
                </div>
              </div>
              {getStatusBadge(tx.status)}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => window.open(explorerUrl(tx.tx_hash), "_blank")}
              >
                <ExternalLink className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
