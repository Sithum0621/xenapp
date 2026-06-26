import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import AppAlertDialog from '@/src/components/feedback/AppAlertDialog';
import { appAlert, registerAppAlert, type AppAlertButton } from '@/src/utils/appAlert';

type AlertEntry = {
  title: string;
  message: string;
  buttons: AppAlertButton[];
};

type AppAlertContextValue = {
  alert: typeof appAlert;
};

const AppAlertContext = createContext<AppAlertContextValue | null>(null);

export function AppAlertProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<AlertEntry | null>(null);
  const queueRef = useRef<AlertEntry[]>([]);

  const dequeue = useCallback(() => {
    const next = queueRef.current.shift();
    setCurrent(next ?? null);
  }, []);

  const show = useCallback((title: string, message?: string, buttons?: AppAlertButton[]) => {
    const entry: AlertEntry = {
      title,
      message: message ?? '',
      buttons: buttons?.length ? buttons : [{ text: 'OK' }],
    };
    setCurrent((active) => {
      if (active) {
        queueRef.current.push(entry);
        return active;
      }
      return entry;
    });
  }, []);

  useEffect(() => {
    registerAppAlert(show);
    return () => registerAppAlert(null);
  }, [show]);

  const onPressButton = useCallback(
    (button: AppAlertButton) => {
      button.onPress?.();
      setCurrent(null);
      requestAnimationFrame(() => dequeue());
    },
    [dequeue],
  );

  return (
    <AppAlertContext.Provider value={{ alert: appAlert }}>
      {children}
      <AppAlertDialog
        visible={current != null}
        title={current?.title ?? ''}
        message={current?.message ?? ''}
        buttons={current?.buttons ?? [{ text: 'OK' }]}
        onPressButton={onPressButton}
      />
    </AppAlertContext.Provider>
  );
}

export function useAppAlert(): typeof appAlert {
  const ctx = useContext(AppAlertContext);
  return ctx?.alert ?? appAlert;
}
