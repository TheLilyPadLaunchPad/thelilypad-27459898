import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Layers, Sparkles, TrendingUp } from "lucide-react";
import FrogLoader from "@/components/FrogLoader";

interface Stats {
    totalCollections: number;
    liveNow: number;
    nftsMinted: number;
    totalVolume: number;
    totalUsers: number;
}

export function SystemStatsCards() {
    const [stats, setStats] = useState<Stats | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const [platform, users] = await Promise.all([
                    supabase.rpc("get_platform_stats" as any),
                    supabase.from("user_profiles").select("id", { count: "exact", head: true }),
                ]);
                if (cancelled) return;
                const p = (platform.data as any) ?? {};
                setStats({
                    totalCollections: p.totalCollections ?? 0,
                    liveNow: p.liveNow ?? 0,
                    nftsMinted: p.nftsMinted ?? 0,
                    totalVolume: Number(p.totalVolume ?? 0),
                    totalUsers: users.count ?? 0,
                });
            } catch (e) {
                console.error("[admin] failed to load platform stats", e);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, []);

    if (loading) {
        return (
            <div className="flex justify-center py-8">
                <FrogLoader size="sm" />
            </div>
        );
    }

    if (!stats) {
        return (
            <p className="text-center text-muted-foreground py-8">
                Unable to load platform stats.
            </p>
        );
    }

    const items = [
        { label: "Total Users", value: stats.totalUsers.toLocaleString(), icon: Users },
        { label: "Collections", value: stats.totalCollections.toLocaleString(), icon: Layers },
        { label: "NFTs Minted", value: stats.nftsMinted.toLocaleString(), icon: Sparkles },
        { label: "Total Volume", value: `${stats.totalVolume.toFixed(2)}`, icon: TrendingUp },
    ];

    return (
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {items.map(({ label, value, icon: Icon }) => (
                <Card key={label}>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
                        <Icon className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{value}</div>
                    </CardContent>
                </Card>
            ))}
        </div>
    );
}
