// Generate PNG and ICO favicons from an SVG source using sharp + to-ico
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import pngToIco from 'png-to-ico';

const root = path.resolve(process.cwd());
const srcSvg = path.join(root, 'public', 'favicon_source.svg');
const outPng = path.join(root, 'public', 'favicon.png');
const outIco = path.join(root, 'public', 'favicon.ico');

async function ensureSource() {
  try {
    await fs.access(srcSvg);
  } catch {
    // If missing, write a simple space-like rocket SVG source
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="12" ry="12" fill="#0d1323"/>
  <g transform="translate(32,36) rotate(-35)">
    <ellipse cx="0" cy="16" rx="4" ry="8" fill="#ff6a00"/>
    <ellipse cx="0" cy="20" rx="2" ry="4" fill="#ffd400"/>
    <rect x="-5" y="-14" width="10" height="28" rx="5" fill="#cfd5e2" stroke="#6a738b" stroke-width="2"/>
    <path d="M -5 -14 Q 0 -22 5 -14 Z" fill="#cfd5e2" stroke="#6a738b" stroke-width="2"/>
    <rect x="-6" y="6" width="12" height="4" rx="2" fill="#6a738b"/>
  </g>
</svg>`;
    await fs.writeFile(srcSvg, svg, 'utf8');
  }
}

async function build() {
  await ensureSource();
  // Generate a 64x64 PNG
  const png64 = await sharp(srcSvg).resize(64, 64, { fit: 'contain' }).png().toBuffer();
  await fs.writeFile(outPng, png64);

  // Generate ICO (multiple sizes)
  const sizes = [16, 32, 48];
  const pngs = await Promise.all(
    sizes.map((s) => sharp(srcSvg).resize(s, s, { fit: 'contain' }).png().toBuffer())
  );
  const ico = await pngToIco(pngs);
  await fs.writeFile(outIco, ico);

  console.log('Favicons generated:', outPng, outIco);
}

build().catch((err) => {
  console.error('build-icons failed:', err);
  process.exit(1);
});
