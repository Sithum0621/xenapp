import QRCode from 'react-native-qrcode-svg';

export type ClassCardQrCodeProps = {
  value: string;
  size: number;
};

/** iOS/Android: native SVG QR renderer. */
export function ClassCardQrCode({ value, size }: ClassCardQrCodeProps) {
  return (
    <QRCode value={value} size={size} color="#000000" backgroundColor="#FFFFFF" />
  );
}
