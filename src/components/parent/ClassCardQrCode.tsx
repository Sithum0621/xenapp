import { useEffect, useState } from 'react';
import { Image, View } from 'react-native';
import QRCode from 'qrcode';

export type ClassCardQrCodeProps = {
  value: string;
  size: number;
};

/** Web: SVG QR via qrcode (avoids react-native-svg web bundle issues). */
export function ClassCardQrCode({ value, size }: ClassCardQrCodeProps) {
  const [dataUri, setDataUri] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void QRCode.toString(value, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      .then((svg) => {
        if (cancelled) return;
        const encoded = encodeURIComponent(svg).replace(/'/g, '%27');
        setDataUri(`data:image/svg+xml,${encoded}`);
      })
      .catch(() => {
        if (!cancelled) setDataUri(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  if (!dataUri) {
    return <View style={{ width: size, height: size }} />;
  }

  return (
    <Image
      source={{ uri: dataUri }}
      style={{ width: size, height: size }}
      accessibilityIgnoresInvertColors
    />
  );
}
