import React from "react";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
    Coins,
    Tags,
    ShieldCheck,
    Snowflake,
    ArrowLeftRight,
    Flame,
    Lock,
    Ban,
    UserCog,
    PenTool,
} from "lucide-react";
import { CORE_PLUGINS, CorePluginId, CollectionPluginsConfig } from "@/config/launchpad/corePlugins";

const ICONS: Record<CorePluginId, React.ComponentType<{ className?: string }>> = {
    Royalties: Coins,
    Attributes: Tags,
    VerifiedCreators: ShieldCheck,
    PermanentFreezeDelegate: Snowflake,
    PermanentTransferDelegate: ArrowLeftRight,
    PermanentBurnDelegate: Flame,
    ImmutableMetadata: Lock,
    AddBlocker: Ban,
    UpdateDelegate: UserCog,
    Autograph: PenTool,
};

interface Props {
    value: CollectionPluginsConfig;
    onChange: (next: CollectionPluginsConfig) => void;
    royaltyPercent: number;
    onRoyaltyChange: (next: number) => void;
}

export const CollectionPluginsPanel: React.FC<Props> = ({
    value,
    onChange,
    royaltyPercent,
    onRoyaltyChange,
}) => {
    const toggle = (id: CorePluginId, enabled: boolean) => {
        const next = { ...value.plugins, [id]: { ...(value.plugins[id] || {}), enabled } };
        onChange({ plugins: next });
    };

    const grouped = CORE_PLUGINS.reduce<Record<string, typeof CORE_PLUGINS>>((acc, p) => {
        (acc[p.category] ||= []).push(p);
        return acc;
    }, {});

    return (
        <div className="space-y-5">
            <div>
                <Label className="text-muted-foreground uppercase text-xs font-bold tracking-wider">
                    Collection Plugins
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                    Metaplex Core plugins applied to your collection on-chain.
                </p>
            </div>

            {Object.entries(grouped).map(([category, plugins]) => (
                <div key={category} className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 font-bold">
                        {category}
                    </p>
                    {plugins.map((p) => {
                        const Icon = ICONS[p.id];
                        const enabled = !!value.plugins[p.id]?.enabled;
                        const isRoyalties = p.id === "Royalties";
                        return (
                            <div
                                key={p.id}
                                className="flex items-start justify-between gap-3 p-3 rounded-xl bg-secondary/20 border border-white/5 hover:border-primary/20 transition-all"
                            >
                                <div className="flex items-start gap-3 min-w-0 flex-1">
                                    <div className="p-2 rounded-full bg-primary/10 text-primary shrink-0">
                                        <Icon className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-medium text-sm">{p.label}</p>
                                            {p.enabledByDefault && (
                                                <Badge variant="outline" className="text-[9px] py-0 px-1.5">
                                                    Recommended
                                                </Badge>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground mt-0.5">
                                            {p.description}
                                        </p>
                                        {isRoyalties && enabled && (
                                            <div className="mt-2 flex items-center gap-2">
                                                <Label className="text-[10px]">Royalty %</Label>
                                                <Input
                                                    type="number"
                                                    min={0}
                                                    max={50}
                                                    step={0.5}
                                                    value={royaltyPercent}
                                                    onChange={(e) =>
                                                        onRoyaltyChange(Number(e.target.value))
                                                    }
                                                    className="h-7 w-24 text-xs bg-background/50"
                                                />
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <Switch
                                    checked={enabled}
                                    onCheckedChange={(v) => toggle(p.id, v)}
                                />
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};

export default CollectionPluginsPanel;
