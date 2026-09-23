import { authUrl } from "@/lib/guestEntry";
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSEO } from "@/hooks/useSEO";
import { useDashboardAnalytics } from "@/hooks/useDashboardAnalytics";
import { ClaimFunds } from "@/components/ClaimFunds";
import { WithdrawalHistory } from "@/components/WithdrawalHistory";
import {
    DollarSign,
    ArrowUpRight,
    TrendingUp,
    Wallet,
    ArrowLeft,
    Heart,
    LineChart as LineChartIcon
} from "lucide-react";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from "recharts";
import { formatDistanceToNow } from "date-fns";

export default function Earnings() {
    const navigate = useNavigate();
    const [user, setUser] = useState<any>(null);
    const [totalEarnings, setTotalEarnings] = useState(0);
    const [isLoading, setIsLoading] = useState(true);

    // Use the optimized RPC-based analytics hook
    const { earningsData, recentDonations, isLoading: isAnalyticsLoading } = useDashboardAnalytics(user?.id);

    useSEO({
        title: "Earnings & Payouts | The Lily Pad",
        description: "Manage your earnings, view transaction history, and claim payouts.",
    });

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            if (!session?.user) {
                navigate(authUrl());
            } else {
                fetchTotalEarnings(session.user.id);
            }
        });

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
            if (!session?.user) {
                navigate(authUrl());
            }
        });

        return () => subscription.unsubscribe();
    }, [navigate]);

    const fetchTotalEarnings = async (userId: string) => {
        try {
            const { data } = await supabase
                .from("earnings")
                .select("amount")
                .eq("user_id", userId);

            const total = data?.reduce((sum, e) => sum + Number(e.amount), 0) || 0;
            setTotalEarnings(total);
        } catch (error) {
            console.error("Error fetching total earnings:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat("en-US", {
            style: "currency",
            currency: "USD",
        }).format(amount);
    };

    if (!user) return null;

    return (
        <div className="min-h-screen bg-background">
            <Navbar />

            <main className="container mx-auto px-4 pt-24 pb-12">
                <div className="max-w-6xl mx-auto">
                    {/* Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
                        <div>
                            <Button variant="ghost" onClick={() => navigate("/dashboard")} className="mb-2 -ml-4">
                                <ArrowLeft className="w-4 h-4 mr-2" />
                                Back to Dashboard
                            </Button>
                            <h1 className="text-3xl font-bold flex items-center gap-2">
                                <Wallet className="w-8 h-8 text-primary" />
                                Earnings & Payouts
                            </h1>
                            <p className="text-muted-foreground mt-1">Manage your creator income and withdraw funds</p>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
                        {/* Left Column: Stats & Charts */}
                        <div className="lg:col-span-2 space-y-6">

                            {/* Highlight Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <Card className="glass-card border-border/50 bg-gradient-to-br from-primary/10 to-transparent">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="p-2 rounded-lg bg-primary/20">
                                                <DollarSign className="w-6 h-6 text-primary" />
                                            </div>
                                            <Badge variant="secondary" className="bg-primary/20 text-primary border-primary/30">
                                                Lifetime
                                            </Badge>
                                        </div>
                                        {isLoading ? (
                                            <Skeleton className="h-10 w-32" />
                                        ) : (
                                            <div className="text-4xl font-bold">{formatCurrency(totalEarnings)}</div>
                                        )}
                                        <p className="text-sm text-muted-foreground mt-2">Total Accumulated Earnings</p>
                                    </CardContent>
                                </Card>

                                <Card className="glass-card border-border/50">
                                    <CardContent className="p-6">
                                        <div className="flex items-center justify-between mb-4">
                                            <div className="p-2 rounded-lg bg-green-500/20">
                                                <TrendingUp className="w-6 h-6 text-green-500" />
                                            </div>
                                            <Badge variant="outline" className="text-muted-foreground">
                                                Current Month
                                            </Badge>
                                        </div>
                                        {isAnalyticsLoading ? (
                                            <Skeleton className="h-10 w-32" />
                                        ) : (
                                            <div className="text-4xl font-bold">
                                                {earningsData && earningsData.length > 0
                                                    ? formatCurrency(earningsData[earningsData.length - 1].amount)
                                                    : "$0.00"}
                                            </div>
                                        )}
                                        <p className="text-sm text-muted-foreground mt-2">Earnings this month</p>
                                    </CardContent>
                                </Card>
                            </div>

                            {/* Earnings Chart */}
                            <Card className="glass-card border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <LineChartIcon className="w-5 h-5 text-primary" />
                                        Monthly Breakdown
                                    </CardTitle>
                                    <CardDescription>Your earnings performance across the year</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <div className="h-[300px] w-full mt-4">
                                        {isAnalyticsLoading ? (
                                            <div className="w-full h-full flex flex-col justify-end gap-2 pb-6 px-4">
                                                <div className="flex justify-between h-full items-end">
                                                    {[1, 2, 3, 4, 5, 6].map((i) => (
                                                        <Skeleton key={i} className={`w-12 rounded-t-sm`} style={{ height: `${Math.max(20, Math.random() * 100)}%` }} />
                                                    ))}
                                                </div>
                                            </div>
                                        ) : earningsData && earningsData.length > 0 ? (
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={earningsData}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                                                    <XAxis
                                                        dataKey="date"
                                                        stroke="hsl(var(--muted-foreground))"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        dy={10}
                                                    />
                                                    <YAxis
                                                        stroke="hsl(var(--muted-foreground))"
                                                        fontSize={12}
                                                        tickLine={false}
                                                        axisLine={false}
                                                        tickFormatter={(value) => `$${value}`}
                                                    />
                                                    <Tooltip
                                                        cursor={{ fill: 'hsl(var(--muted))' }}
                                                        contentStyle={{
                                                            backgroundColor: "hsl(var(--card))",
                                                            border: "1px solid hsl(var(--border))",
                                                            borderRadius: "8px",
                                                            boxShadow: "0 4px 12px rgba(0,0,0,0.1)"
                                                        }}
                                                        formatter={(value: number) => [formatCurrency(value), "Earnings"]}
                                                    />
                                                    <Bar
                                                        dataKey="amount"
                                                        fill="hsl(var(--primary))"
                                                        radius={[4, 4, 0, 0]}
                                                        maxBarSize={50}
                                                    />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-muted-foreground flex-col gap-2">
                                                <LineChartIcon className="w-8 h-8 opacity-20" />
                                                <p>No earnings data to display yet</p>
                                            </div>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>

                            {/* Recent Transactions / Donations */}
                            <Card className="glass-card border-border/50">
                                <CardHeader>
                                    <CardTitle className="flex items-center gap-2">
                                        <Heart className="w-5 h-5 text-primary" />
                                        Recent Activity
                                    </CardTitle>
                                    <CardDescription>Latest tips, sales, and token revenue</CardDescription>
                                </CardHeader>
                                <CardContent>
                                    {isAnalyticsLoading ? (
                                        <div className="space-y-4">
                                            {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                                        </div>
                                    ) : recentDonations && recentDonations.length > 0 ? (
                                        <div className="space-y-3">
                                            {recentDonations.map((donation) => (
                                                <div
                                                    key={donation.id}
                                                    className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border/50 hover:bg-muted/80 transition-colors"
                                                >
                                                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/20 to-accent/20 flex flex-shrink-0 items-center justify-center">
                                                        <Heart className="w-5 h-5 text-primary" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h3 className="font-semibold truncate">{donation.from}</h3>
                                                        {donation.message && (
                                                            <p className="text-sm text-muted-foreground truncate">
                                                                "{donation.message}"
                                                            </p>
                                                        )}
                                                    </div>
                                                    <div className="text-right flex-shrink-0">
                                                        <div className="font-bold text-green-500">
                                                            +{formatCurrency(donation.amount)}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">{donation.date}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="text-center py-8 text-muted-foreground border border-dashed border-border rounded-xl">
                                            <Heart className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                            <p>No recent transactions</p>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>

                        </div>

                        {/* Right Column: Actions */}
                        <div className="space-y-6">
                            <ClaimFunds />
                            <WithdrawalHistory />
                        </div>
                    </div>
                </div>
            </main>
        </div>
    );
}
