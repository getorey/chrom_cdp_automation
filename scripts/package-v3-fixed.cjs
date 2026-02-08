const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const RELEASE_DIR = 'release/chrome-cdp-windows-v3';
const ZIP_NAME = 'chrome-cdp-windows-v3.zip';

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

async function createZip(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    output.on('close', () => resolve());
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function packageDistribution() {
  console.log('📦 Starting packaging process (v3 - NO node_modules in snapshot)...');

  // Clean up release dir
  if (fs.existsSync(RELEASE_DIR)) fs.rmSync(RELEASE_DIR, { recursive: true });
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // STEP 1: Move node_modules away temporarily
  console.log('🔧 Moving node_modules temporarily...');
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  const nodeModulesBackup = path.join(process.cwd(), 'node_modules_backup_pkg');
  
  if (fs.existsSync(nodeModulesPath)) {
    fs.renameSync(nodeModulesPath, nodeModulesBackup);
  }

  try {
    // STEP 2: Build bundle WITHOUT node_modules present
    console.log('🔨 Building bundle...');
    execSync(
      'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v3.js --format=cjs --external:sharp --external:playwright --external:@playwright/test --external:@techstark/opencv-js --external:cron --external:node-cron',
      { stdio: 'inherit' }
    );

    // STEP 3: Create pkg executable WITHOUT node_modules
    console.log('🔨 Creating executable with pkg (NO node_modules)...');
    execSync(
      `npx pkg dist/bundle-v3.js --compress GZip --targets node18-win-x64 --output ${path.join(RELEASE_DIR, 'chrome-cdp.exe')}`,
      { stdio: 'inherit' }
    );
    console.log('✅ Created executable (without node_modules in snapshot)');

  } finally {
    // STEP 4: Restore node_modules
    console.log('🔧 Restoring node_modules...');
    if (fs.existsSync(nodeModulesBackup)) {
      fs.renameSync(nodeModulesBackup, nodeModulesPath);
    }
  }

  // STEP 5: Copy only required node_modules to release folder
  console.log('📦 Copying required dependencies...');
  const requiredModules = ['playwright', '@playwright', 'commander', 'js-yaml', 'ajv'];
  for (const mod of requiredModules) {
    const src = path.join('node_modules', mod);
    const dest = path.join(RELEASE_DIR, 'node_modules', mod);
    if (fs.existsSync(src)) {
      copyDir(src, dest);
      console.log(`  ✅ ${mod}`);
    }
  }

  // STEP 6: Copy config and assets
  ['config.json', 'flows', 'docs', 'templates'].forEach(item => {
    if (fs.existsSync(item)) {
      const dest = path.join(RELEASE_DIR, item);
      if (fs.statSync(item).isDirectory()) copyDir(item, dest);
      else fs.copyFileSync(item, dest);
      console.log(`  ✅ ${item}`);
    }
  });

  // STEP 7: Create run.bat
  const batContent = `@echo off
setlocal

echo [Chrome CDP Automation Launcher v3]
echo.

:: Set NODE_PATH to include local node_modules
set "NODE_PATH=%~dp0node_modules"

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    if not exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
        echo [WARNING] Chrome executable not found.
        echo Please ensure Chrome is installed.
    )
)

:: Check configuration
if not exist config.json (
    echo [ERROR] config.json not found!
    pause
    exit /b 1
)

:: Run the application
echo Starting Chrome CDP Automation...
"%~dp0chrome-cdp.exe" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'run.bat'), batContent);
  console.log('  ✅ run.bat');

  // STEP 8: Create README
  const readme = `# Chrome CDP Automation v3

Prerequisites:
1. Chrome must be installed
2. Chrome must be running with: chrome.exe --remote-debugging-port=9222

Usage:
  run.bat run flows\\example-flow.yaml

Or directly:
  set NODE_PATH=%CD%\\node_modules
  chrome-cdp.exe run flows\\example-flow.yaml
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readme);

  // STEP 9: Create ZIP
  console.log('📦 Creating ZIP archive...');
  await createZip(RELEASE_DIR, ZIP_NAME);
  const stats = fs.statSync(ZIP_NAME);
  console.log(`✅ Created ${ZIP_NAME} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`📍 Location: ${path.resolve(ZIP_NAME)}`);
}

packageDistribution().catch(err => {
  console.error('❌ Error:', err.message);
  // Ensure node_modules is restored even on error
  const nodeModulesPath = path.join(process.cwd(), 'node_modules');
  const nodeModulesBackup = path.join(process.cwd(), 'node_modules_backup_pkg');
  if (!fs.existsSync(nodeModulesPath) && fs.existsSync(nodeModulesBackup)) {
    fs.renameSync(nodeModulesBackup, nodeModulesPath);
    console.log('🔧 Restored node_modules after error');
  }
  process.exit(1);
});
