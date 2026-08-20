import { Ionicons } from '@expo/vector-icons';
import { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from '@/src/theme/Text';
import {
  ActivityIndicator,
  Dimensions,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';

import { ScrollView } from '@/src/components/layout/scroll';
import ScrollFriendlyPressable from '@/src/components/layout/ScrollFriendlyPressable';

import type { AppNotification } from '@/src/services/pushNotificationsApi';
import { notificationVisual } from '@/src/utils/notificationVisual';

const BRAND_BLUE_DARK = '#00101F';
const BRAND_BLUE = '#041830';
const TEXT_MUTED = '#64748B';
const BORDER = '#E2E8F0';
const SURFACE = '#FFFFFF';

const PANEL_GAP = 6;
const PANEL_MIN_WIDTH = 280;
const PANEL_MAX_WIDTH = 360;
const SCREEN_EDGE = 12;

export type NotificationBellProps = {
  emptyLabel: string;
  title?: string;
  badgeCount?: number;
  accessibilityLabel?: string;
  notifications?: AppNotification[];
  loading?: boolean;
  /** When true, the menu lists only unread items (default). */
  unreadOnly?: boolean;
  onOpen?: () => void;
  onMarkAllRead?: () => void;
};

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

type AnchorLayout = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function measureAnchor(
  anchorRef: React.RefObject<View | null>,
  onMeasured: (layout: AnchorLayout) => void,
): void {
  const node = anchorRef.current;
  if (!node) return;

  if (Platform.OS === 'web') {
    const el = node as unknown as HTMLElement;
    const rect = el.getBoundingClientRect?.();
    if (rect && (rect.width > 0 || rect.height > 0)) {
      onMeasured({
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      });
      return;
    }
  }

  if (typeof node.measureInWindow !== 'function') return;

  node.measureInWindow((x, y, width, height) => {
    onMeasured({ x, y, width, height });
  });
}

export default function NotificationBell({
  emptyLabel,
  title,
  badgeCount,
  accessibilityLabel,
  notifications = [],
  loading = false,
  unreadOnly = true,
  onOpen,
  onMarkAllRead,
}: NotificationBellProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [anchorLayout, setAnchorLayout] = useState<AnchorLayout | null>(null);
  const anchorRef = useRef<View>(null);

  const hasUnread = (badgeCount ?? 0) > 0;

  const displayItems = useMemo(
    () => (unreadOnly ? notifications.filter((n) => !n.read_at) : notifications),
    [notifications, unreadOnly],
  );
  const hasItems = displayItems.length > 0;

  const closeNow = useCallback(() => {
    setOpen(false);
    setAnchorLayout(null);
  }, []);

  const openPanel = useCallback(() => {
    measureAnchor(anchorRef, (layout) => {
      setAnchorLayout(layout);
      setOpen(true);
      onOpen?.();
    });
  }, [onOpen]);

  const toggle = useCallback(() => {
    if (open) {
      closeNow();
      return;
    }
    openPanel();
  }, [open, closeNow, openPanel]);

  const screenW = Dimensions.get('window').width;
  const panelWidth =
    anchorLayout != null
      ? Math.min(PANEL_MAX_WIDTH, Math.max(PANEL_MIN_WIDTH, screenW - SCREEN_EDGE * 2))
      : PANEL_MIN_WIDTH;
  const dropdownTop =
    anchorLayout != null ? anchorLayout.y + anchorLayout.height + PANEL_GAP : 0;
  const dropdownRight =
    anchorLayout != null
      ? Math.max(SCREEN_EDGE, screenW - anchorLayout.x - anchorLayout.width)
      : SCREEN_EDGE;

  return (
    <>
      <View ref={anchorRef} style={styles.anchor} collapsable={false}>
        <ScrollFriendlyPressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? 'Notifications'}
          accessibilityState={{ expanded: open }}
          onPress={toggle}
          hitSlop={8}
          style={styles.bellBtn}
          innerStyle={styles.bellBtnInner}>
          <Ionicons name="notifications-outline" size={22} color={BRAND_BLUE_DARK} />
          {hasUnread ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeCount! > 9 ? '9+' : badgeCount}</Text>
            </View>
          ) : null}
        </ScrollFriendlyPressable>
      </View>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={closeNow}
        statusBarTranslucent
        supportedOrientations={['portrait', 'landscape']}>
        <View style={styles.modalRoot} pointerEvents="box-none">
          <Pressable
            accessibilityLabel="Dismiss notifications"
            onPress={closeNow}
            style={styles.backdrop}
          />
          {anchorLayout != null ? (
            <View
              pointerEvents="box-none"
              style={[
                styles.dropdownAnchor,
                {
                  top: dropdownTop,
                  right: dropdownRight,
                  width: panelWidth,
                },
              ]}>
              <View accessibilityRole="menu" style={styles.panel}>
                <View style={styles.panelInner}>
                  <View style={styles.panelHeader}>
                    {title ? <Text style={styles.panelTitle}>{title}</Text> : null}
                    {hasUnread && onMarkAllRead ? (
                      <Pressable
                        onPress={() => {
                          void onMarkAllRead();
                        }}
                        hitSlop={8}>
                        <Text style={styles.markReadText}>
                          {t('parentDashboard.notificationsMarkAllRead')}
                        </Text>
                      </Pressable>
                    ) : null}
                  </View>

                  {loading ? (
                    <View style={styles.panelBody}>
                      <ActivityIndicator size="small" color={BRAND_BLUE} />
                    </View>
                  ) : hasItems ? (
                    <ScrollView
                      style={styles.listScroll}
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      showsVerticalScrollIndicator>
                      {displayItems.map((item) => {
                        const visual = notificationVisual(
                          typeof item.data?.type === 'string' ? item.data.type : undefined,
                          item.data,
                        );
                        return (
                        <View
                          key={item.id}
                          style={[
                            styles.notifRow,
                            styles.notifRowUnread,
                            { backgroundColor: visual.rowBackground },
                          ]}>
                          <View style={[styles.notifIcon, { backgroundColor: visual.iconBackground }]}>
                            <Ionicons
                              name={visual.icon}
                              size={18}
                              color={visual.color}
                            />
                          </View>
                          <View style={styles.notifTextCol}>
                            <Text style={[styles.notifTitle, { color: visual.titleColor }]}>
                              {item.title}
                            </Text>
                            <Text style={styles.notifBody}>{item.body}</Text>
                            <Text style={styles.notifWhen}>{formatWhen(item.created_at)}</Text>
                          </View>
                        </View>
                        );
                      })}
                    </ScrollView>
                  ) : (
                    <View style={styles.panelBody}>
                      <Ionicons name="notifications-off-outline" size={18} color={TEXT_MUTED} />
                      <Text style={styles.panelEmpty}>{emptyLabel}</Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  anchor: {
    position: 'relative',
    zIndex: 30,
    elevation: 30,
  },
  bellBtn: {
    borderRadius: 12,
  },
  bellBtnInner: {
    padding: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellPressed: { opacity: 0.75, backgroundColor: 'rgba(18, 59, 122, 0.06)' },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    backgroundColor: '#B42318',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    lineHeight: 12,
  },
  modalRoot: { flex: 1 },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
  },
  dropdownAnchor: {
    position: 'absolute',
    alignItems: 'flex-end',
    zIndex: 40,
    elevation: 40,
  },
  panel: {
    width: '100%',
    maxHeight: 420,
    backgroundColor: SURFACE,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
    overflow: 'hidden',
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(14, 47, 99, 0.18)',
      } as object,
      default: {
        shadowColor: '#00101F',
        shadowOpacity: 0.18,
        shadowRadius: 18,
        shadowOffset: { width: 0, height: 10 },
        elevation: 12,
      },
    }),
  },
  panelInner: { paddingHorizontal: 14, paddingVertical: 12 },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  panelTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: BRAND_BLUE,
    letterSpacing: 0.2,
    flex: 1,
  },
  markReadText: {
    fontSize: 12,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
  },
  panelBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  panelEmpty: {
    fontSize: 13.5,
    color: TEXT_MUTED,
    flexShrink: 1,
  },
  listScroll: {
    maxHeight: 320,
  },
  notifRow: {
    flexDirection: 'row',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: BORDER,
  },
  notifRowUnread: {
    marginHorizontal: -14,
    paddingHorizontal: 14,
    borderRadius: 8,
  },
  notifIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  notifTextCol: {
    flex: 1,
    gap: 2,
  },
  notifTitle: {
    fontSize: 13.5,
    fontWeight: '800',
  },
  notifBody: {
    fontSize: 13,
    color: TEXT_MUTED,
    lineHeight: 18,
  },
  notifWhen: {
    fontSize: 11,
    color: TEXT_MUTED,
    marginTop: 2,
  },
});
