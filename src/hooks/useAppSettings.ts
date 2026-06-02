import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useAppSettings() {
  const [isMockMode, setIsMockMode] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("is_mock_mode_enabled")
          .eq("id", "global")
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Error fetching app settings:", error);
        } else if (data) {
          setIsMockMode(!!data.is_mock_mode_enabled);
        }
      } catch (err) {
        console.error("Failed to fetch settings:", err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();

    // Subscribe to changes
    const channel = supabase
      .channel("app_settings_changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "app_settings",
          filter: "id=eq.global",
        },
        (payload) => {
          setIsMockMode(!!payload.new.is_mock_mode_enabled);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  return { isMockMode, isLoading };
}
