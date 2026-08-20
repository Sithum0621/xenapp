import { Ionicons } from "@expo/vector-icons";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import DashboardScreenShell from "@/src/components/layout/DashboardScreenShell";
import { KeyboardAwareScrollView } from "@/src/components/layout/KeyboardAwareScrollView";
import DigitalStudentIdCard from "@/src/components/parent/DigitalStudentIdCard";
import ParentClassCardQrScanner from "@/src/components/parent/ParentClassCardQrScanner";
import {
    fetchStudentClassCard,
} from "@/src/services/studentClassCardApi";
import {
    loadParentClassCardSoftCopies,
    saveParentClassCardSoftCopies,
    type ParentClassCardSoftCopy,
} from "@/src/services/parentClassCardSoftCopiesStore";
import { lookupIssuedClassCard } from "@/src/services/teacherClassCardTokenApi";
import { fetchStudentClasses } from "@/src/services/studentClassesApi";
import { Text } from "@/src/theme/Text";
import { FontFamily } from "@/src/theme/fonts";
import { PAGE_CONTENT_BOTTOM, PAGE_EDGE_INSET } from "@/src/theme/pageLayout";
import { type ClassCardScanPayload } from "@/src/utils/xenQrPayload";

const BRAND_BLUE_DARK = "#00101F";
const BRAND_BLUE = "#041830";
const TEXT_MUTED = "#64748B";
const BORDER = "#E2E8F0";
const SURFACE = "#FFFFFF";

type ClassCardSoftCopy = ParentClassCardSoftCopy;

function upsertSoftCopy(
  previous: ClassCardSoftCopy[],
  next: ClassCardSoftCopy,
): ClassCardSoftCopy[] {
  const without = previous.filter((entry) => entry.key !== next.key);
  return [next, ...without];
}

export default function ParentClassCardScreen() {
  const { t } = useTranslation();
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [softCopies, setSoftCopies] = useState<ClassCardSoftCopy[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const saved = await loadParentClassCardSoftCopies();
      if (cancelled) return;
      setSoftCopies(saved);
      setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const loadScannedCard = useCallback(
    async (payload: ClassCardScanPayload) => {
      setScanning(false);
      setLoading(true);
      setError(null);

      let studentUserId = payload.studentUserId;
      const lectureGroupId = payload.lectureGroupId;

      if (!studentUserId && payload.issuedCardToken) {
        const looked = await lookupIssuedClassCard(payload.issuedCardToken);
        if (!looked.ok || !looked.studentUserId) {
          setLoading(false);
          setError(t("parentDashboard.myClassCardErrorUnclaimed"));
          return;
        }
        studentUserId = looked.studentUserId;
      }

      if (!studentUserId) {
        setLoading(false);
        setError(t("parentDashboard.myClassCardErrorGeneric"));
        return;
      }

      const result = await fetchStudentClassCard(studentUserId);

      if (!result.ok) {
        setLoading(false);
        if (result.code === "not_authorized") {
          setError(t("parentDashboard.myClassCardErrorNotAuthorized"));
        } else if (result.code === "student_not_found") {
          setError(t("parentDashboard.myClassCardErrorNotFound"));
        } else {
          setError(t("parentDashboard.myClassCardErrorGeneric"));
        }
        return;
      }

      let groupName: string | null = null;
      let instituteName: string | null = null;
      let teacherName: string | null = null;

      if (lectureGroupId) {
        const classes = await fetchStudentClasses(studentUserId);
        if (classes.ok) {
          const match = classes.classes.find(
            (c) => c.lectureGroupId === lectureGroupId,
          );
          if (match) {
            groupName = match.groupName;
            instituteName = match.instituteName || null;
            teacherName = match.teacherName || null;
          }
        }
      }

      setLoading(false);
      setSoftCopies((prev) => {
        const next = upsertSoftCopy(prev, {
          key: `${studentUserId}:${lectureGroupId ?? "none"}`,
          card: result.card,
          lectureGroupId,
          groupName,
          instituteName,
          teacherName,
        });
        void saveParentClassCardSoftCopies(next);
        return next;
      });
    },
    [t],
  );

  const startScanning = () => {
    setError(null);
    setScanning(true);
  };

  const hasCards = softCopies.length > 0;

  return (
    <DashboardScreenShell
      showBack
      title={t("parentDashboard.myClassCardTitle")}
      padContent={false}
    >
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}
      >
        {scanning ? (
          <ParentClassCardQrScanner
            onScanned={(payload) => void loadScannedCard(payload)}
            onCancel={() => setScanning(false)}
          />
        ) : null}

        {hydrating || loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={BRAND_BLUE} />
            <Text style={styles.statusText}>
              {t(
                hydrating
                  ? "parentDashboard.myClassCardListLoading"
                  : "parentDashboard.myClassCardScanLoading",
              )}
            </Text>
          </View>
        ) : null}

        {!scanning && !hydrating && !loading && error ? (
          <View style={styles.messageCard}>
            <Ionicons
              name="alert-circle-outline"
              size={28}
              color={BRAND_BLUE}
            />
            <Text style={styles.messageTitle}>
              {t("parentDashboard.myClassCardErrorTitle")}
            </Text>
            <Text style={styles.messageBody}>{error}</Text>
            <Pressable
              accessibilityRole="button"
              onPress={startScanning}
              style={({ pressed }) => [
                styles.retryBtn,
                pressed && styles.retryBtnPressed,
              ]}
            >
              <Ionicons name="qr-code-outline" size={18} color="#FFFFFF" />
              <Text style={styles.retryLabel}>
                {t("parentDashboard.myClassCardScanAgain")}
              </Text>
            </Pressable>
          </View>
        ) : null}

        {!scanning && !hydrating && !loading && hasCards ? (
          <View style={styles.cardSection}>
            <View style={styles.cardSectionHeader}>
              <View style={styles.cardSectionTitleWrap}>
                <Ionicons
                  name="cloud-done-outline"
                  size={20}
                  color={BRAND_BLUE}
                />
                <Text style={styles.cardSectionTitle}>
                  {t("parentDashboard.myClassCardSoftCopies")}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t("parentDashboard.myClassCardScanAnother")}
                onPress={startScanning}
                style={({ pressed }) => [
                  styles.scanIconButton,
                  pressed && styles.retryBtnPressed,
                ]}
              >
                <Ionicons name="qr-code-outline" size={22} color={BRAND_BLUE} />
              </Pressable>
            </View>
            {softCopies.map((entry) => (
              <View key={entry.key} style={styles.cardEntry}>
                {entry.lectureGroupId ? (
                  <View style={styles.groupBadge}>
                    <Ionicons
                      name="school-outline"
                      size={16}
                      color={BRAND_BLUE}
                    />
                    <View style={styles.groupBadgeText}>
                      <Text style={styles.groupName}>
                        {entry.groupName ??
                          t("parentDashboard.myClassCardGroupPending")}
                      </Text>
                      {entry.teacherName || entry.instituteName ? (
                        <Text style={styles.groupMeta}>
                          {[entry.teacherName, entry.instituteName]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                ) : null}
                <DigitalStudentIdCard card={entry.card} />
              </View>
            ))}
          </View>
        ) : null}

        {!scanning && !hydrating && !loading && !hasCards && !error ? (
          <View style={styles.emptyCard}>
            <View style={styles.emptyIcon}>
              <Ionicons name="qr-code-outline" size={34} color={BRAND_BLUE} />
            </View>
            <Text style={styles.messageTitle}>
              {t("parentDashboard.myClassCardScanTitle")}
            </Text>
            <Text style={styles.messageBody}>
              {t("parentDashboard.myClassCardScanBody")}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={startScanning}
              style={({ pressed }) => [
                styles.scanButton,
                pressed && styles.retryBtnPressed,
              ]}
            >
              <Ionicons name="scan-outline" size={20} color="#FFFFFF" />
              <Text style={styles.scanButtonText}>
                {t("parentDashboard.myClassCardScanButton")}
              </Text>
            </Pressable>
          </View>
        ) : null}
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scroll: {
    paddingHorizontal: PAGE_EDGE_INSET,
    paddingTop: 12,
    paddingBottom: PAGE_CONTENT_BOTTOM,
    gap: 16,
  },
  centered: {
    alignItems: "center",
    gap: 12,
    paddingVertical: 40,
  },
  statusText: {
    fontSize: 14,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  messageCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 10,
  },
  messageTitle: {
    fontSize: 17,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
    textAlign: "center",
  },
  messageBody: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  retryBtnPressed: { opacity: 0.88 },
  retryLabel: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: "#FFFFFF",
  },
  cardSection: {
    width: "100%",
    gap: 20,
    alignItems: "stretch",
  },
  cardSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  cardSectionTitleWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  cardSectionTitle: {
    fontSize: 16,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  scanIconButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: BORDER,
    backgroundColor: SURFACE,
    alignItems: "center",
    justifyContent: "center",
  },
  cardEntry: {
    gap: 10,
  },
  groupBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#EEF4FC",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  groupBadgeText: {
    flex: 1,
    gap: 2,
  },
  groupName: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  groupMeta: {
    fontSize: 12,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  emptyCard: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingVertical: 30,
    paddingHorizontal: 20,
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: "#E8F1FF",
    alignItems: "center",
    justifyContent: "center",
  },
  scanButton: {
    marginTop: 6,
    minHeight: 48,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: BRAND_BLUE,
    paddingHorizontal: 18,
  },
  scanButtonText: {
    color: "#FFFFFF",
    fontSize: 15,
    fontFamily: FontFamily.bold,
  },
});
