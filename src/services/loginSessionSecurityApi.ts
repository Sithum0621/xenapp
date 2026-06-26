import { supabase } from '@/src/services/supabaseClient';
import {
  getDeviceFingerprint,
  getDeviceLabel,
  getDevicePlatform,
} from '@/src/utils/deviceSessionIdentity';

export type RecordLoginSessionResult = {
  isNewDevice: boolean;
  deviceLabel: string;
  emailSent: boolean;
  showSecurityAlert: boolean;
};

export async function recordLoginSessionSecurity(): Promise<RecordLoginSessionResult | null> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session?.access_token) return null;

    const [deviceFingerprint, deviceLabel] = await Promise.all([
      getDeviceFingerprint(),
      Promise.resolve(getDeviceLabel()),
    ]);

    const { data, error } = await supabase.functions.invoke('record-login-session', {
      body: {
        device_fingerprint: deviceFingerprint,
        device_label: deviceLabel,
        platform: getDevicePlatform(),
      },
    });

    if (error) {
      console.warn('[loginSessionSecurity] record failed:', error.message);
      return null;
    }

    const row = (data ?? {}) as Record<string, unknown>;
    if (row.ok !== true) {
      console.warn('[loginSessionSecurity] unexpected response', row);
      return null;
    }

    return {
      isNewDevice: row.is_new_device === true,
      deviceLabel:
        typeof row.device_label === 'string' && row.device_label.trim()
          ? row.device_label.trim()
          : deviceLabel,
      emailSent: row.email_sent === true,
      showSecurityAlert: row.show_security_alert !== false,
    };
  } catch (e) {
    console.warn('[loginSessionSecurity] record error:', e instanceof Error ? e.message : e);
    return null;
  }
}
