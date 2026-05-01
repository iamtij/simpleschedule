/**
 * Build favicon + touch icons from public/images/favicon-sources/
 *   32.png, 64.png, 128.png (export new versions from design when the icon changes)
 * Run: npm run favicons
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'public');
const sources = path.join(root, 'images', 'favicon-sources');
const s32 = path.join(sources, '32.png');
const s64 = path.join(sources, '64.png');
const s128 = path.join(sources, '128.png');

async function main() {
  for (const f of [s32, s64, s128]) {
    if (!fs.existsSync(f)) {
      console.error('Missing source icon:', f);
      process.exit(1);
    }
  }

  // Exact 32px asset as delivered
  fs.copyFileSync(s32, path.join(root, 'favicon-32x32.png'));
  console.log('Wrote', path.join(root, 'favicon-32x32.png'), '(from 32.png)');

  await sharp(s32)
    .resize(16, 16, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toFile(path.join(root, 'favicon-16x16.png'));
  console.log('Wrote', path.join(root, 'favicon-16x16.png'));

  await sharp(s64)
    .resize(96, 96, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toFile(path.join(root, 'favicon-96x96.png'));
  console.log('Wrote', path.join(root, 'favicon-96x96.png'));

  await sharp(s128)
    .resize(180, 180, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toFile(path.join(root, 'apple-touch-icon.png'));
  console.log('Wrote', path.join(root, 'apple-touch-icon.png'));

  await sharp(s128)
    .resize(192, 192, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toFile(path.join(root, 'android-chrome-192x192.png'));
  console.log('Wrote', path.join(root, 'android-chrome-192x192.png'));

  await sharp(s128)
    .resize(512, 512, { kernel: sharp.kernel.lanczos3, fit: 'fill' })
    .png()
    .toFile(path.join(root, 'android-chrome-512x512.png'));
  console.log('Wrote', path.join(root, 'android-chrome-512x512.png'));

  const { default: pngToIco } = await import('png-to-ico');
  const ico = await pngToIco([
    path.join(root, 'favicon-16x16.png'),
    path.join(root, 'favicon-32x32.png'),
  ]);
  fs.writeFileSync(path.join(root, 'favicon.ico'), Buffer.from(ico));
  console.log('Wrote', path.join(root, 'favicon.ico'));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
