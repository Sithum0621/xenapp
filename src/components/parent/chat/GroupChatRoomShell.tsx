import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';

import { useKeyboardBottomInset } from '@/src/hooks/useKeyboardBottomInset';

type Props = {
  header?: ReactNode;
  footer: ReactNode;
  children: ReactNode;
};

/**
 * Chat room body: scrollable messages + footer composer that stays above the keyboard.
 */
export default function GroupChatRoomShell({ header, footer, children }: Props) {
  const footerBottomInset = useKeyboardBottomInset();

  const body = (
    <>
      <View style={styles.messages}>{children}</View>
      <View style={[styles.footer, { paddingBottom: footerBottomInset }]}>{footer}</View>
    </>
  );

  return (
    <View style={styles.root}>
      {header}
      {Platform.OS === 'ios' ? (
        <KeyboardAvoidingView style={styles.flex} behavior="padding">
          {body}
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.flex}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  flex: { flex: 1 },
  messages: { flex: 1, minHeight: 0 },
  footer: {
    backgroundColor: '#FFFFFF',
  },
});
