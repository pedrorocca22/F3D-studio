import fs from 'fs';
const { default: pngToIco } = await import('png-to-ico');

const files = [
  'icon_frames/16.png',
  'icon_frames/32.png',
  'icon_frames/48.png',
  'icon_frames/64.png',
  'icon_frames/128.png',
  'icon_frames/256.png',
];

try {
  const buf = await pngToIco(files);
  fs.writeFileSync('public/f3d_icon.ico', buf);
  console.log('ICO generado correctamente con', files.length, 'frames');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
}
