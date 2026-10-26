import QRCode from 'qrcode';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const outputDir = new URL('../assets/marketing/', import.meta.url);
await mkdir(outputDir, { recursive: true });

const appUrl = 'https://cotton-roots-private-trial.onrender.com/access';
await QRCode.toFile(fileURLToPath(new URL('cotton-roots-app-qr.png', outputDir)), appUrl, {
  errorCorrectionLevel: 'H',
  margin: 4,
  width: 1400,
  color: { dark: '#123E31', light: '#FFFFFF' },
});

console.log(`Created app QR for ${appUrl}`);
