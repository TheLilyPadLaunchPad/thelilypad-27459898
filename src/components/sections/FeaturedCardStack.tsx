import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CardStack, CardStackItem } from "@/components/ui/card-stack";
import { Skeleton } from "@/components/ui/skeleton";
import { useIsMobile } from "@/hooks/use-mobile";

interface CardStackItemRow {
    id: string;
    title: string;
    description: string | null;
    image_url: string | null;
    href: string | null;
    cta_label: string | null;
    tag: string | null;
    display_order: number;
    is_active: boolean;
}

export const FeaturedCardStack: React.FC = () => {
    const [items, setItems] = useState<CardStackItem[]>([]);
    const [loading, setLoading] = useState(true);
    const isMobile = useIsMobile();

    useEffect(() => {
        fetchActiveCards();
    }, []);

    const fetchActiveCards = async () => {
        try {
            const { data, error } = await supabase
                .from("card_stack_items")
                .select("*")
                .eq("is_active", true)
                .order("display_order", { ascending: true });

            if (error) throw error;

            const cardStackItems: CardStackItem[] = (data || []).map((item: CardStackItemRow) => ({
                id: item.id,
                title: item.title,
                description: item.description || undefined,
                imageSrc: item.image_url || undefined,
                href: item.href || undefined,
                ctaLabel: item.cta_label || undefined,
                tag: item.tag || undefined,
            }));

            setItems(cardStackItems);
        } catch (error) {
            console.error("Error fetching card stack items:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="w-full">
                <Skeleton className="h-[320px] sm:h-[450px] w-full rounded-xl" />
            </div>
        );
    }

    if (items.length === 0) {
        return null;
    }

    return (
        <section className="w-full py-8 md:py-12">
            <div className="container mx-auto px-4">
                <div className="text-center mb-6 md:mb-8">
                    <h2 className="text-2xl md:text-4xl font-bold mb-2 md:mb-4">Featured Collections</h2>
                    <p className="text-sm md:text-base text-muted-foreground max-w-2xl mx-auto">
                        Explore our curated selection of outstanding NFT collections
                    </p>
                </div>
                <CardStack
                    items={items}
                    cardWidth={isMobile ? 300 : 520}
                    cardHeight={isMobile ? 220 : 320}
                    overlap={isMobile ? 0.55 : 0.48}
                    spreadDeg={isMobile ? 30 : 48}
                    maxVisible={isMobile ? 5 : 7}
                    autoAdvance
                    pauseOnHover
                    intervalMs={3500}
                />
            </div>
        </section>
    );
};
