import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

/** The signed-in email account (guest sessions do not count). */
export function useAccountSession() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const apply = (next: User | null | undefined) => {
      if (!active) return;
      setUser(next && !next.is_anonymous ? next : null);
      setLoading(false);
    };
    // Subscribe first; the callback only stores state, so it cannot deadlock the session lock.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => apply(session?.user));
    supabase.auth.getSession().then(({ data }) => apply(data.session?.user)).catch(() => apply(null));
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  return { user, loading, signedIn: !!user };
}
