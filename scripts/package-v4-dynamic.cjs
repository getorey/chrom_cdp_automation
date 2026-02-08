const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const BUILD_DIR = 'build-temp-pkg-v4';
const RELEASE_DIR = 'release/chrome-cdp-windows-v4';
const ZIP_NAME = 'chrome-cdp-windows-v4.zip';

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
  console.log('📦 Starting packaging process (v4 - force exclude node_modules)...');

  // STEP 1: Create clean build directory
  console.log('🔧 Creating isolated build directory...');
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Copy source files (excluding node_modules)
  const rootFiles = fs.readdirSync(process.cwd(), { withFileTypes: true });
  for (const entry of rootFiles) {
    if (entry.name === 'node_modules' || entry.name.startsWith('build-temp') || entry.name === 'release') continue;
    
    const srcPath = path.join(process.cwd(), entry.name);
    const destPath = path.join(BUILD_DIR, entry.name);
    
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
  console.log('  ✅ Copied source files');

  // STEP 2: Create a pkg config that excludes node_modules
  const pkgConfig = {
    pkg: {
      scripts: [],
      assets: [],
      targets: ["node18-win-x64"]
    }
  };
  fs.writeFileSync(path.join(BUILD_DIR, 'package.json'), JSON.stringify({
    name: 'chrome-cdp-automation',
    bin: 'dist/bundle-v4.js',
    pkg: pkgConfig.pkg
  }, null, 2));
  console.log('  ✅ Created isolated package.json (no deps)');

  // STEP 3: Build bundle
  console.log('🔨 Building bundle...');
  execSync(
    'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v4.js --format=cjs --external:sharp --external:playwright --external:@playwright/test --external:@techstark/opencv-js --external:cron --external:node-cron',
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 4: Modify bundle to use dynamic require for playwright
  // This prevents pkg from detecting it as a static require
  console.log('🔧 Modifying bundle to hide Playwright requires...');
  const bundlePath = path.join(BUILD_DIR, 'dist', 'bundle-v4.js');
  let bundleContent = fs.readFileSync(bundlePath, 'utf8');
  
  // Replace static require('playwright') with dynamic require
  bundleContent = bundleContent.replace(
    /require\("playwright"\)/g,
    'eval("require")("playwright")'
  );
  bundleContent = bundleContent.replace(
    /require\("@playwright\/test"\)/g,
    'eval("require")("@playwright/test")'
  );
  
  fs.writeFileSync(bundlePath, bundleContent);
  console.log('  ✅ Modified bundle (dynamic requires)');

  // STEP 5: Create pkg executable
  console.log('🔨 Creating executable...');
  const exePath = path.join(process.cwd(), RELEASE_DIR, 'chrome-cdp.exe');
  if (!fs.existsSync(path.dirname(exePath))) fs.mkdirSync(path.dirname(exePath), { recursive: true });
  
  execSync(
    `npx pkg dist/bundle-v4.js --compress GZip --targets node18-win-x64 --output ${exePath}`,
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 6: Copy required node_modules from ORIGINAL directory
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

  // STEP 7: Copy config and assets
  ['config.json', 'flows', 'docs', 'templates'].forEach(item => {
    if (fs.existsSync(item)) {
      const dest = path.join(RELEASE_DIR, item);
      if (fs.statSync(item).isDirectory()) copyDir(item, dest);
      else fs.copyFileSync(item, dest);
      console.log(`  ✅ ${item}`);
    }
  });

  // STEP 8: Create run.bat with better error handling
  const batContent = `@echo off
setlocal EnableDelayedExpansion

echo [Chrome CDP Automation Launcher v4]
echo.

:: Set NODE_PATH
set "NODE_PATH=%~dp0node_modules"
echo [DEBUG] NODE_PATH=%NODE_PATH%

:: Check node_modules exists
if not exist "%~dp0node_modules" (
    echo [ERROR] node_modules not found!
    echo Please ensure you're running from the extracted folder.
    pause
    exit /b 1
)

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    if not exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
        echo [WARNING] Chrome executable not found.
        echo Please ensure Chrome is installed.
    )
)

:: Check configuration
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found!
    pause
    exit /b 1
)

:: Run the application
echo Starting Chrome CDP Automation...
echo.
"%~dp0chrome-cdp.exe" %*

set EXITCODE=%ERRORLEVEL%
if %EXITCODE% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %EXITCODE%
    pause
)

endlocal
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'run.bat'), batContent);
  console.log('  ✅ run.bat');

  // STEP 9: Create README
  const readme = `# Chrome CDP Automation v4

This version uses dynamic requires to prevent Playwright from being
bundled in the executable snapshot.

Prerequisites:
1. Chrome must be installed
2. Chrome must be running with: chrome.exe --remote-debugging-port=9222

Usage:
  run.bat run flows\\example-flow.yaml

Troubleshooting:
- If you see "Invalid host defined options", ensure you're using run.bat
- Check that node_modules folder exists alongside chrome-cdp.exe
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readme);

  // STEP 10: Create ZIP
  console.log('📦 Creating ZIP archive...');
  await createZip(RELEASE_DIR, ZIP_NAME);
  const stats = fs.statSync(ZIP_NAME);
  console.log(`✅ Created ${ZIP_NAME} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`📍 Location: ${path.resolve(ZIP_NAME)}`);

  // Cleanup
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('✅ Done!');
}

packageDistribution().catch(err => {
  console.error('❌ Error:', err.message);
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  process.exit(1);
});
