const fs = require('fs');
const path = require('path');

const assetsDir = path.join(__dirname, '../assets');
if (!fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetsDir, { recursive: true });
}

// Generate a valid 16x16 32bpp ICO file buffer
function createIcoBuffer() {
  const width = 16;
  const height = 16;
  const pixelCount = width * height;
  
  // ICONDIR header (6 bytes)
  const iconDir = Buffer.from([0, 0, 1, 0, 1, 0]); 

  // Bitmap Header (40 bytes)
  const bih = Buffer.alloc(40);
  bih.writeUInt32LE(40, 0); // header size
  bih.writeInt32LE(width, 4);
  bih.writeInt32LE(height * 2, 8); // XOR + AND height
  bih.writeUInt16LE(1, 12); // planes
  bih.writeUInt16LE(32, 14); // bpp
  bih.writeUInt32LE(0, 16); // compression
  bih.writeUInt32LE(pixelCount * 4, 20); // image size

  // XOR Pixel Data (Purple / Violet: BGRA = 241, 102, 99, 255)
  const xorData = Buffer.alloc(pixelCount * 4);
  for (let i = 0; i < pixelCount; i++) {
    xorData[i * 4 + 0] = 241; // B
    xorData[i * 4 + 1] = 102; // G
    xorData[i * 4 + 2] = 150; // R
    xorData[i * 4 + 3] = 255; // A
  }

  // AND Mask (16x16 bits = 32 bytes of zeros for full opacity)
  const andMask = Buffer.alloc(32, 0);

  const imageData = Buffer.concat([bih, xorData, andMask]);

  // ICONDIRENTRY (16 bytes)
  const entry = Buffer.alloc(16);
  entry[0] = width;
  entry[1] = height;
  entry[2] = 0; // color count
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(imageData.length, 8); // bytes in resource
  entry.writeUInt32LE(6 + 16, 12); // offset

  return Buffer.concat([iconDir, entry, imageData]);
}

const icoPath = path.join(assetsDir, 'icon.ico');
fs.writeFileSync(icoPath, createIcoBuffer());
console.log('Created valid icon.ico at:', icoPath);
