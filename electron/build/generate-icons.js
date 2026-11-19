/**
 * Icon Generation Script for Electron Build
 * 
 * This script converts the SVG icon to the required formats:
 * - icon.ico (Windows)
 * - icon.icns (macOS)
 * - icon.png (Linux)
 * 
 * Requirements:
 * - sharp: npm install sharp
 * - Or use online converters / ImageMagick
 * 
 * Usage: node generate-icons.js
 */

const fs = require('fs');
const path = require('path');

const SVG_PATH = path.join(__dirname, 'icon.svg');
const OUTPUT_DIR = __dirname;

console.log('Icon generation script for Resilient Research App');
console.log('================================================');
console.log('');
console.log('This script requires the "sharp" package to generate icons.');
console.log('Install it with: npm install sharp');
console.log('');

// Check if sharp is available
try {
  require.resolve('sharp');
} catch (e) {
  console.log('sharp not found. Please run: npm install sharp');
  console.log('');
  console.log('Alternative: Use online converters or ImageMagick:');
  console.log('  # Windows .ico (256x256)');
  console.log('  magick icon.svg -define icon:auto-resize=256,128,64,48,32,16 icon.ico');
  console.log('');
  console.log('  # macOS .icns');
  console.log('  mkdir -p icon.iconset');
  console.log('  for size in 16 32 64 128 256 512 1024; do');
  console.log('    magick icon.svg -resize ${size}x${size} icon.iconset/icon_${size}x${size}.png');
  console.log('    magick icon.svg -resize $((size*2))x$((size*2)) icon.iconset/icon_${size}x${size}@2x.png');
  console.log('  done');
  console.log('  iconutil -c icns icon.iconset -o icon.icns');
  console.log('');
  console.log('  # Linux .png (512x512)');
  console.log('  magick icon.svg -resize 512x512 icon.png');
  process.exit(1);
}

const sharp = require('sharp');

async function generateIcons() {
  console.log('Generating icons...');
  
  // Generate Windows .ico
  await sharp(SVG_PATH)
    .resize(256, 256)
    .toFile(path.join(OUTPUT_DIR, 'icon.ico'))
    .then(() => console.log('✓ icon.ico generated'))
    .catch(err => console.error('✗ icon.ico failed:', err.message));
  
  // Generate macOS .icns (via iconset)
  const iconsetDir = path.join(OUTPUT_DIR, 'icon.iconset');
  if (!fs.existsSync(iconsetDir)) {
    fs.mkdirSync(iconsetDir, { recursive: true });
  }
  
  const sizes = [16, 32, 64, 128, 256, 512, 1024];
  for (const size of sizes) {
    await sharp(SVG_PATH)
      .resize(size, size)
      .toFile(path.join(iconsetDir, `icon_${size}x${size}.png`))
      .then(() => console.log(`✓ icon_${size}x${size}.png generated`))
      .catch(err => console.error(`✗ icon_${size}x${size}.png failed:`, err.message));
    
    // @2x versions
    if (size <= 512) {
      await sharp(SVG_PATH)
        .resize(size * 2, size * 2)
        .toFile(path.join(iconsetDir, `icon_${size}x${size}@2x.png`))
        .then(() => console.log(`✓ icon_${size}x${size}@2x.png generated`))
        .catch(err => console.error(`✗ icon_${size}x${size}@2x.png failed:`, err.message));
    }
  }
  
  // Generate .icns using iconutil (macOS only)
  if (process.platform === 'darwin') {
    const { execSync } = require('child_process');
    try {
      execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(OUTPUT_DIR, 'icon.icns')}"`, { stdio: 'inherit' });
      console.log('✓ icon.icns generated');
    } catch (err) {
      console.error('✗ icon.icns failed:', err.message);
    }
  } else {
    console.log('Note: icon.icns can only be generated on macOS. Use the iconset folder on a Mac.');
  }
  
  // Generate Linux .png
  await sharp(SVG_PATH)
    .resize(512, 512)
    .toFile(path.join(OUTPUT_DIR, 'icon.png'))
    .then(() => console.log('✓ icon.png generated'))
    .catch(err => console.error('✗ icon.png failed:', err.message));
  
  console.log('\nIcon generation complete!');
  console.log('Files created in:', OUTPUT_DIR);
}

generateIcons().catch(console.error);