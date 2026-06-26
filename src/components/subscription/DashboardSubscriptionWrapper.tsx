import { useEffect, useState } from 'react';
import { Text } from '@/src/theme/Text';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import SubscriptionCountdownGate from '@/src/components/subscription/SubscriptionCountdownGate';
import {
  subscriptionChecksBypassForRole,
  subscriptionCountdownVisibleForRole,
  validateSubscriptionAccessForCurrentUser,
} from '@/src/services/subscription';
import { supabase } from '@/src/services/supabaseClient';

type Props = {
  role: string;
  children: React.ReactNode;
  fullWidth?: boolean;
};

export default function DashboardSubscriptionWrapper({ role, children, fullWidth = false }: Props) {
  const [loading, setLoading] = useState(true);
  const [bypassSubscription, setBypassSubscription] = useState(false);
  const [profileRole, setProfileRole] = useState<string | null>(null);
  const [state, setState] = useState<{ expiryDate: string | null; isActive: boolean }>({
    expiryDate: null,
    isActive: false,
  });

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        if (!mounted) return;
        setLoading(false);
        return;
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userData.user.id)
        .maybeSingle();

      if (!mounted) return;

      setProfileRole(profile?.role ?? null);

      if (subscriptionChecksBypassForRole(profile?.role)) {
        setBypassSubscription(true);
        setLoading(false);
        return;
      }

      const { data } = await validateSubscriptionAccessForCurrentUser(userData.user.id);
      if (!mounted) return;

      setState({
        expiryDate: data?.expiry_date ?? null,
        // `can_access` is the source of truth from backend validation.
        isActive: Boolean(data?.can_access),
      });
      setLoading(false);
    };

    void run();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <View style={styles.loaderWrap}>
        <ActivityIndicator size="large" color="#123B7A" />
      </View>
    );
  }

  if (bypassSubscription) {
    return (
      <View style={[styles.container, fullWidth && styles.containerFullWidth, styles.bypassContainer]}>
        <View style={[styles.content, styles.bypassContent]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={[styles.container, fullWidth && styles.containerFullWidth]}>
      <View style={[styles.content, fullWidth && styles.contentFullWidth]}>{children}</View>
      {subscriptionCountdownVisibleForRole(profileRole) ? (
        <SubscriptionCountdownGate
          role={profileRole ?? role}
          expiryDateIso={state.expiryDate}
          isActive={state.isActive}
        />
      ) : null}
      {subscriptionCountdownVisibleForRole(profileRole) && !state.expiryDate ? (
        <Text style={styles.noSubText}>No active subscription found. Please renew your package.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: 520, alignSelf: 'center' },
  containerFullWidth: {
    maxWidth: '100%',
    alignSelf: 'stretch',
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  bypassContainer: { maxWidth: '100%', flex: 1, alignSelf: 'stretch' },
  content: { alignItems: 'center', justifyContent: 'center' },
  contentFullWidth: { alignItems: 'stretch', justifyContent: 'flex-start', width: '100%', flex: 1 },
  bypassContent: { alignItems: 'stretch', justifyContent: 'flex-start', width: '100%', flex: 1 },
  loaderWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noSubText: {
    marginTop: 12,
    textAlign: 'center',
    fontWeight: '700',
    color: '#991B1B',
  },
});
