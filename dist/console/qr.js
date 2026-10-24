import QRCode from 'qrcode';
/**
 * Screen-sized SVG QR for the offer URI. Level L is plenty for a phone camera
 * reading a crisp desktop render; margin 1 keeps the widget compact.
 */
export async function qrSvg(text) {
    return QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'L', margin: 1, width: 176 });
}
//# sourceMappingURL=qr.js.map