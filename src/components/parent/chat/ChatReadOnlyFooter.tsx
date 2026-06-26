import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BORDER = '#E2E8F0';
const SURFACE = '#F8FAFC';
const TEXT_MUTED = '#64748B';

type Props = {
  message: string;
};

function ChatReadOnlyFooter({ message }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

export default memo(ChatReadOnlyFooter);

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 20,
  },
});
