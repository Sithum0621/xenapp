import { Ionicons } from '@expo/vector-icons';
import { appAlert } from '@/src/utils/appAlert';
import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text } from '@/src/theme/Text';
import { TextInput } from '@/src/theme/TextInput';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View } from 'react-native';

import { KeyboardAwareScrollView } from '@/src/components/layout/KeyboardAwareScrollView';
import DashboardScreenShell from '@/src/components/layout/DashboardScreenShell';
import { AppRoutes, appHref } from '@/src/navigation/AppNavigator';
import { loadTeacherProfileFields, saveTeacherProfileFields } from '@/src/services/teacherProfileApi';
import { supabase } from '@/src/services/supabaseClient';
import { PAGE_EDGE_INSET } from '@/src/theme/pageLayout';
import { routerBackOrReplace } from '@/src/utils/routerSafeBack';

const BRAND_BLUE = '#041830';
const BRAND_BLUE_DARK = '#00101F';
const BORDER = '#E2E8F0';
const TEXT_MUTED = '#64748B';

const NIC_BUCKET = 'profile-nic-documents';

function splitFullName(full: string): { first: string; last: string } {
  const t = full.trim();
  if (!t) return { first: '', last: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { first: t, last: '' };
  return { first: t.slice(0, i).trim(), last: t.slice(i + 1).trim() };
}

async function signedUrlForPath(path: string | null): Promise<string | null> {
  if (!path?.trim()) return null;
  const { data, error } = await supabase.storage.from(NIC_BUCKET).createSignedUrl(path.trim(), 3600);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

async function uploadNicDocument(
  localUri: string,
  userId: string,
  side: 'front' | 'back',
): Promise<{ path: string | null; error: string | null }> {
  try {
    const response = await fetch(localUri);
    const blob = await response.blob();
    const mime = blob.type && blob.type.startsWith('image/') ? blob.type : 'image/jpeg';
    const ext = mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : 'jpg';
    const objectPath = `${userId}/nic-${side}.${ext}`;
    const { error } = await supabase.storage.from(NIC_BUCKET).upload(objectPath, blob, {
      upsert: true,
      contentType: mime,
    });
    if (error) return { path: null, error: error.message };
    return { path: objectPath, error: null };
  } catch (e) {
    return { path: null, error: e instanceof Error ? e.message : 'Upload failed' };
  }
}

export default function TeacherProfileSettings() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [address, setAddress] = useState('');
  const [nicNumber, setNicNumber] = useState('');

  const [nicFrontPath, setNicFrontPath] = useState<string | null>(null);
  const [nicBackPath, setNicBackPath] = useState<string | null>(null);
  const [nicFrontPreview, setNicFrontPreview] = useState<string | null>(null);
  const [nicBackPreview, setNicBackPreview] = useState<string | null>(null);
  const [uploadingFront, setUploadingFront] = useState(false);
  const [uploadingBack, setUploadingBack] = useState(false);

  const refreshPreview = useCallback(async (path: string | null, side: 'front' | 'back') => {
    const url = await signedUrlForPath(path);
    if (side === 'front') setNicFrontPreview(url);
    else setNicBackPreview(url);
  }, []);

  useEffect(() => {
    let mounted = true;
    void (async () => {
      setLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!mounted) return;
      setUserId(user?.id ?? null);
      setEmail(user?.email ?? '');

      if (user?.id) {
        const { data: loaded } = await loadTeacherProfileFields(user.id);
        if (!mounted) return;

        if (loaded) {
          if (loaded.firstName || loaded.lastName) {
            setFirstName(loaded.firstName);
            setLastName(loaded.lastName);
          } else {
            const sp = splitFullName(loaded.fullName);
            setFirstName(sp.first);
            setLastName(sp.last);
          }
          setMobileNumber(loaded.mobileNumber);
          setAddress(loaded.address);
          setNicNumber(loaded.nicNumber);
          setNicFrontPath(loaded.nicFrontPath);
          setNicBackPath(loaded.nicBackPath);

          const [fu, bu] = await Promise.all([
            signedUrlForPath(loaded.nicFrontPath),
            signedUrlForPath(loaded.nicBackPath),
          ]);
          if (!mounted) return;
          setNicFrontPreview(fu);
          setNicBackPreview(bu);
        }
      }
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const pickAndUpload = async (side: 'front' | 'back', source: 'camera' | 'library') => {
    if (!userId) {
      appAlert('Profile', 'You must be signed in.');
      return;
    }

    if (source === 'camera') {
      const cam = await ImagePicker.requestCameraPermissionsAsync();
      if (!cam.granted) {
        appAlert('Camera', 'Camera permission is required to take a photo.');
        return;
      }
    } else {
      const lib = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!lib.granted) {
        appAlert('Photos', 'Photo library permission is required to choose an image.');
        return;
      }
    }

    const options: ImagePicker.ImagePickerOptions = {
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: false,
      quality: 0.85,
    };

    const launched =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);

    if (launched.canceled || !launched.assets?.[0]?.uri) return;

    const uri = launched.assets[0].uri;
    if (side === 'front') setUploadingFront(true);
    else setUploadingBack(true);

    const { path, error } = await uploadNicDocument(uri, userId, side);

    if (side === 'front') setUploadingFront(false);
    else setUploadingBack(false);

    if (error || !path) {
      appAlert('Upload failed', error ?? 'Could not upload image.');
      return;
    }

    if (side === 'front') {
      setNicFrontPath(path);
      void refreshPreview(path, 'front');
    } else {
      setNicBackPath(path);
      void refreshPreview(path, 'back');
    }
  };

  const saveProfile = async () => {
    if (!userId) {
      appAlert('Profile', 'You must be signed in to update profile details.');
      return;
    }

    setSaving(true);
    const { error } = await saveTeacherProfileFields({
      userId,
      firstName,
      lastName,
      mobileNumber,
      address,
      nicNumber,
      nicFrontPath,
      nicBackPath,
    });
    setSaving(false);

    if (error) {
      appAlert('Profile update failed', error);
      return;
    }
    appAlert('Profile updated', 'Your changes were saved.');
  };

  const renderNicSection = (side: 'front' | 'back') => {
    const uploading = side === 'front' ? uploadingFront : uploadingBack;
    const preview = side === 'front' ? nicFrontPreview : nicBackPreview;
    const label = side === 'front' ? 'NIC front side' : 'NIC back side';

    return (
      <View style={styles.field}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.nicPreviewBox}>
          {uploading ? (
            <ActivityIndicator color={BRAND_BLUE} style={styles.nicPreviewLoader} />
          ) : preview ? (
            <Image source={{ uri: preview }} style={styles.nicPreviewImage} contentFit="cover" />
          ) : (
            <Text style={styles.nicPreviewPlaceholder}>No image yet</Text>
          )}
        </View>
        <View style={styles.nicActions}>
          <Pressable
            accessibilityRole="button"
            onPress={() => void pickAndUpload(side, 'library')}
            disabled={uploading}
            style={({ pressed }) => [
              styles.secondaryBtn,
              styles.nicActionBtn,
              pressed && styles.secondaryBtnPressed,
              uploading && styles.btnDisabled,
            ]}>
            <Ionicons name="images-outline" size={18} color={BRAND_BLUE_DARK} />
            <Text style={styles.secondaryBtnText}>Gallery</Text>
          </Pressable>
          {Platform.OS !== 'web' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => void pickAndUpload(side, 'camera')}
              disabled={uploading}
              style={({ pressed }) => [
                styles.secondaryBtn,
                styles.nicActionBtn,
                pressed && styles.secondaryBtnPressed,
                uploading && styles.btnDisabled,
              ]}>
              <Ionicons name="camera-outline" size={18} color={BRAND_BLUE_DARK} />
              <Text style={styles.secondaryBtnText}>Camera</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <DashboardScreenShell
      showBack
      title="Profile"
      onBack={() => routerBackOrReplace(router, appHref(AppRoutes.teacherDashboard))}
      padContent={false}>
      <KeyboardAwareScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardExtraPadding={32}>
        <View style={styles.card}>
          <Text style={styles.subtitle}>Update your personal details used across your account.</Text>

          {loading ? (
            <View style={styles.loaderWrap}>
              <ActivityIndicator color={BRAND_BLUE} />
            </View>
          ) : (
            <>
              <View style={styles.rowTwo}>
                <View style={[styles.field, styles.fieldGrow]}>
                  <Text style={styles.label}>First name</Text>
                  <TextInput
                    value={firstName}
                    onChangeText={setFirstName}
                    placeholder="First name"
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
                <View style={[styles.field, styles.fieldGrow]}>
                  <Text style={styles.label}>Last name</Text>
                  <TextInput
                    value={lastName}
                    onChangeText={setLastName}
                    placeholder="Last name"
                    autoCapitalize="words"
                    style={styles.input}
                  />
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput value={email} editable={false} style={[styles.input, styles.inputDisabled]} />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Mobile number</Text>
                <TextInput
                  value={mobileNumber}
                  onChangeText={setMobileNumber}
                  placeholder="e.g. 0771234567"
                  keyboardType="phone-pad"
                  style={styles.input}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Address</Text>
                <TextInput
                  value={address}
                  onChangeText={setAddress}
                  placeholder="Street, city, postal code"
                  multiline
                  style={[styles.input, styles.inputMultiline]}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>NIC number</Text>
                <TextInput
                  value={nicNumber}
                  onChangeText={setNicNumber}
                  placeholder="National Identity Card number"
                  autoCapitalize="characters"
                  style={styles.input}
                />
              </View>

              {renderNicSection('front')}
              {renderNicSection('back')}

              <Pressable
                accessibilityRole="button"
                onPress={() => void saveProfile()}
                disabled={saving}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  pressed && styles.primaryBtnPressed,
                  saving && styles.primaryBtnDisabled,
                ]}>
                <Ionicons name="save-outline" size={18} color="#FFFFFF" />
                <Text style={styles.primaryBtnText}>{saving ? 'Saving...' : 'Save Profile'}</Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAwareScrollView>
    </DashboardScreenShell>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingBottom: 32, paddingHorizontal: PAGE_EDGE_INSET, paddingTop: 4 },
  card: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    padding: PAGE_EDGE_INSET,
  },
  subtitle: {
    fontSize: 14,
    color: TEXT_MUTED,
    lineHeight: 20,
  },
  loaderWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 72,
  },
  rowTwo: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
  },
  fieldGrow: { flex: 1, marginTop: 0 },
  field: {
    marginTop: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: BRAND_BLUE_DARK,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 12,
    color: BRAND_BLUE_DARK,
    backgroundColor: '#FFFFFF',
  },
  inputMultiline: {
    minHeight: 88,
    paddingTop: 12,
    textAlignVertical: 'top',
  },
  inputDisabled: {
    backgroundColor: '#F1F5F9',
    color: TEXT_MUTED,
  },
  nicPreviewBox: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    height: 160,
    backgroundColor: '#F8FAFC',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  nicPreviewImage: {
    width: '100%',
    height: '100%',
  },
  nicPreviewPlaceholder: {
    color: TEXT_MUTED,
    fontSize: 14,
  },
  nicPreviewLoader: {
    paddingVertical: 24,
  },
  nicActions: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  nicActionBtn: {
    flex: 1,
    minWidth: 120,
    justifyContent: 'center',
  },
  secondaryBtn: {
    borderWidth: 1.5,
    borderColor: BORDER,
    borderRadius: 12,
    minHeight: 44,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
  },
  secondaryBtnPressed: {
    backgroundColor: '#F8FAFC',
  },
  secondaryBtnText: {
    color: BRAND_BLUE_DARK,
    fontSize: 14,
    fontWeight: '700',
  },
  btnDisabled: {
    opacity: 0.55,
  },
  primaryBtn: {
    marginTop: 18,
    backgroundColor: BRAND_BLUE,
    borderRadius: 12,
    minHeight: 44,
    alignSelf: 'flex-start',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryBtnPressed: {
    opacity: 0.85,
  },
  primaryBtnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
