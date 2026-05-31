const { createCanvas } = require('canvas');
const fs = require('fs');

function createIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const r = size / 2;

  // Background circle with gradient
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#10b981');  // emerald-500
  grad.addColorStop(1, '#059669');  // emerald-600

  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Inner shadow for depth
  const innerGrad = ctx.createRadialGradient(r * 0.7, r * 0.7, 0, r, r, r);
  innerGrad.addColorStop(0, 'rgba(255,255,255,0.15)');
  innerGrad.addColorStop(1, 'rgba(0,0,0,0.1)');
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fillStyle = innerGrad;
  ctx.fill();

  // Dollar sign
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${Math.round(size * 0.55)}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', r, r + size * 0.02);

  return canvas;
}

// Generate PNG files at different sizes
const sizes = [16, 32, 48, 64, 128, 256];
const pngBuffers = [];

for (const s of sizes) {
  const canvas = createIcon(s);
  pngBuffers.push(canvas.toBuffer('image/png'));
  fs.writeFileSync(`icon-${s}.png`, canvas.toBuffer('image/png'));
}

console.log('PNG icons generated');

// Create ICO file (contains 16, 32, 48 sizes)
function createICO(pngs) {
  // ICO header: 6 bytes
  // Directory entries: 16 bytes each
  // Image data: raw PNG

  const headerSize = 6;
  const entrySize = 16;
  const entries = pngs.slice(0, 3); // 16, 32, 48 for ICO
  const directorySize = entrySize * entries.length;

  const totalSize = headerSize + directorySize + entries.reduce((s, b) => s + b.length, 0);
  const buf = Buffer.alloc(totalSize);

  // Header
  buf.writeUInt16LE(0, 0);    // reserved
  buf.writeUInt16LE(1, 2);    // type: ICO
  buf.writeUInt16LE(entries.length, 4); // count

  let dataOffset = headerSize + directorySize;

  for (let i = 0; i < entries.length; i++) {
    const entryOffset = headerSize + i * entrySize;
    const png = entries[i];
    const size = sizes[i];

    buf.writeUInt8(size === 256 ? 0 : size, entryOffset + 0);    // width
    buf.writeUInt8(size === 256 ? 0 : size, entryOffset + 1);    // height
    buf.writeUInt8(0, entryOffset + 2);    // color palette
    buf.writeUInt8(0, entryOffset + 3);    // reserved
    buf.writeUInt16LE(1, entryOffset + 4); // color planes
    buf.writeUInt16LE(32, entryOffset + 6); // bits per pixel
    buf.writeUInt32LE(png.length, entryOffset + 8);  // data size
    buf.writeUInt32LE(dataOffset, entryOffset + 12); // data offset

    png.copy(buf, dataOffset);
    dataOffset += png.length;
  }

  return buf;
}

const icoBuffer = createICO(pngBuffers);
fs.writeFileSync('icon.ico', icoBuffer);
console.log('ICO file generated: icon.ico');
