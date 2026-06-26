import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Dimensions, Modal, Platform, Pressable, StyleSheet, View, type LayoutRectangle } from 'react-native';

import { setStoredLanguagePreference, type StoredLangCode } from '@/src/services/languagePreference';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const SUBTLE_BORDER = '#E2E8F0';

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

  const dropdownTop =
    anchorLayout !== null ? verticalPosition(anchorLayout) : 0;
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
          style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
          <Ionicons name="language-outline" size={22} color={BRAND_BLUE_DARK} />
        </Pressable>
      </View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={close}>
        <View style={styles.modalRoot}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityLabel={t('auth.languageMenuDismiss')} />
          {anchorLayout !== null ? (
            <View
              style={[
                styles.dropdown,
                {
                  top: dropdownTop,
                  left: dropdownLeft,
                  width: DROPDOWN_WIDTH,
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
                      selected && styles.rowSelected,
                      pressed && styles.rowPressed,
                    ]}>
                    <Text style={[styles.rowLabel, selected && styles.rowLabelSelected]}>{label}</Text>
                    {selected ? (
                      <Ionicons name="checkmark" size={20} color={BRAND_BLUE} />
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
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    opacity: 0.85,
    borderColor: BRAND_BLUE,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: SUBTLE_BORDER,
    paddingVertical: 6,
    pointerEvents: 'auto',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 24px rgba(18, 59, 122, 0.12)' }
      : {
          shadowColor: '#123B7A',
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
  rowSelected: {
    backgroundColor: '#EFF6FF',
  },
  rowPressed: {
    opacity: 0.92,
  },
  rowLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: BRAND_BLUE_DARK,
    flex: 1,
  },
  rowLabelSelected: {
    color: BRAND_BLUE,
  },
  rowSpacer: {
    width: 20,
    height: 20,
  },
});
