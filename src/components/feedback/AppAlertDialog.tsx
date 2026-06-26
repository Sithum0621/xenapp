import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import type { AppAlertButton } from '@/src/utils/appAlert';
import {
  appBorder,
  appBrandBlue,
  appBrandBlueDark,
  appSurface,
  appTextMuted,
} from '@/src/theme/appBrandPalette';

const BRAND_BLUE = appBrandBlue;
const BRAND_BLUE_DARK = appBrandBlueDark;
const BORDER = appBorder;
const TEXT_MUTED = appTextMuted;
const SURFACE = appSurface;
const DESTRUCTIVE = '#B42318';
const SUCCESS = '#15803D';
const WARNING = '#B45309';

export type AppAlertDialogProps = {
  visible: boolean;
  title: string;
  message: string;
  buttons: AppAlertButton[];
  onPressButton: (button: AppAlertButton) => void;
};

function alertIcon(
  title: string,
  buttons: AppAlertButton[],
): {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  bg: string;
} {
  if (buttons.some((b) => b.style === 'destructive')) {
    return { name: 'warning-outline', color: WARNING, bg: 'rgba(180, 83, 9, 0.10)' };
  }
  const titleLow = title.toLowerCase();
  if (
    titleLow.includes('success') ||
    titleLow.includes('saved') ||
    titleLow.includes('updated') ||
    titleLow.includes('complete')
  ) {
    return { name: 'checkmark-circle-outline', color: SUCCESS, bg: 'rgba(21, 128, 61, 0.10)' };
  }
  const joined = buttons.map((b) => b.text).join(' ').toLowerCase();
  if (joined.includes('ok') && buttons.length === 1) {
    return { name: 'checkmark-circle-outline', color: SUCCESS, bg: 'rgba(21, 128, 61, 0.10)' };
  }
  return { name: 'information-circle-outline', color: BRAND_BLUE, bg: 'rgba(18, 59, 122, 0.10)' };
}

export default function AppAlertDialog({
  visible,
  title,
  message,
  buttons,
  onPressButton,
}: AppAlertDialogProps) {
  const icon = alertIcon(title, buttons);
  const resolved = normalizeButtons(buttons);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => onPressButton(resolved.dismissButton)}>
      <View style={styles.overlay}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={StyleSheet.absoluteFill}
          onPress={() => onPressButton(resolved.dismissButton)}
        />
        <View style={styles.card}>
          <View style={[styles.iconWrap, { backgroundColor: icon.bg }]}>
            <Ionicons name={icon.name} size={22} color={icon.color} />
          </View>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <View style={[styles.actions, resolved.stacked && styles.actionsStacked]}>
            {resolved.ordered.map((button) => {
              const destructive = button.style === 'destructive';
              const cancel = button.style === 'cancel';
              return (
                <Pressable
                  key={button.text}
                  accessibilityRole="button"
                  onPress={() => onPressButton(button)}
                  style={({ pressed }) => [
                    styles.actionBtn,
                    resolved.stacked && styles.actionBtnStacked,
                    cancel && styles.cancelBtn,
                    destructive && styles.destructiveBtn,
                    !cancel && !destructive && styles.primaryBtn,
                    pressed && styles.actionBtnPressed,
                  ]}>
                  <Text
                    style={[
                      styles.actionText,
                      cancel && styles.cancelText,
                      destructive && styles.destructiveText,
                      !cancel && !destructive && styles.primaryText,
                    ]}>
                    {button.text}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function normalizeButtons(buttons: AppAlertButton[]): {
  ordered: AppAlertButton[];
  dismissButton: AppAlertButton;
  stacked: boolean;
} {
  const list = buttons.length > 0 ? [...buttons] : [{ text: 'OK' }];
  const cancel = list.find((b) => b.style === 'cancel');
  const others = list.filter((b) => b.style !== 'cancel');
  const ordered = cancel ? [...others, cancel] : list;
  const dismissButton = cancel ?? ordered[ordered.length - 1] ?? { text: 'OK' };
  return { ordered, dismissButton, stacked: ordered.length > 2 || ordered.some((b) => b.text.length > 14) };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 22, 53, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: SURFACE,
    borderRadius: 18,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
    gap: 10,
    zIndex: 1,
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: BRAND_BLUE_DARK,
    textAlign: 'center',
    lineHeight: 24,
  },
  message: {
    fontSize: 14,
    fontWeight: '500',
    color: TEXT_MUTED,
    textAlign: 'center',
    lineHeight: 21,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  actionsStacked: {
    flexDirection: 'column-reverse',
    alignItems: 'stretch',
  },
  actionBtn: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: 12,
    minWidth: 88,
    alignItems: 'center',
  },
  actionBtnStacked: {
    width: '100%',
    minWidth: 0,
  },
  actionBtnPressed: { opacity: 0.88 },
  cancelBtn: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    backgroundColor: SURFACE,
  },
  primaryBtn: {
    backgroundColor: BRAND_BLUE,
  },
  destructiveBtn: {
    backgroundColor: 'rgba(180, 35, 24, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(180, 35, 24, 0.25)',
  },
  actionText: { fontSize: 14, fontWeight: '800' },
  cancelText: { color: BRAND_BLUE_DARK, fontWeight: '700' },
  primaryText: { color: '#FFFFFF' },
  destructiveText: { color: DESTRUCTIVE },
});
