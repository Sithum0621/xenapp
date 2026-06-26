import { useRouter } from 'expo-router';
import { appAlert } from '@/src/utils/appAlert';

import { useEffect, useRef } from 'react';

import { useTranslation } from 'react-i18next';

import { AppState, type AppStateStatus } from 'react-native';



import { signOutAndReturnToLogin } from '@/src/navigation/signOutAndReturnToLogin';

import { supabase } from '@/src/services/supabaseClient';

import { fetchTempPasswordStatus } from '@/src/services/tempPasswordApi';

import { roleUsesTempPassword } from '@/src/utils/tempPasswordPolicy';



/**

 * App-wide guard for parent/student temporary passwords only.

 * Teachers and admins never use expiring temp passwords.

 */

export default function TempPasswordGuard() {

  const router = useRouter();

  const { t } = useTranslation();

  const handlingExpiryRef = useRef(false);

  const lastAppStateRef = useRef<AppStateStatus>(AppState.currentState);



  useEffect(() => {

    let cancelled = false;



    const handleExpired = async () => {

      if (cancelled || handlingExpiryRef.current) return;

      handlingExpiryRef.current = true;



      await signOutAndReturnToLogin(router);

      appAlert(

        t('parentDashboard.tempPasswordExpiredTitle'),

        t('parentDashboard.tempPasswordExpiredBody'),

      );

      handlingExpiryRef.current = false;

    };



    const checkOnce = async () => {

      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) return;



      const userId = sessionData.session.user.id;

      const { data: profile } = await supabase

        .from('profiles')

        .select('role')

        .eq('id', userId)

        .maybeSingle();



      if (!roleUsesTempPassword(profile?.role)) return;



      const status = await fetchTempPasswordStatus();

      if (cancelled) return;

      if (status.isTemporary && status.isExpired) {

        await handleExpired();

      }

    };



    void checkOnce();



    const authSub = supabase.auth.onAuthStateChange((event, session) => {

      if (!session) return;

      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') {

        void checkOnce();

      }

    });



    const appStateSub = AppState.addEventListener('change', (next) => {

      const prev = lastAppStateRef.current;

      lastAppStateRef.current = next;

      if (next === 'active' && prev !== 'active') {

        void checkOnce();

      }

    });



    return () => {

      cancelled = true;

      authSub.data.subscription.unsubscribe();

      appStateSub.remove();

    };

  }, [router, t]);



  return null;

}


