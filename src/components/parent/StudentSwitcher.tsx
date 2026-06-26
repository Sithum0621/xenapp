import { Ionicons } from '@expo/vector-icons';
import { memo, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import type { ParentLinkedStudent } from '@/src/services/parentStudentsApi';
import { FontFamily } from '@/src/theme/fonts';

import {
  parentBorder,
  parentBrandBlue,
  parentBrandBlueDark,
  parentInkSoft,
  parentSurface,
  parentTabActiveStart,
} from '@/src/theme/parentDashboardPalette';

const TEXT_MUTED = parentInkSoft;
const BORDER = parentBorder;
const SURFACE = parentSurface;
const TAB_SELECTED_BG = parentTabActiveStart;

export const STUDENT_LIMIT = 3;

export type StudentSwitcherProps = {
  students: ParentLinkedStudent[];
  selectedId: string | null;
  onSelect: (studentUserId: string) => void;
  onAdd: () => void;
};

function firstNameOf(student: ParentLinkedStudent): string {
  if (student.firstName && student.firstName.trim()) return student.firstName.trim();
  const first = student.fullName.split(/\s+/)[0];
  return first && first.length > 0 ? first : student.fullName;
}

type TabProps = {
  student: ParentLinkedStudent;
  selected: boolean;
  onPress: () => void;
};

const StudentTab = memo(function StudentTab({ student, selected, onPress }: TabProps) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const selectScale = useRef(new Animated.Value(1)).current;
  const wasSelected = useRef(selected);

  useEffect(() => {
    if (selected && !wasSelected.current) {
      selectScale.setValue(0.97);
      Animated.spring(selectScale, {
        toValue: 1,
        friction: 7,
        tension: 160,
        useNativeDriver: true,
      }).start();
    }
    wasSelected.current = selected;
  }, [selected, selectScale]);

  const onIn = () =>
    Animated.timing(pressScale, {
      toValue: 0.97,
      duration: 90,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  const onOut = () =>
    Animated.timing(pressScale, {
      toValue: 1,
      duration: 140,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

  return (
    <Animated.View
      style={[
        styles.tab,
        selected ? styles.tabSelected : styles.tabIdle,
        { transform: [{ scale: Animated.multiply(pressScale, selectScale) }] },
      ]}>
      <ScrollFriendlyPressable
        accessibilityRole="tab"
        accessibilityLabel={student.fullName}
        accessibilityState={{ selected }}
        onPress={onPress}
        onPressIn={onIn}
        onPressOut={onOut}
        activeOpacity={0.92}
        style={styles.tabPressable}
        innerStyle={styles.tabPressableInner}>
        <Text
          style={[styles.tabLabel, selected && styles.tabLabelActive]}
          numberOfLines={1}>
          {firstNameOf(student)}
        </Text>
      </ScrollFriendlyPressable>
    </Animated.View>
  );
});

function AddStudentControl({
  accessibilityLabel,
  caption,
  onPress,
}: {
  accessibilityLabel: string;
  caption: string;
  onPress: () => void;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  return (
    <Animated.View style={[styles.addWrap, { transform: [{ scale }] }]}>
      <ScrollFriendlyPressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        onPressIn={() =>
          Animated.timing(scale, {
            toValue: 0.97,
            duration: 90,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start()
        }
        onPressOut={() =>
          Animated.timing(scale, {
            toValue: 1,
            duration: 140,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }).start()
        }
        activeOpacity={0.92}
        style={styles.addPill}
        innerStyle={styles.addPillInner}>
        <Ionicons name="add" size={16} color={parentBrandBlue} />
        <Text style={styles.addLabel} numberOfLines={1}>
          {caption}
        </Text>
      </ScrollFriendlyPressable>
    </Animated.View>
  );
}

function StudentSwitcher({
  students,
  selectedId,
  onSelect,
  onAdd,
}: StudentSwitcherProps) {
  const { t } = useTranslation();
  const canAdd = students.length < STUDENT_LIMIT;

  return (
    <View style={styles.card} accessibilityRole="tablist">
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Ionicons name="people-outline" size={17} color={parentBrandBlue} />
        </View>
        <Text style={styles.headerTitle}>{t('parentDashboard.studentSwitcherTitle')}</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countBadgeText}>
            {students.length}/{STUDENT_LIMIT}
          </Text>
        </View>
      </View>

      <View style={styles.controlsRow}>
        <View style={styles.tabsArea}>
          {students.map((s) => (
            <StudentTab
              key={s.studentUserId}
              student={s}
              selected={s.studentUserId === selectedId}
              onPress={() => onSelect(s.studentUserId)}
            />
          ))}
        </View>
        {canAdd ? (
          <AddStudentControl
            accessibilityLabel={`${t('parentDashboard.studentSwitcherAdd')}. ${t('parentDashboard.studentSwitcherAddAnotherChild')}`}
            caption={t('parentDashboard.studentSwitcherAddAnotherChild')}
            onPress={onAdd}
          />
        ) : null}
      </View>
    </View>
  );
}

export default memo(StudentSwitcher);

const TAB_HEIGHT = 38;

const cardShadow = Platform.select({
  android: { elevation: 3 },
  default: {
    shadowColor: '#0E2F63',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
});

const styles = StyleSheet.create({
  card: {
    backgroundColor: SURFACE,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 12,
    ...cardShadow,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: FontFamily.bold,
    color: parentBrandBlueDark,
    letterSpacing: -0.2,
  },
  countBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: 'rgba(46, 84, 148, 0.08)',
  },
  countBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: FontFamily.bold,
    color: parentBrandBlue,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tabsArea: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  tab: {
    height: TAB_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabIdle: {
    backgroundColor: SURFACE,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  tabSelected: {
    backgroundColor: TAB_SELECTED_BG,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: parentBrandBlue,
  },
  tabPressable: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  tabPressableInner: {
    alignItems: 'center',
    justifyContent: 'center',
    height: TAB_HEIGHT,
    paddingHorizontal: 16,
    minWidth: 72,
  },
  tabLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontFamily: FontFamily.regular,
    color: TEXT_MUTED,
  },
  tabLabelActive: {
    color: parentBrandBlueDark,
    fontFamily: FontFamily.bold,
  },
  addWrap: {
    flexShrink: 0,
    maxWidth: '46%',
  },
  addPill: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(46, 84, 148, 0.2)',
    backgroundColor: 'rgba(46, 84, 148, 0.04)',
  },
  addPillInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: TAB_HEIGHT,
    paddingHorizontal: 10,
  },
  addLabel: {
    flexShrink: 1,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: FontFamily.bold,
    color: parentBrandBlue,
  },
});
