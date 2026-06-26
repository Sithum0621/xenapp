export type AppAlertButton = {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
};

type AlertRegistrar = (
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) => void;

let registrar: AlertRegistrar | null = null;

export function registerAppAlert(fn: AlertRegistrar | null) {
  registrar = fn;
}

/** Drop-in branded replacement for `Alert.alert`. */
export function appAlert(
  title: string,
  message?: string,
  buttons?: AppAlertButton[],
) {
  if (registrar) {
    registrar(title, message, buttons);
    return;
  }
  // Fallback before provider mounts (e.g. early boot).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Alert } = require('react-native') as typeof import('react-native');
  Alert.alert(title, message, buttons);
}
