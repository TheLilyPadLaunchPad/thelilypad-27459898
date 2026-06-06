import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Copy } from "lucide-react";

export function MintL3apTokenCard() {
    const [network, setNetwork] = useState<"devnet" | "mainnet">("devnet");
    const [initialSupply, setInitialSupply] = useState(1_000_000_000);
    const [overwrite, setOverwrite] = useState(false);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<{ mint: string; signature?: string; alreadyMinted?: boolean } | null>(null);

    const handleMint = async () => {
        setLoading(true);
        setResult(null);
        try {
            const { data, error } = await supabase.functions.invoke("mint-l3ap-token", {
                body: { network, initialSupply, overwrite },
            });
            if (error) throw error;
            if (data?.error) throw new Error(data.error);
            setResult(data);
            toast.success(data.alreadyMinted ? "L3AP already minted on this network." : "L3AP token minted! 🎉");
        } catch (e: any) {
            console.error(e);
            toast.error(e.message || "Mint failed");
        } finally {
            setLoading(false);
        }
    };

    const copy = (text: string) => {
        navigator.clipboard.writeText(text);
        toast.success("Copied");
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Mint L3AP Token</CardTitle>
                <CardDescription>
                    One-time mint of the L3AP… vanity SPL token using the stored secret. Idempotent per network.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <Label>Network</Label>
                        <select
                            value={network}
                            onChange={(e) => setNetwork(e.target.value as any)}
                            className="w-full h-10 px-3 border rounded-md bg-background"
                        >
                            <option value="devnet">devnet</option>
                            <option value="mainnet">mainnet</option>
                        </select>
                    </div>
                    <div>
                        <Label>Initial supply</Label>
                        <Input
                            type="number"
                            value={initialSupply}
                            onChange={(e) => setInitialSupply(Number(e.target.value))}
                        />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={overwrite} onCheckedChange={(v) => setOverwrite(!!v)} />
                    Re-mint even if a row already exists (dangerous)
                </label>

                <Button onClick={handleMint} disabled={loading} className="w-full">
                    {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Mint L3AP on {network}
                </Button>

                {result && (
                    <div className="space-y-2 p-3 border rounded-md bg-muted/30 text-sm">
                        <div className="flex items-center justify-between gap-2">
                            <span className="font-mono break-all">{result.mint}</span>
                            <Button size="icon" variant="ghost" onClick={() => copy(result.mint)}>
                                <Copy className="w-4 h-4" />
                            </Button>
                        </div>
                        {result.signature && (
                            <div className="text-xs text-muted-foreground break-all">
                                tx: {result.signature}
                            </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                            Paste the mint into <code>src/config/tokens.ts</code> as the L3AP <code>mintAddress</code>.
                        </p>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
