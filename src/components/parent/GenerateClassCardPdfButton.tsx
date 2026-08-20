import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, StyleSheet } from 'react-native';

import {
  formatContactNumber,
  type StudentClassCardData,
} from '@/src/services/studentClassCardApi';
import {
  generateStudentClassCardPdf,
  openClassCardPdf,
  shareClassCardPdf,
} from '@/src/services/studentClassCardPdf';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const SURFACE = '#FFFFFF';
const BORDER = '#E2E8F0';

export type GenerateClassCardPdfButtonProps = {
  card: StudentClassCardData;
};

export default function GenerateClassCardPdfButton({ card }: GenerateClassCardPdfButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const pdfLabels = useCallback(
    () => ({
      documentTitle: t('parentDashboard.myClassCardPdfTitle', {
        studentId: formatContactNumber(card.mobileNumber),
      }),
      frontCaption: t('parentDashboard.myClassCardSideFront'),
      backCaption: t('parentDashboard.myClassCardSideBack'),
      nameLabel: t('parentDashboard.myClassCardLabelName'),
      idLabel: t('parentDashboard.myClassCardLabelStudentId'),
      contactLabel: t('parentDashboard.myClassCardLabelContact'),
    }),
    [card.mobileNumber, t],
  );

  const promptPdfActions = useCallback(
    (fileUri: string) => {
      const labels = pdfLabels();

      appAlert(
        t('parentDashboard.myClassCardPdfReadyTitle'),
        t('parentDashboard.myClassCardPdfReadyBody'),
        [
          {
            text: t('parentDashboard.myClassCardPdfCancel'),
            style: 'cancel',
          },
          {
            text: t('parentDashboard.myClassCardPdfOpen'),
            onPress: () => {
              void (async () => {
                const opened = await openClassCardPdf(fileUri);
                if (!opened) {
                  const shared = await shareClassCardPdf(fileUri, labels.documentTitle);
                  if (!shared) {
                    appAlert(
                      t('parentDashboard.myClassCardPdfErrorTitle'),
                      t('parentDashboard.myClassCardPdfOpenFailed'),
                    );
                  }
                }
              })();
            },
          },
          {
            text: t('parentDashboard.myClassCardPdfShare'),
            onPress: () => {
              void (async () => {
                const shared = await shareClassCardPdf(fileUri, labels.documentTitle);
                if (!shared) {
                  appAlert(
                    t('parentDashboard.myClassCardPdfErrorTitle'),
                    t('parentDashboard.myClassCardPdfShareUnavailable'),
                  );
                }
              })();
            },
          },
        ],
      );
    },
    [pdfLabels, t],
  );

  const onPress = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await generateStudentClassCardPdf(card, pdfLabels());

      if (!result.ok) {
        appAlert(
          t('parentDashboard.myClassCardPdfErrorTitle'),
          result.error || t('parentDashboard.myClassCardPdfErrorGeneric'),
        );
        return;
      }

      if (Platform.OS === 'web') {
        appAlert(
          t('parentDashboard.myClassCardPdfWebTitle'),
          t('parentDashboard.myClassCardPdfWebBody'),
        );
        return;
      }

      if (result.fileUri) {
        promptPdfActions(result.fileUri);
      }
    } finally {
      setBusy(false);
    }
  }, [busy, card, pdfLabels, promptPdfActions, t]);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('parentDashboard.myClassCardGeneratePdf')}
      disabled={busy}
      onPress={() => void onPress()}
      style={({ pressed }) => [
        styles.button,
        busy && styles.buttonDisabled,
        pressed && !busy && styles.buttonPressed,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color="#FFFFFF" />
      ) : (
        <Ionicons name="document-text-outline" size={20} color="#FFFFFF" />
      )}
      <Text style={styles.label}>
        {busy
          ? t('parentDashboard.myClassCardGeneratingPdf')
          : t('parentDashboard.myClassCardGeneratePdf')}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'stretch',
    backgroundColor: BRAND_BLUE,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    shadowColor: BRAND_BLUE_DARK,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  buttonPressed: { opacity: 0.9 },
  buttonDisabled: { opacity: 0.75 },
  label: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: SURFACE,
    letterSpacing: -0.2,
  },
});
