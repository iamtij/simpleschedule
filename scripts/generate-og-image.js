/**
 * Build a 1200×630 Open Graph image with the logo centered and padded.
 * Stops WhatsApp/Telegram/etc. from cropping a wide logo PNG incorrectly.
 * Run: npm run og-image  (after updating public/images/isked-logo.png)
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const root = path.join(__dirname, '..', 'public');
const src = path.join(root, 'images', 'isked-logo.png');
const out = path.join(root, 'images', 'og-image.png');

const W = 1200;
const H = 630;
// Clean white so the preview feels full — tweak if you prefer off-white
const bg = { r: 255, g: 255, b: 255, alpha: 1 };
/*
 * Center-square crops use the middle 630×630 of this 1200×630 frame (x ≈ 285–915).
 * Max logo width ~628 keeps the mark fully inside that zone with a tiny safety margin.
 * Tall bound lets `fit: inside` scale width up as large as possible for a wide logo.
 */
const maxLogoW = 628;
const maxLogoH = 520;
const maxW = maxLogoW;
const maxH = maxLogoH;

async function main() {
  if (!fs.existsSync(src)) {
    console.error('Missing', src);
    process.exit(1);
  }

  const resized = await sharp(src)
    .resize(maxW, maxH, {
      fit: 'inside',
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();

  const meta = await sharp(resized).metadata();
  const left = Math.max(0, Math.round((W - meta.width) / 2));
  const top = Math.max(0, Math.round((H - meta.height) / 2));

  await sharp({
    create: {
      width: W,
      height: H,
      channels: 4,
      background: bg,
    },
  })
    .composite([{ input: resized, left, top }])
    .png()
    .toFile(out);

  console.log('Wrote', out, `(${W}×${H}, logo ${meta.width}×${meta.height} @ ${left},${top})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
