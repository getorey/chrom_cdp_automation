const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

const sourceDir = 'release/chrome-cdp-windows-v2';
const outputPath = 'chrome-cdp-windows-v2.zip';

async function createZip() {
  console.log('📦 Creating ZIP archive...');
  
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      const sizeMB = (archive.pointer() / 1024 / 1024).toFixed(1);
      console.log(`✅ Archive created: ${archive.pointer()} bytes (${sizeMB} MB)`);
      console.log(`📍 Location: ${path.resolve(outputPath)}`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.on('progress', (data) => {
      process.stdout.write(`\r  Progress: ${data.entries.processed} entries processed...`);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

createZip().catch(err => {
  console.error('❌ Failed to create ZIP:', err.message);
  process.exit(1);
});
