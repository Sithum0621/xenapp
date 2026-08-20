import { Image } from 'expo-image';
import { memo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { BrandAssets, isAppCommunityTitle } from '@/src/constants/brand';
import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { groupAvatarInitials } from '@/src/utils/groupChatFormat';

const BRAND_BLUE = '#041830';
const AVATAR_BG = '#EEF2F7';

type Props = {
  groupName: string;
  size?: number;
  imageUrl?: string | null;
  /** Force the MyTuition mark (community chat / brand profile). */
  useBrandMark?: boolean;
};

function GroupChatAvatar({ groupName, size = 52, imageUrl, useBrandMark }: Props) {
  const fontSize = size >= 48 ? 18 : size >= 36 ? 14 : 12;
  const circleStyle = [
    styles.circle,
    {
      width: size,
      height: size,
      borderRadius: size / 2,
    },
  ];

  if (imageUrl) {
    return <Image source={{ uri: imageUrl }} style={circleStyle} contentFit="cover" />;
  }

  if (useBrandMark || isAppCommunityTitle(groupName)) {
    const markSource = Platform.OS === 'web' ? BrandAssets.markWebp : BrandAssets.markPng;
    return (
      <View style={circleStyle}>
        <Image source={markSource} style={{ width: size, height: size }} contentFit="cover" />
      </View>
    );
  }

  return (
    <View style={circleStyle}>
      <Text style={[styles.initials, { fontSize }]}>{groupAvatarInitials(groupName)}</Text>
    </View>
  );
}

export default memo(GroupChatAvatar);

const styles = StyleSheet.create({
  circle: {
    backgroundColor: AVATAR_BG,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18, 59, 122, 0.12)',
  },
  initials: {
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
    letterSpacing: 0.5,
  },
});
