import { useEffect, useState } from 'react';

import { supabase } from '@/src/services/supabaseClient';

/**
 * `null` while the first session read is in flight; then whether a user is signed in.
 */
export function useHasAuthSession(): boolean | null {
  const [hasSession, setHasSession] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (alive) setHasSession(Boolean(data.session));
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => {
      alive = false;
      subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}
