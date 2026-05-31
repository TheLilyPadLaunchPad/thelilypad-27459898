import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Dialog,
    DialogContent
} from "@/components/ui/dialog";
import {
    Loader2,
    CheckCircle2,
    AlertCircle,
    Wallet,
    Send,
    RefreshCw,
    ExternalLink,
    Sparkles
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { MetaplexBadge } from "@/components/MetaplexBadge";

export type MintStep = 'idle' | 'waiting_wallet' | 'submitting' | 'processing' | 'syncing' | 'success' | 'error';

interface MintProcessOverlayProps {
    isOpen: boolean;
    step: MintStep;
    txHash: string | null;
    error: string | null;
    onClose: () => void;
    onViewNFTs: () => void;
    collectionName: string;
    explorerUrl?: string;
}

const steps = [
    { id: 'waiting_wallet', label: 'Wallet Confirmation', icon: Wallet, description: 'Please confirm the transaction in your wallet.' },
    { id: 'submitting', label: 'Submitting', icon: Send, description: 'Sending your transaction to the network...' },
    { id: 'processing', label: 'Processing', icon: RefreshCw, description: 'Waiting for transaction confirmation.' },
    { id: 'syncing', label: 'Finalizing', icon: Sparkles, description: 'Finalizing mint details...' },
];

export function MintProcessOverlay({
    isOpen,
    step,
    txHash,
    error,
    onClose,
    onViewNFTs,
    collectionName,
    explorerUrl = "https://solscan.io"
}: MintProcessOverlayProps) {

    const currentStepIndex = steps.findIndex(s => s.id === step);
    const isComplete = step === 'success';
    const isError = step === 'error';

    const getStepStatus = (index: number) => {
        if (isComplete) return 'complete';
        if (isError) return 'error';
        if (index < currentStepIndex) return 'complete';
        if (index === currentStepIndex) return 'active';
        return 'pending';
    };

    return (
        <Dialog open={isOpen} onOpenChange={(open) => { if (!open && (isComplete || isError)) onClose(); }}>
            <DialogContent className="sm:max-w-[450px] p-0 overflow-hidden border-none bg-transparent shadow-none scale-105">
                <motion.div
                    initial={{ opacity: 0, scale: 0.9, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    className="bg-background/95 backdrop-blur-xl border border-primary/20 rounded-3xl p-8 shadow-2xl relative overflow-hidden"
                >
                    {/* Animated background gradient */}
                    <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-transparent to-accent/10 pointer-events-none" />

                    <div className="relative z-10 space-y-8">
                        {/* Header */}
                        <div className="text-center space-y-2">
                            <h2 className="text-2xl font-bold tracking-tight">
                                {isComplete ? "Mint Successful!" : isError ? "Mint Failed" : "Summoning NFTs..."}
                            </h2>
                            <p className="text-muted-foreground text-sm">
                                {collectionName}
                            </p>
                        </div>

                        {/* Main Visual */}
                        <div className="flex justify-center py-4">
                            <AnimatePresence mode="wait">
                                {isComplete ? (
                                    <motion.div
                                        key="success"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1, rotate: 360 }}
                                        transition={{ type: "spring", stiffness: 260, damping: 20 }}
                                        className="w-24 h-24 bg-green-500/20 rounded-full flex items-center justify-center border-4 border-green-500/50"
                                    >
                                        <CheckCircle2 className="w-12 h-12 text-green-500" />
                                    </motion.div>
                                ) : isError ? (
                                    <motion.div
                                        key="error"
                                        initial={{ scale: 0 }}
                                        animate={{ scale: 1 }}
                                        className="w-24 h-24 bg-destructive/20 rounded-full flex items-center justify-center border-4 border-destructive/50"
                                    >
                                        <AlertCircle className="w-12 h-12 text-destructive" />
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="progress"
                                        className="relative w-32 h-32"
                                    >
                                        <svg className="w-full h-full" viewBox="0 0 100 100">
                                            <circle
                                                className="text-muted/30 stroke-current"
                                                strokeWidth="4"
                                                cx="50"
                                                cy="50"
                                                r="45"
                                                fill="transparent"
                                            ></circle>
                                            <motion.circle
                                                className="text-primary stroke-current"
                                                strokeWidth="4"
                                                strokeLinecap="round"
                                                cx="50"
                                                cy="50"
                                                r="45"
                                                fill="transparent"
                                                initial={{ pathLength: 0 }}
                                                animate={{ pathLength: (currentStepIndex + 1) / steps.length }}
                                                transition={{ duration: 0.5 }}
                                                style={{ rotate: -90, originX: "50%", originY: "50%" }}
                                            ></motion.circle>
                                        </svg>
                                        <div className="absolute inset-0 flex items-center justify-center">
                                            <Loader2 className="w-10 h-10 text-primary animate-spin" />
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Stepper */}
                        {!isComplete && !isError && (
                            <div className="space-y-6">
                                {steps.map((s, i) => {
                                    const status = getStepStatus(i);
                                    const Icon = s.icon;

                                    return (
                                        <motion.div
                                            key={s.id}
                                            initial={false}
                                            animate={{
                                                opacity: status === 'pending' ? 0.4 : 1,
                                                x: status === 'active' ? 10 : 0
                                            }}
                                            className="flex items-start gap-4"
                                        >
                                            <div className={`mt-1 p-2 rounded-lg border-2 flex-shrink-0 transition-colors ${status === 'complete' ? 'bg-primary/20 border-primary text-primary' :
                                                status === 'active' ? 'bg-primary/10 border-primary animate-pulse text-primary' :
                                                    'bg-muted border-muted-foreground/20 text-muted-foreground'
                                                }`}>
                                                {status === 'complete' ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                                            </div>
                                            <div className="space-y-1">
                                                <p className={`text-sm font-semibold transition-colors ${status === 'active' ? 'text-primary' : 'text-foreground'
                                                    }`}>
                                                    {s.label}
                                                </p>
                                                {status === 'active' && (
                                                    <p className="text-xs text-muted-foreground max-w-[280px]">
                                                        {s.description}
                                                    </p>
                                                )}
                                            </div>
                                        </motion.div>
                                    );
                                })}
                            </div>
                        )}

                        {/* Error Message */}
                        {isError && (
                            <div className="bg-destructive/10 border border-destructive/20 p-4 rounded-xl text-center space-y-2">
                                <p className="text-sm font-medium text-destructive">{error || "An unknown error occurred"}</p>
                                <Button variant="ghost" size="sm" onClick={onClose} className="text-destructive hover:bg-destructive/20">
                                    Try Again
                                </Button>
                            </div>
                        )}

                        {/* Footer Actions */}
                        <div className="pt-4 flex flex-col gap-3">
                            {isComplete ? (
                                <Button
                                    onClick={onViewNFTs}
                                    className="w-full bg-primary hover:bg-primary/90 text-primary-foreground h-12 rounded-2xl font-bold text-lg shadow-lg shadow-primary/20"
                                >
                                    <Sparkles className="w-5 h-5 mr-2" />
                                    View Your NFTs
                                </Button>
                            ) : txHash ? (
                                <Button
                                    variant="outline"
                                    onClick={() => window.open(`${explorerUrl}/tx/${txHash}`, "_blank")}
                                    className="w-full rounded-2xl h-12 border-primary/20 hover:bg-primary/5"
                                >
                                    <ExternalLink className="w-4 h-4 mr-2" />
                                    View on Explorer
                                </Button>
                            ) : null}

                            {!isComplete && !isError && (
                                <div className="flex justify-center">
                                    <MetaplexBadge variant="inline" />
                                </div>
                            )}
                        </div>
                    </div>
                </motion.div>
            </DialogContent>
        </Dialog>
    );
}
