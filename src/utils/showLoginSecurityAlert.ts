import { appAlert } from '@/src/utils/appAlert';
import type { TFunction } from 'i18next';

import type { RecordLoginSessionResult } from '@/src/services/loginSessionSecurityApi';

export function showLoginSecurityAlert(
  t: TFunction,
  result: RecordLoginSessionResult | null,
): void {
  if (!result?.showSecurityAlert) return;

  const title = t('auth.securityLogin.alertTitle');
  const message = result.isNewDevice
    ? t('auth.securityLogin.alertBodyNewDevice', { device: result.deviceLabel })
    : t('auth.securityLogin.alertBodyReturning', { device: result.deviceLabel });

  appAlert(title, message, [{ text: t('auth.securityLogin.alertOk') }]);
}
