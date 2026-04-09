import React from "react";
import { motion } from "framer-motion";
import { FolderOpen, Layers, Sparkles, Zap, Leaf } from "lucide-react";

interface ModeSelectorProps {
    mode: "basic" | "advanced";
    onModeChange: (mode: "basic" | "advanced") => void;
}

export function ModeSelector({ mode, onModeChange }: ModeSelectorProps) {
    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="text-center space-y-1">
                <div className="flex justify-center mb-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center shadow-md">
                        <Leaf className="w-5 h-5 text-primary-foreground" />
                    </div>
                </div>
                <h2 className="text-lg font-bold gradient-text">Choose Your Launch Mode</h2>
                <p className="text-muted-foreground text-xs">Select how you want to create your collection</p>
            </div>

            <div className="grid grid-cols-2 gap-3">
                {/* Basic Mode Card */}
                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onModeChange("basic")}
                    className={`relative p-4 rounded-xl text-left transition-all ${mode === "basic"
                        ? "bg-gradient-to-br from-primary/15 to-accent/5 border-2 border-primary shadow-sm"
                        : "glass-card border border-border hover:border-primary/40"
                        }`}
                >
                    {mode === "basic" && (
                        <motion.div
                            layoutId="mode-indicator"
                            className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium"
                        >
                            ✓
                        </motion.div>
                    )}

                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-2 rounded-lg ${mode === "basic" ? "bg-primary/20" : "bg-muted"}`}>
                            <FolderOpen className={`w-4 h-4 ${mode === "basic" ? "text-primary" : "text-foreground"}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Basic</h3>
                            <p className="text-[10px] text-muted-foreground">Quick & Easy</p>
                        </div>
                    </div>

                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                        <li className="flex items-center gap-1.5">
                            <Zap className="w-3 h-3 text-primary" />
                            <span>Upload pre-made assets</span>
                        </li>
                    </ul>
                </motion.button>

                {/* Advanced Mode Card */}
                <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => onModeChange("advanced")}
                    className={`relative p-4 rounded-xl text-left transition-all ${mode === "advanced"
                        ? "bg-gradient-to-br from-accent/15 to-primary/5 border-2 border-accent shadow-sm"
                        : "glass-card border border-border hover:border-accent/40"
                        }`}
                >
                    {mode === "advanced" && (
                        <motion.div
                            layoutId="mode-indicator"
                            className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-medium"
                        >
                            ✓
                        </motion.div>
                    )}

                    <div className="flex items-center gap-2 mb-3">
                        <div className={`p-2 rounded-lg ${mode === "advanced" ? "bg-accent/20" : "bg-muted"}`}>
                            <Layers className={`w-4 h-4 ${mode === "advanced" ? "text-accent" : "text-foreground"}`} />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-foreground">Advanced</h3>
                            <p className="text-[10px] text-muted-foreground">Full Control</p>
                        </div>
                    </div>

                    <ul className="space-y-1.5 text-xs text-muted-foreground">
                        <li className="flex items-center gap-1.5">
                            <Sparkles className="w-3 h-3 text-accent" />
                            <span>Import trait layers</span>
                        </li>
                    </ul>
                </motion.button>

            </div>

            <p className="text-center text-[10px] text-muted-foreground">
                Everything is configured for your selected chain
            </p>
        </div>
    );
}
