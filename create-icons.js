const { PNG } = require('pngjs');
const fs = require('fs');
const path = require('path');

// Purple circle (#6366f1) on dark background (#1e1e2e)
function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.38;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) * 4;
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      if (dist <= r) {
        png.data[idx]     = 0x63; // R
        png.data[idx + 1] = 0x66; // G
        png.data[idx + 2] = 0xf1; // B
        png.data[idx + 3] = 0xff; // A
      } else {
        png.data[idx]     = 0x1e;
        png.data[idx + 1] = 0x1e;
        png.data[idx + 2] = 0x2e;
        png.data[idx + 3] = 0xff;
      }
    }
  }

  const buf = PNG.sync.write(png);
  const outPath = path.join(__dirname, 'icons', `icon-${size}.png`);
  fs.writeFileSync(outPath, buf);
  console.log(`Created ${outPath}`);
}

[16, 48, 128].forEach(createIcon);
