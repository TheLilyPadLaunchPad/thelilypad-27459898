import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Copy, Download, Loader2, Check, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
    generateXRPLWallet,
    encryptSeed,
    saveEncryptedWallet,
    downloadSeedBackup,
    fundFromTestnetFaucet,
    setActiveSigner,
    walletFromSeed,
    type GeneratedXRPLWallet,
} from "@/lib/xrplGeneratedWallet";
import { useWallet } from "@/providers/WalletProvider";

interface Props {
    open: boolean;
    onOpenChange: (v: boolean) => void;
    defaultNetwork?: "mainnet" | "testnet";
}

type Step = "warn" | "backup" | "cache" | "done";

export default function CreateXRPLWalletDialog({ open, onOpenChange, defaultNetwork = "mainnet" }: Props) {
    const { connectXRPLNonCustodial } = useWallet();
    const [step, setStep] = useState<Step>("warn");
    const [wallet, setWallet] = useState<GeneratedXRPLWallet | null>(null);
    const [network, setNetwork] = useState<"mainnet" | "testnet">(defaultNetwork);
    const [showSeed, setShowSeed] = useState(false);
    const [backedUp, setBackedUp] = useState(false);
    const [password, setPassword] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [busy, setBusy] = useState(false);
    const [faucetMsg, setFaucetMsg] = useState<string | null>(null);

    const reset = () => {
        setStep("warn");
        setWallet(null);
        setShowSeed(false);
        setBackedUp(false);
        setPassword("");
        setConfirmPw("");
        setBusy(false);
        setFaucetMsg(null);
    };

    const handleClose = (v: boolean) => {
        if (!v) reset();
        onOpenChange(v);
    };

    const handleGenerate = () => {
        const w = generateXRPLWallet();
        setWallet(w);
        setStep("backup");
    };

    const copy = async (text: string, label: string) => {
        try {
            await navigator.clipboard.writeText(text);
            toast.success(`${label} copied`);
        } catch {
            toast.error("Copy failed");
        }
    };

    const finishSignIn = async (w: GeneratedXRPLWallet) => {
        setActiveSigner(walletFromSeed(w.seed));
        await connectXRPLNonCustodial("generated" as any, w.address, network);
    };

    const handleSkipCache = async () => {
        if (!wallet) return;
        setBusy(true);
        try {
            if (network === "testnet") {
                setFaucetMsg("Requesting testnet XRP from faucet...");
                const r = await fundFromTestnetFaucet(wallet.address);
                setFaucetMsg(r.ok ? `Funded with ${r.balanceXrp ?? "?"} XRP` : `Faucet: ${r.error}`);
            }
            await finishSignIn(wallet);
            setStep("done");
            setTimeout(() => handleClose(false), 1500);
        } catch (e: any) {
            toast.error(e?.message || "Sign-in failed");
        } finally {
            setBusy(false);
        }
    };

    const handleSaveCache = async () => {
        if (!wallet) return;
        if (password.length < 10) {
            toast.error("Password must be at least 10 characters");
            return;
        }
        if (password !== confirmPw) {
            toast.error("Passwords do not match");
            return;
        }
        setBusy(true);
        try {
            const enc = await encryptSeed(wallet.seed, password);
            saveEncryptedWallet(wallet.address, network, enc);
            toast.success("Encrypted wallet saved on this device");
            if (network === "testnet") {
                setFaucetMsg("Requesting testnet XRP from faucet...");
                const r = await fundFromTestnetFaucet(wallet.address);
                setFaucetMsg(r.ok ? `Funded with ${r.balanceXrp ?? "?"} XRP` : `Faucet: ${r.error}`);
            }
            await finishSignIn(wallet);
            setStep("done");
            setTimeout(() => handleClose(false), 1500);
        } catch (e: any) {
            toast.error(e?.message || "Failed to save");
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={handleClose}>
            <DialogContent className="sm:max-w-lg">
                {step === "warn" && (
                    <>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <Sparkles className="w-5 h-5" /> Create a new XRPL wallet
                            </DialogTitle>
                            <DialogDescription>
                                A brand-new account will be generated in your browser. The seed never leaves this device.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-300 flex gap-2">
                                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-semibold mb-1">Your seed is your wallet.</p>
                                    <p>Lose it = lose access. There is no password reset and no support recovery. Back it up safely before continuing.</p>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Network</label>
                                <div className="flex gap-2">
                                    <Button type="button" variant={network === "mainnet" ? "default" : "outline"} className="flex-1" onClick={() => setNetwork("mainnet")}>Mainnet</Button>
                                    <Button type="button" variant={network === "testnet" ? "default" : "outline"} className="flex-1" onClick={() => setNetwork("testnet")}>Testnet</Button>
                                </div>
                                <p className="text-xs text-muted-foreground">
                                    {network === "testnet"
                                        ? "We'll auto-fund the new account from the XRPL testnet faucet."
                                        : "Mainnet accounts require ~10 XRP reserve. Send XRP from an exchange after creation."}
                                </p>
                            </div>
                            <Button className="w-full" onClick={handleGenerate}>
                                Generate Wallet
                            </Button>
                        </div>
                    </>
                )}

                {step === "backup" && wallet && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Back up your wallet</DialogTitle>
                            <DialogDescription>
                                This is the only time the seed will be shown. Save it before continuing.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">XRPL Address</label>
                                <div className="flex gap-2">
                                    <Input readOnly value={wallet.address} className="font-mono text-xs" />
                                    <Button type="button" variant="outline" size="icon" onClick={() => copy(wallet.address, "Address")}>
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-xs font-medium text-muted-foreground">Master Seed (secret)</label>
                                <div className="flex gap-2">
                                    <Input
                                        readOnly
                                        type={showSeed ? "text" : "password"}
                                        value={wallet.seed}
                                        className="font-mono text-xs"
                                    />
                                    <Button type="button" variant="outline" onClick={() => setShowSeed(s => !s)}>
                                        {showSeed ? "Hide" : "Show"}
                                    </Button>
                                    <Button type="button" variant="outline" size="icon" onClick={() => copy(wallet.seed, "Seed")}>
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                className="w-full"
                                onClick={() => downloadSeedBackup(wallet.address, wallet.seed, network)}
                            >
                                <Download className="w-4 h-4 mr-2" />
                                Download backup file
                            </Button>
                            <label className="flex items-start gap-2 text-sm cursor-pointer select-none">
                                <Checkbox checked={backedUp} onCheckedChange={(v) => setBackedUp(!!v)} className="mt-0.5" />
                                <span>I have saved my seed in a safe place. I understand it cannot be recovered.</span>
                            </label>
                            <Button className="w-full" disabled={!backedUp} onClick={() => setStep("cache")}>
                                Continue
                            </Button>
                        </div>
                    </>
                )}

                {step === "cache" && wallet && (
                    <>
                        <DialogHeader>
                            <DialogTitle>Quick re-sign-in (optional)</DialogTitle>
                            <DialogDescription>
                                Encrypt the seed with a password and store it on this device, or skip for zero local storage.
                            </DialogDescription>
                        </DialogHeader>
                        <div className="space-y-4 py-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Password (min 10 chars)</label>
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Strong password"
                                    maxLength={256}
                                />
                                <Input
                                    type="password"
                                    value={confirmPw}
                                    onChange={(e) => setConfirmPw(e.target.value)}
                                    placeholder="Confirm password"
                                    maxLength={256}
                                />
                                <p className="text-xs text-muted-foreground">
                                    AES-GCM with 250,000 PBKDF2 iterations. Encrypted locally only — never uploaded.
                                </p>
                            </div>
                            {faucetMsg && (
                                <p className="text-xs text-muted-foreground text-center">{faucetMsg}</p>
                            )}
                            <div className="flex gap-2">
                                <Button variant="outline" className="flex-1" onClick={handleSkipCache} disabled={busy}>
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Skip"}
                                </Button>
                                <Button className="flex-1" onClick={handleSaveCache} disabled={busy || password.length < 10 || password !== confirmPw}>
                                    {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Save & Continue"}
                                </Button>
                            </div>
                        </div>
                    </>
                )}

                {step === "done" && (
                    <div className="py-10 text-center space-y-3">
                        <div className="mx-auto w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center">
                            <Check className="w-6 h-6 text-emerald-500" />
                        </div>
                        <p className="font-semibold">Wallet ready</p>
                        {faucetMsg && <p className="text-xs text-muted-foreground">{faucetMsg}</p>}
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
