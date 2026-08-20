import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type LayoutRectangle,
} from 'react-native';

import { useAppThemeColors } from '@/src/context/ThemePreferenceContext';
import { setStoredLanguagePreference, type StoredLangCode } from '@/src/services/languagePreference';
import { Text } from '@/src/theme/Text';

const DROPDOWN_WIDTH = 184;
const ROW_MIN_HEIGHT = 48;
const GAP = 6;

const OPTIONS: readonly { code: StoredLangCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'si', label: 'සිංහල' },
  { code: 'ta', label: 'தமிழ்' },
];

function normalizeLng(code: string): StoredLangCode {
  const base = code.split('-')[0]?.toLowerCase() ?? 'en';
  if (base === 'si' || base === 'ta') return base;
  return 'en';
}

function clampDropdownLeft(anchorRight: number): number {
  const { width: screenW } = Dimensions.get('window');
  const pad = 12;
  const left = anchorRight - DROPDOWN_WIDTH;
  return Math.min(Math.max(pad, left), screenW - DROPDOWN_WIDTH - pad);
}

function verticalPosition(anchor: LayoutRectangle): number {
  const { height: screenH } = Dimensions.get('window');
  const menuHeight = OPTIONS.length * ROW_MIN_HEIGHT + 16;
  const below = anchor.y + anchor.height + GAP;
  const above = anchor.y - menuHeight - GAP;
  if (below + menuHeight <= screenH - 16) return below;
  if (above >= 16) return above;
  return below;
}

/** Language picker: tap icon opens a small dropdown (English / Sinhala / Tamil). */
export function LanguageLnToggle() {
  const { t, i18n } = useTranslation();
  const colors = useAppThemeColors();
  const anchorRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const [anchorLayout, setAnchorLayout] = useState<LayoutRectangle | null>(null);

  const current = normalizeLng(i18n.language);

  const close = useCallback(() => {
    setOpen(false);
    setAnchorLayout(null);
  }, []);

  const selectLang = useCallback(
    (code: StoredLangCode) => {
      void i18n.changeLanguage(code);
      void setStoredLanguagePreference(code);
      close();
    },
    [close, i18n],
  );

  const toggleDropdown = useCallback(() => {
    if (open) {
      close();
      return;
    }
    anchorRef.current?.measureInWindow((x, y, width, height) => {
      setAnchorLayout({ x, y, width, height });
      setOpen(true);
    });
  }, [close, open]);

  const dropdownTop = anchorLayout !== null ? verticalPosition(anchorLayout) : 0;
  const dropdownLeft =
    anchorLayout !== null ? clampDropdownLeft(anchorLayout.x + anchorLayout.width) : 0;

  return (
    <>
      <View ref={anchorRef} collapsable={false} style={styles.anchorWrap}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('auth.languageToggle')}
          accessibilityState={{ expanded: open }}
          onPress={toggleDropdown}
          style={({ pressed }) => [
            styles.btn,
            {
              borderColor: colors.border,
              backgroundColor: colors.surface,
            },
            pressed && { opacity: 0.85, borderColor: colors.brandOrange },
          ]}>
          <Ionicons name="language-outline" size={22} color={colors.brandBlueDark} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable
            style={styles.backdrop}
            onPress={close}
            accessibilityLabel={t('auth.languageMenuDismiss')}
          />
          {anchorLayout !== null ? (
            <View
              style={[
                styles.dropdown,
                {
                  top: dropdownTop,
                  left: dropdownLeft,
                  width: DROPDOWN_WIDTH,
                  backgroundColor: colors.surface,
                  borderColor: colors.border,
                },
              ]}>
              {OPTIONS.map(({ code, label }) => {
                const selected = current === code;
                return (
                  <Pressable
                    key={code}
                    accessibilityRole="menuitem"
                    accessibilityState={{ selected }}
                    accessibilityLabel={label}
                    onPress={() => selectLang(code)}
                    style={({ pressed }) => [
                      styles.row,
                      selected && { backgroundColor: colors.selectionWash },
                      pressed && styles.rowPressed,
                    ]}>
                    <Text
                      style={[
                        styles.rowLabel,
                        { color: selected ? colors.brandBlueDark : colors.text },
                      ]}>
                      {label}
                    </Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={20} color={colors.brandOrange} />
                    ) : (
                      <View style={styles.rowSpacer} />
                    )}
                  </Pressable>
                );
              })}
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchorWrap: {
    alignSelf: 'flex-start',
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalRoot: {
    flex: 1,
    pointerEvents: 'box-none',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.25)',
  },
  dropdown: {
    position: 'absolute',
    borderRadius: 14,
    borderWidth: 1.5,
    paddingVertical: 6,
    pointerEvents: 'auto',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(4, 24, 48, 0.12)' }
      : {
          shadowColor: '#041830',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.12,
          shadowRadius: 16,
          elevation: 8,
        }),
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: ROW_MIN_HEIGHT,
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  rowSpacer: {
    width: 20,
    height: 20,
  },
});
