const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const BUILD_DIR = 'build-temp-pkg';
const RELEASE_DIR = 'release/chrome-cdp-windows-v3';
const ZIP_NAME = 'chrome-cdp-windows-v3.zip';

function copyDir(src, dest, exclude = []) {
  if (!fs.existsSync(src)) return;
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    if (exclude.includes(entry.name)) continue;
    
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) copyDir(srcPath, destPath, exclude);
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
  console.log('📦 Starting packaging process (v3 - isolated build)...');

  // STEP 1: Create clean build directory WITHOUT node_modules
  console.log('🔧 Creating isolated build directory...');
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Copy source files (excluding node_modules)
  const rootFiles = fs.readdirSync(process.cwd(), { withFileTypes: true });
  for (const entry of rootFiles) {
    if (entry.name === 'node_modules' || entry.name === BUILD_DIR || entry.name === RELEASE_DIR) continue;
    
    const srcPath = path.join(process.cwd(), entry.name);
    const destPath = path.join(BUILD_DIR, entry.name);
    
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
  console.log('  ✅ Copied source files (no node_modules)');

  // STEP 2: Build in isolated directory
  console.log('🔨 Building bundle in isolated directory...');
  execSync(
    'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v3.js --format=cjs --external:sharp --external:playwright --external:@playwright/test --external:@techstark/opencv-js --external:cron --external:node-cron',
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 3: Create pkg executable in isolated directory
  console.log('🔨 Creating executable with pkg...');
  const exePath = path.join(process.cwd(), RELEASE_DIR, 'chrome-cdp.exe');
  if (!fs.existsSync(path.dirname(exePath))) fs.mkdirSync(path.dirname(exePath), { recursive: true });
  
  execSync(
    `npx pkg dist/bundle-v3.js --compress GZip --targets node18-win-x64 --output ${exePath}`,
    { stdio: 'inherit', cwd: BUILD_DIR }
  );
  console.log('  ✅ Created executable (clean, no node_modules)');

  // STEP 4: Copy required node_modules from ORIGINAL directory
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

  // STEP 5: Copy config and assets
  ['config.json', 'flows', 'docs', 'templates'].forEach(item => {
    if (fs.existsSync(item)) {
      const dest = path.join(RELEASE_DIR, item);
      if (fs.statSync(item).isDirectory()) copyDir(item, dest);
      else fs.copyFileSync(item, dest);
      console.log(`  ✅ ${item}`);
    }
  });

  // STEP 6: Create run.bat
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

  // STEP 7: Create README
  const readme = `# Chrome CDP Automation v3

This version keeps Playwright OUTSIDE the executable to avoid the
"Invalid host defined options" error.

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

  // STEP 8: Create ZIP
  console.log('📦 Creating ZIP archive...');
  await createZip(RELEASE_DIR, ZIP_NAME);
  const stats = fs.statSync(ZIP_NAME);
  console.log(`✅ Created ${ZIP_NAME} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`📍 Location: ${path.resolve(ZIP_NAME)}`);

  // Cleanup
  console.log('🧹 Cleaning up build directory...');
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('✅ Done!');
}

packageDistribution().catch(err => {
  console.error('❌ Error:', err.message);
  // Cleanup on error
  if (fs.existsSync(BUILD_DIR)) {
    fs.rmSync(BUILD_DIR, { recursive: true, force: true });
    console.log('🧹 Cleaned up build directory');
  }
  process.exit(1);
});
