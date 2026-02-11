const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMP_DIR = 'temp_pkg_build';
const PLAYWRIGHT_DIR = 'node_modules/playwright';
const PLAYWRIGHT_CORE_DIR = 'node_modules/playwright-core';
const BUNDLE_FILE = 'dist/bundle.js';
const OUTPUT_EXE = 'dist/chrome-cdp.exe';

function moveDir(src, dest) {
  if (fs.existsSync(src)) {
    if (!fs.existsSync(path.dirname(dest))) {
      fs.mkdirSync(path.dirname(dest), { recursive: true });
    }
    fs.renameSync(src, dest);
    console.log(`Moved ${src} -> ${dest}`);
  }
}

function restoreDir(src, dest) {
  if (fs.existsSync(src)) {
    if (fs.existsSync(dest)) {
      fs.rmSync(dest, { recursive: true, force: true });
    }
    fs.renameSync(src, dest);
    console.log(`Restored ${src} -> ${dest}`);
  }
}

async function buildWithExcludedPlaywright() {
  console.log('Preparing to build with excluded playwright...');
  
  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Move playwright modules out of node_modules
  moveDir(PLAYWRIGHT_DIR, path.join(TEMP_DIR, 'playwright'));
  moveDir(PLAYWRIGHT_CORE_DIR, path.join(TEMP_DIR, 'playwright-core'));

  try {
    // Run pkg
    console.log('Running pkg...');
    execSync(
      `pkg ${BUNDLE_FILE} --config pkg.config.json --compress GZip --targets node18-win-x64 --output ${OUTPUT_EXE}`,
      { stdio: 'inherit' }
    );
    console.log('pkg completed successfully');
  } catch (error) {
    console.error('pkg failed:', error.message);
    // Restore even if failed
    restoreDir(path.join(TEMP_DIR, 'playwright'), PLAYWRIGHT_DIR);
    restoreDir(path.join(TEMP_DIR, 'playwright-core'), PLAYWRIGHT_CORE_DIR);
    process.exit(1);
  }

  // Restore playwright modules
  restoreDir(path.join(TEMP_DIR, 'playwright'), PLAYWRIGHT_DIR);
  restoreDir(path.join(TEMP_DIR, 'playwright-core'), PLAYWRIGHT_CORE_DIR);

  // Clean up temp directory
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('Cleaned up temp directory');
  }

  console.log('Build completed!');
}

buildWithExcludedPlaywright().catch(err => {
  console.error('Build script failed:', err);
  // Attempt restore on error
  restoreDir(path.join(TEMP_DIR, 'playwright'), PLAYWRIGHT_DIR);
  restoreDir(path.join(TEMP_DIR, 'playwright-core'), PLAYWRIGHT_CORE_DIR);
  process.exit(1);
});
