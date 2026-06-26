import { Ionicons } from '@expo/vector-icons';
import { memo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#123B7A';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';
const TEXT_MUTED = '#64748B';

type Props = {
  placeholder: string;
  sendLabel: string;
  attachLabel?: string;
  onSend: (text: string) => Promise<boolean>;
  onAttach?: () => void;
};

function ChatComposer({ placeholder, sendLabel, attachLabel, onSend, onAttach }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    const ok = await onSend(trimmed);
    setSending(false);
    if (ok) setText('');
  };

  return (
    <View style={styles.wrap}>
      {onAttach ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={attachLabel ?? 'Attach'}
          onPress={onAttach}
          disabled={sending}
          style={({ pressed }) => [styles.attachBtn, pressed && styles.attachBtnPressed]}>
          <Ionicons name="add" size={22} color={BRAND_BLUE} />
        </Pressable>
      ) : null}
      <View style={styles.inputWrap}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={placeholder}
          placeholderTextColor="#94A3B8"
          multiline
          maxLength={2000}
          editable={!sending}
          style={styles.input}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={sendLabel}
        disabled={sending || !text.trim()}
        onPress={() => void submit()}
        style={({ pressed }) => [
          styles.sendBtn,
          (!text.trim() || sending) && styles.sendBtnDisabled,
          pressed && text.trim() && !sending && styles.sendBtnPressed,
        ]}>
        {sending ? (
          <ActivityIndicator color="#FFFFFF" size="small" />
        ) : (
          <Ionicons name="send" size={17} color="#FFFFFF" />
        )}
      </Pressable>
    </View>
  );
}

export default memo(ChatComposer);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: SURFACE,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDER,
  },
  attachBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  attachBtnPressed: { opacity: 0.88, borderColor: BRAND_BLUE },
  inputWrap: {
    flex: 1,
    minHeight: 38,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: BORDER,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    minHeight: 36,
    maxHeight: 118,
    paddingHorizontal: 14,
    paddingVertical: 9,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    backgroundColor: 'transparent',
    borderWidth: 0,
    ...(Platform.OS === 'web'
      ? ({
          outlineStyle: 'none',
          resize: 'none',
          overflowY: 'auto',
          boxSizing: 'border-box',
          scrollbarWidth: 'thin',
          scrollbarColor: '#CBD5E1 transparent',
        } as const)
      : {}),
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: BRAND_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  sendBtnDisabled: { opacity: 0.45 },
  sendBtnPressed: { opacity: 0.88 },
});
