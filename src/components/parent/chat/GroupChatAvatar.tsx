import { Image } from 'expo-image';
import { memo } from 'react';
import { StyleSheet, View } from 'react-native';

import { Text } from '@/src/theme/Text';
import { FontFamily } from '@/src/theme/fonts';
import { groupAvatarInitials } from '@/src/utils/groupChatFormat';

const BRAND_BLUE = '#123B7A';
const AVATAR_BG = '#E3EEFF';

type Props = {
  groupName: string;
  size?: number;
  imageUrl?: string | null;
};

function GroupChatAvatar({ groupName, size = 52, imageUrl }: Props) {
  const fontSize = size >= 48 ? 18 : size >= 36 ? 14 : 12;

  if (imageUrl) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
          },
        ]}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.circle,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}>
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
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(18, 59, 122, 0.12)',
  },
  initials: {
    fontFamily: FontFamily.bold,
    color: BRAND_BLUE,
    letterSpacing: 0.5,
  },
});
