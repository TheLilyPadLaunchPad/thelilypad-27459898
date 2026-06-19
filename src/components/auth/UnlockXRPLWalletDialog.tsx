import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
    listSavedWallets,
    getEncryptedWallet,
    decryptSeed,
    removeEncryptedWallet,
    setActiveSigner,
    walletFromSeed,
} from "@/lib/xrplGeneratedWallet";
import { useWallet } from "@/providers/WalletProvider";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
}

export default function UnlockXRPLWalletDialog({ open, onOpenChange }: Props) {
    const { connectXRPLNonCustodial } = useWallet();
    const saved = useMemo(() => listSavedWallets(), [open]);
    const [selected, setSelected] = useState<string | null>(saved[0]?.address ?? null);
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);

    const meta = saved.find(s => s.address === selected);

    const handleUnlock = async () => {
        if (!selected || !meta) return;
        const payload = getEncryptedWallet(selected);
        if (!payload) {
            toast.error("Wallet not found on this device");
            return;
        }
        setBusy(true);
        try {
            const seed = await decryptSeed(payload, password);
            setActiveSigner(walletFromSeed(seed));
            await connectXRPLNonCustodial("generated" as any, selected, meta.network);
            setPassword("");
            onOpenChange(false);
        } catch {
            toast.error("Wrong password or corrupted wallet");
        } finally {
            setBusy(false);
        }
    };

    const handleRemove = (addr: string) => {
        removeEncryptedWallet(addr);
        toast.success("Removed from this device");
        if (selected === addr) setSelected(null);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Lock className="w-5 h-5" /> Unlock saved wallet
                    </DialogTitle>
                    <DialogDescription>
                        Decrypt a wallet stored on this device with your password.
                    </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                    {saved.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">
                            No saved wallets on this device.
                        </p>
                    ) : (
                        <>
                            <div className="space-y-2">
                                {saved.map(w => (
                                    <button
                                        key={w.address}
                                        type="button"
                                        onClick={() => setSelected(w.address)}
                                        className={`w-full flex items-center justify-between gap-2 rounded-md border p-3 text-left text-sm transition-colors ${selected === w.address ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="font-mono text-xs truncate">{w.address}</div>
                                            <div className="text-xs text-muted-foreground">{w.network}</div>
                                        </div>
                                        <Trash2
                                            className="w-4 h-4 text-muted-foreground hover:text-destructive shrink-0"
                                            onClick={(e) => { e.stopPropagation(); handleRemove(w.address); }}
                                        />
                                    </button>
                                ))}
                            </div>
                            <Input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="Password"
                                maxLength={256}
                            />
                            <Button className="w-full" onClick={handleUnlock} disabled={busy || !selected || !password}>
                                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Unlock"}
                            </Button>
                        </>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
