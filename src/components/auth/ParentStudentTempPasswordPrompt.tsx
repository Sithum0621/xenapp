import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, type AppStateStatus, StyleSheet, View } from 'react-native';

import ChangePasswordModal from '@/src/components/auth/ChangePasswordModal';
import TempPasswordBanner from '@/src/components/auth/TempPasswordBanner';
import { fetchTempPasswordStatus, type TempPasswordStatus } from '@/src/services/tempPasswordApi';
import { roleUsesTempPassword } from '@/src/utils/tempPasswordPolicy';
import { supabase } from '@/src/services/supabaseClient';

type Props = {
  marginBottom?: number;
  marginHorizontal?: number;
};

/**
 * Temporary-password banner for parent/student accounts only.
 * Teachers and admins self-manage credentials and never see this prompt.
 */
export default function ParentStudentTempPasswordPrompt({
  marginBottom = 12,
  marginHorizontal = 0,
}: Props) {
  const { t } = useTranslation();
  const [eligible, setEligible] = useState(false);
  const [tempStatus, setTempStatus] = useState<TempPasswordStatus | null>(null);
  const [changePwOpen, setChangePwOpen] = useState(false);
  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle();
      if (!cancelled) {
        setEligible(roleUsesTempPassword(profile?.role));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!eligible) return null;
    const status = await fetchTempPasswordStatus();
    setTempStatus(status);
    return status;
  }, [eligible]);

  useEffect(() => {
    if (!eligible) return;
    void refresh();
  }, [eligible, refresh]);

  useEffect(() => {
    if (!eligible) return;
    const sub = AppState.addEventListener('change', (next) => {
      const prev = lastAppStateRef.current;
      lastAppStateRef.current = next;
      if (next === 'active' && prev !== 'active') {
        void refresh();
      }
    });
    return () => sub.remove();
  }, [eligible, refresh]);

  const showTempBanner = eligible && Boolean(tempStatus?.isTemporary && !tempStatus.isExpired);

  const onPasswordChangeSuccess = () => {
    void refresh();
    setTimeout(() => setChangePwOpen(false), 700);
  };

  if (!showTempBanner) return null;

  return (
    <>
      <View style={[styles.bannerWrap, { marginBottom, marginHorizontal }]}>
        <TempPasswordBanner
          message={t('parentDashboard.tempPasswordBannerMessage')}
          hintLabel={t('parentDashboard.tempPasswordBannerHint')}
          actionLabel={t('parentDashboard.tempPasswordBannerAction')}
          onPressAction={() => setChangePwOpen(true)}
        />
      </View>
      <ChangePasswordModal
        visible={changePwOpen}
        onClose={() => setChangePwOpen(false)}
        onSuccess={onPasswordChangeSuccess}
      />
    </>
  );
}

const styles = StyleSheet.create({
  bannerWrap: {
    width: '100%',
    maxWidth: '100%',
  },
});
