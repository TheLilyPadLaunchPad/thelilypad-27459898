import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { verifyCoreCollection } from "@/lib/launchpad/verifyDeploy";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";

interface CollectionRow {
    id: string;
    name: string;
    chain: string | null;
    status: string;
    contract_address: string | null;
    collection_mint_address: string | null;
    candy_machine_address: string | null;
}

const STATUS_OPTIONS = ["draft", "pending", "live", "deploy_failed", "closed", "archived"];

export function CollectionRepairPanel() {
    const [query, setQuery] = useState("");
    const [loading, setLoading] = useState(false);
    const [row, setRow] = useState<CollectionRow | null>(null);
    const [verifyState, setVerifyState] = useState<"idle" | "checking" | "ok" | "missing">("idle");
    const [verifyMsg, setVerifyMsg] = useState<string>("");
    const [contractInput, setContractInput] = useState("");
    const [statusInput, setStatusInput] = useState<string>("draft");
    const [network, setNetwork] = useState<"mainnet" | "devnet">("mainnet");

    const search = async () => {
        if (!query.trim()) return;
        setLoading(true);
        setRow(null);
        setVerifyState("idle");
        try {
            // Try by id, then by contract_address / collection_mint_address
            const q = query.trim();
            const { data, error } = await supabase
                .from("collections")
                .select("id,name,chain,status,contract_address,collection_mint_address,candy_machine_address")
                .or(`id.eq.${q},contract_address.eq.${q},collection_mint_address.eq.${q},candy_machine_address.eq.${q}`)
                .limit(1)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                toast.error("No collection found for that ID/address.");
                return;
            }
            setRow(data as CollectionRow);
            setContractInput(data.contract_address ?? "");
            setStatusInput(data.status ?? "draft");
        } catch (e: any) {
            toast.error(e.message || "Lookup failed");
        } finally {
            setLoading(false);
        }
    };

    const verify = async () => {
        if (!row) return;
        const addr = row.contract_address || row.collection_mint_address;
        if (!addr) {
            setVerifyState("missing");
            setVerifyMsg("No on-chain address stored.");
            return;
        }
        setVerifyState("checking");
        setVerifyMsg("");
        try {
            const res = await verifyCoreCollection(addr, network, { attempts: 3, delayMs: 1500 });
            if (res.exists) {
                setVerifyState("ok");
                setVerifyMsg(`Found on ${network} after ${res.attempts} attempt(s).`);
            } else {
                setVerifyState("missing");
                setVerifyMsg(res.error || "Not found on-chain.");
            }
        } catch (e: any) {
            setVerifyState("missing");
            setVerifyMsg(e.message || "Verification failed");
        }
    };

    const save = async () => {
        if (!row) return;
        setLoading(true);
        try {
            const updates: Record<string, any> = { status: statusInput };
            // Allow clearing or updating the on-chain address
            updates.contract_address = contractInput.trim() || null;
            const { error } = await supabase.from("collections").update(updates).eq("id", row.id);
            if (error) throw error;
            toast.success("Collection updated.");
            await search();
        } catch (e: any) {
            toast.error(e.message || "Update failed");
        } finally {
            setLoading(false);
        }
    };

    const clearAllAddresses = async () => {
        if (!row) return;
        if (!confirm("Clear contract, collection_mint, and candy_machine addresses for this collection? This cannot be undone.")) return;
        setLoading(true);
        try {
            const { error } = await supabase.from("collections").update({
                contract_address: null,
                collection_mint_address: null,
                candy_machine_address: null,
                candy_guard_address: null,
                status: "deploy_failed",
            } as any).eq("id", row.id);
            if (error) throw error;
            toast.success("Addresses cleared. Status set to deploy_failed.");
            await search();
        } catch (e: any) {
            toast.error(e.message || "Clear failed");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Collection Address Repair</CardTitle>
                <CardDescription>
                    Look up a collection by ID or on-chain address, verify the Core Collection account exists,
                    and clear or replace bad addresses left behind by a partial deploy.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="flex gap-2">
                    <Input
                        placeholder="Collection ID, contract address, or mint address"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && search()}
                    />
                    <Button onClick={search} disabled={loading}>
                        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Look up"}
                    </Button>
                </div>

                {row && (
                    <div className="space-y-4 rounded-md border p-4">
                        <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div>
                                <p className="font-semibold">{row.name}</p>
                                <p className="text-xs text-muted-foreground font-mono">{row.id}</p>
                            </div>
                            <div className="flex gap-2">
                                <Badge variant="outline">{row.chain || "solana"}</Badge>
                                <Badge>{row.status}</Badge>
                            </div>
                        </div>

                        <div className="grid gap-2 text-xs">
                            <div>
                                <span className="text-muted-foreground">contract_address: </span>
                                <span className="font-mono break-all">{row.contract_address || "—"}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">collection_mint_address: </span>
                                <span className="font-mono break-all">{row.collection_mint_address || "—"}</span>
                            </div>
                            <div>
                                <span className="text-muted-foreground">candy_machine_address: </span>
                                <span className="font-mono break-all">{row.candy_machine_address || "—"}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-2 flex-wrap">
                            <Select value={network} onValueChange={(v) => setNetwork(v as any)}>
                                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="mainnet">mainnet</SelectItem>
                                    <SelectItem value="devnet">devnet</SelectItem>
                                </SelectContent>
                            </Select>
                            <Button variant="outline" onClick={verify} disabled={verifyState === "checking"}>
                                {verifyState === "checking"
                                    ? <Loader2 className="h-4 w-4 animate-spin" />
                                    : <RefreshCw className="h-4 w-4 mr-2" />}
                                Verify on-chain
                            </Button>
                            {verifyState === "ok" && (
                                <span className="text-sm text-green-600 flex items-center gap-1">
                                    <CheckCircle2 className="h-4 w-4" /> {verifyMsg}
                                </span>
                            )}
                            {verifyState === "missing" && (
                                <span className="text-sm text-destructive flex items-center gap-1">
                                    <XCircle className="h-4 w-4" /> {verifyMsg}
                                </span>
                            )}
                        </div>

                        <div className="grid gap-3 pt-2 border-t">
                            <div>
                                <Label>contract_address (leave blank to clear)</Label>
                                <Input
                                    value={contractInput}
                                    onChange={(e) => setContractInput(e.target.value)}
                                    placeholder="On-chain Core Collection address"
                                />
                            </div>
                            <div>
                                <Label>status</Label>
                                <Select value={statusInput} onValueChange={setStatusInput}>
                                    <SelectTrigger><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        {STATUS_OPTIONS.map((s) => (
                                            <SelectItem key={s} value={s}>{s}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div className="flex gap-2 flex-wrap">
                                <Button onClick={save} disabled={loading}>Save changes</Button>
                                <Button variant="destructive" onClick={clearAllAddresses} disabled={loading}>
                                    Clear all addresses
                                </Button>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
