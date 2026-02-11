const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TEMP_DIR = 'temp_pkg_build';
const PLAYWRIGHT_DIR = 'node_modules/playwright';
const PLAYWRIGHT_CORE_DIR = 'node_modules/playwright-core';
const BUNDLE_FILE = 'dist/bundle.js';
const LAUNCHER_FILE = 'src/launcher.cjs';
const DIST_LAUNCHER = 'dist/launcher.cjs';
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

async function buildWithLauncher() {
  console.log('Preparing to build with launcher...');
  
  // Copy launcher to dist
  fs.copyFileSync(LAUNCHER_FILE, DIST_LAUNCHER);
  console.log(`Copied launcher to ${DIST_LAUNCHER}`);
  
  // Create temp directory
  if (!fs.existsSync(TEMP_DIR)) {
    fs.mkdirSync(TEMP_DIR, { recursive: true });
  }

  // Move playwright modules out of node_modules so pkg doesn't include them
  moveDir(PLAYWRIGHT_DIR, path.join(TEMP_DIR, 'playwright'));
  moveDir(PLAYWRIGHT_CORE_DIR, path.join(TEMP_DIR, 'playwright-core'));

  try {
    // Run pkg on launcher instead of bundle
    console.log('Running pkg on launcher...');
    execSync(
      `pkg ${DIST_LAUNCHER} --config pkg.config.json --compress GZip --targets node18-win-x64 --output ${OUTPUT_EXE}`,
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

  // Restore playwright modules for packaging
  restoreDir(path.join(TEMP_DIR, 'playwright'), PLAYWRIGHT_DIR);
  restoreDir(path.join(TEMP_DIR, 'playwright-core'), PLAYWRIGHT_CORE_DIR);

  // Clean up temp directory
  if (fs.existsSync(TEMP_DIR)) {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
    console.log('Cleaned up temp directory');
  }

  console.log('Build completed!');
}

buildWithLauncher().catch(err => {
  console.error('Build script failed:', err);
  // Attempt restore on error
  restoreDir(path.join(TEMP_DIR, 'playwright'), PLAYWRIGHT_DIR);
  restoreDir(path.join(TEMP_DIR, 'playwright-core'), PLAYWRIGHT_CORE_DIR);
  process.exit(1);
});
