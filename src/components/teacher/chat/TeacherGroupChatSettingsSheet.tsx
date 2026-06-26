import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

import GroupChatAvatar from '@/src/components/parent/chat/GroupChatAvatar';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { FontFamily } from '@/src/theme/fonts';
import {
  fetchTeacherGroupChatSettings,
  saveTeacherChatDisplayName,
  signedGroupChatAvatarUrl,
  uploadGroupChatAvatar,
} from '@/src/services/groupChatSettingsApi';
import type { StudentGroupSource } from '@/src/services/studentClassesApi';

const BRAND_BLUE = '#123B7A';
const BRAND_BLUE_DARK = '#0E2F63';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

type Props = {
  visible: boolean;
  groupId: string;
  groupSource: StudentGroupSource;
  groupName: string;
  onClose: () => void;
  onSaved: (next: { chatDisplayName: string; avatarUrl: string | null }) => void;
  labels: {
    title: string;
    displayName: string;
    displayNamePlaceholder: string;
    groupPhoto: string;
    changePhoto: string;
    save: string;
    cancel: string;
    savedTitle: string;
    savedBody: string;
    errorTitle: string;
    photosPermission: string;
  };
};

function TeacherGroupChatSettingsSheet({
  visible,
  groupId,
  groupSource,
  groupName,
  onClose,
  onSaved,
  labels,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayName, setDisplayName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let mounted = true;
    void (async () => {
      setLoading(true);
      const res = await fetchTeacherGroupChatSettings(groupId, groupSource);
      if (!mounted) return;
      if (res.ok) {
        setDisplayName(res.settings.chatDisplayName);
        const url = await signedGroupChatAvatarUrl(res.settings.chatAvatarPath);
        if (mounted) setAvatarUrl(url);
      }
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [visible, groupId, groupSource]);

  const pickPhoto = async () => {
    const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!lib.granted) {
      appAlert(labels.errorTitle, labels.photosPermission);
      return;
    }

    const launched = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });

    if (launched.canceled || !launched.assets?.[0]?.uri) return;

    setUploading(true);
    const uploaded = await uploadGroupChatAvatar(launched.assets[0].uri, groupId, groupSource);
    setUploading(false);

    if (!uploaded.ok) {
      appAlert(labels.errorTitle, uploaded.error);
      return;
    }

    const url = await signedGroupChatAvatarUrl(uploaded.path);
    setAvatarUrl(url);
  };

  const save = async () => {
    setSaving(true);
    const res = await saveTeacherChatDisplayName(displayName);
    setSaving(false);
    if (!res.ok) {
      appAlert(labels.errorTitle, res.error);
      return;
    }
    onSaved({ chatDisplayName: displayName.trim(), avatarUrl });
    appAlert(labels.savedTitle, labels.savedBody, [{ text: 'OK', onPress: onClose }]);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{labels.title}</Text>
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={24} color={TEXT_MUTED} />
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={BRAND_BLUE} />
            </View>
          ) : (
            <>
              <Text style={styles.sectionLabel}>{labels.groupPhoto}</Text>
              <View style={styles.photoRow}>
                {avatarUrl ? (
                  <Image source={{ uri: avatarUrl }} style={styles.photo} contentFit="cover" />
                ) : (
                  <GroupChatAvatar groupName={groupName} size={72} />
                )}
                <Pressable
                  disabled={uploading}
                  onPress={() => void pickPhoto()}
                  style={({ pressed }) => [styles.photoBtn, pressed && styles.photoBtnPressed]}>
                  {uploading ? (
                    <ActivityIndicator color={BRAND_BLUE} size="small" />
                  ) : (
                    <>
                      <Ionicons name="camera-outline" size={18} color={BRAND_BLUE} />
                      <Text style={styles.photoBtnText}>{labels.changePhoto}</Text>
                    </>
                  )}
                </Pressable>
              </View>

              <Text style={styles.sectionLabel}>{labels.displayName}</Text>
              <TextInput
                value={displayName}
                onChangeText={setDisplayName}
                placeholder={labels.displayNamePlaceholder}
                placeholderTextColor={TEXT_MUTED}
                maxLength={80}
                editable={!saving}
                style={styles.input}
              />

              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  disabled={saving}
                  style={({ pressed }) => [styles.cancelBtn, pressed && styles.btnPressed]}>
                  <Text style={styles.cancelText}>{labels.cancel}</Text>
                </Pressable>
                <Pressable
                  onPress={() => void save()}
                  disabled={saving}
                  style={({ pressed }) => [
                    styles.saveBtn,
                    pressed && !saving && styles.btnPressed,
                    saving && styles.saveBtnDisabled,
                  ]}>
                  {saving ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Text style={styles.saveText}>{labels.save}</Text>
                  )}
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

export default memo(TeacherGroupChatSettingsSheet);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.4)',
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 20,
    paddingTop: 12,
    maxHeight: '85%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  loadingBox: { paddingVertical: 40, alignItems: 'center' },
  sectionLabel: {
    fontSize: 12,
    fontFamily: FontFamily.bold,
    color: TEXT_MUTED,
    marginBottom: 8,
    marginTop: 4,
  },
  photoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 16,
  },
  photo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: BORDER,
  },
  photoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
    backgroundColor: '#F8FAFC',
  },
  photoBtnPressed: { opacity: 0.88 },
  photoBtnText: {
    fontSize: 14,
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: FontFamily.regular,
    backgroundColor: '#F8FAFC',
    color: BRAND_BLUE_DARK,
    marginBottom: 20,
  },
  actions: { flexDirection: 'row', gap: 10 },
  cancelBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: BORDER,
  },
  cancelText: {
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE_DARK,
  },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: BRAND_BLUE,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveText: {
    fontFamily: FontFamily.bold,
    color: '#FFFFFF',
  },
  btnPressed: { opacity: 0.9 },
});
