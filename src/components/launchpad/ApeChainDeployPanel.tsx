import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Rocket, ExternalLink } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { deployApeDrop, normalizeBaseUri, APECHAIN_EXPLORER, APECHAIN_PLATFORM_FEE_BPS } from "@/chains/apechain/drop";

interface Props {
  name: string;
  symbol: string;
  description: string;
  royaltyPercent: number;
  supply: number;
}

export function ApeChainDeployPanel({ name, symbol, description, royaltyPercent, supply }: Props) {
  const navigate = useNavigate();
  const [baseUri, setBaseUri] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [price, setPrice] = useState("1");
  const [maxPerTx, setMaxPerTx] = useState(5);
  const [busy, setBusy] = useState(false);
  const [deployed, setDeployed] = useState<{ address: string; id?: string } | null>(null);

  const deploy = async () => {
    if (!name || !symbol) return toast.error("Add a collection name and symbol in Setup first");
    if (!baseUri.trim()) return toast.error("Paste the link to your uploaded metadata folder");
    setBusy(true);
    const t = toast.loading("Confirm the deployment in your wallet…");
    try {
      const res = await deployApeDrop({
        name, symbol, baseUri, maxSupply: supply, priceApe: price || "0",
        maxPerTx, royaltyBps: Math.round(royaltyPercent * 100),
      });
      setDeployed({ address: res.address });
      toast.loading("Contract live — saving your collection…", { id: t });

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.success("Contract deployed. Sign in to list it on The Lily Pad.", { id: t });
        return;
      }
      const { data, error } = await supabase.from("collections").insert({
        name, symbol, description, creator_id: user.id, creator_address: res.deployer,
        chain: "apechain", contract_address: res.address, status: "live",
        total_supply: supply, royalty_percent: royaltyPercent,
        image_url: coverUrl || null, ipfs_base_cid: normalizeBaseUri(baseUri),
        phases: [{
          id: "public", name: "Public", price: price || "0", maxPerWallet: maxPerTx,
          supply, isActive: true, startTime: null, endTime: null, requiresAllowlist: false,
        }],
      }).select("id").single();
      if (error) throw error;
      setDeployed({ address: res.address, id: data.id });
      toast.success("Your ApeChain collection is live!", { id: t });
    } catch (err: any) {
      toast.error(err?.shortMessage || err?.message || "Deployment failed", { id: t });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="glass-card p-6 border-primary/20">
      <CardHeader className="px-0 pt-0">
        <CardTitle className="text-lg flex items-center gap-2"><Rocket className="w-5 h-5" /> Launch on ApeChain</CardTitle>
        <CardDescription>
          Upload the downloaded <strong>images</strong> and <strong>metadata</strong> folders to IPFS or Arweave, paste the
          metadata folder link, then deploy your own mint contract. Collectors mint straight to their wallets; payments go to
          you minus a {APECHAIN_PLATFORM_FEE_BPS / 100}% platform fee. Gas is paid in APE.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 space-y-4">
        {deployed ? (
          <div className="space-y-3">
            <p className="text-sm">Contract: <code className="break-all">{deployed.address}</code></p>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <a href={`${APECHAIN_EXPLORER}/address/${deployed.address}`} target="_blank" rel="noreferrer" className="gap-2">
                  View on ApeScan <ExternalLink className="w-4 h-4" />
                </a>
              </Button>
              {deployed.id && <Button onClick={() => navigate(`/collection/${deployed.id}`)}>Open mint page</Button>}
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 sm:col-span-2">
                <Label>Metadata folder link</Label>
                <Input placeholder="ipfs://bafy.../ or https://arweave.net/<id>/" value={baseUri} onChange={(e) => setBaseUri(e.target.value)} />
                <p className="text-xs text-muted-foreground">NFT #1 will read <code>{normalizeBaseUri(baseUri || "…")}1.json</code></p>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Cover image link (optional)</Label>
                <Input placeholder="https://…" value={coverUrl} onChange={(e) => setCoverUrl(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Mint price (APE)</Label>
                <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Max per mint</Label>
                <Input type="number" min={1} max={50} value={maxPerTx} onChange={(e) => setMaxPerTx(Math.max(1, Number(e.target.value) || 1))} />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Supply {supply} · Royalty {royaltyPercent}% (capped at 10%)</p>
            <Button onClick={deploy} disabled={busy} className="gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Rocket className="w-4 h-4" />}
              Deploy mint contract
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
