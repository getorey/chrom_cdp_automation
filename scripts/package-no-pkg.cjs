const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const BUILD_DIR = 'release/chrome-cdp-windows-portable';
const ZIP_NAME = 'chrome-cdp-windows-portable.zip';

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
  console.log('📦 Starting NO-PKG packaging process...');
  console.log('   (This version does NOT use pkg - avoiding the snapshot issue)');

  // STEP 1: Clean build directory
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // STEP 2: Compile TypeScript
  console.log('🔨 Compiling TypeScript...');
  execSync('npm run build', { stdio: 'inherit' });
  console.log('  ✅ Compiled to dist/');

  // STEP 3: Copy compiled JavaScript
  copyDir('dist', path.join(BUILD_DIR, 'dist'));
  console.log('  ✅ Copied compiled JS');

  // STEP 4: Copy package.json (modified for distribution)
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  // Remove devDependencies and scripts to reduce size
  delete pkg.devDependencies;
  pkg.scripts = { start: 'node dist/cli.js' };
  fs.writeFileSync(path.join(BUILD_DIR, 'package.json'), JSON.stringify(pkg, null, 2));
  console.log('  ✅ Created package.json');

  // STEP 5: Copy ALL node_modules (to ensure all dependencies work)
  console.log('📦 Copying node_modules (this may take a moment)...');
  copyDir('node_modules', path.join(BUILD_DIR, 'node_modules'), ['.cache', '.bin']);
  console.log('  ✅ Copied all node_modules');

  // STEP 6: Copy config and assets
  ['config.json', 'flows', 'docs', 'templates'].forEach(item => {
    if (fs.existsSync(item)) {
      const dest = path.join(BUILD_DIR, item);
      if (fs.statSync(item).isDirectory()) copyDir(item, dest);
      else fs.copyFileSync(item, dest);
      console.log(`  ✅ ${item}`);
    }
  });

  // STEP 6.5: Create tmp directory
  if (!fs.existsSync(path.join(BUILD_DIR, 'tmp'))) {
    fs.mkdirSync(path.join(BUILD_DIR, 'tmp'));
    console.log('  ✅ Created tmp/ directory');
  }

  // STEP 6.6: Bundle Node.js executable
  console.log('📦 Bundling Node.js executable...');
  try {
    const nodePath = process.execPath;
    const destNodePath = path.join(BUILD_DIR, 'node.exe');
    fs.copyFileSync(nodePath, destNodePath);
    console.log('  ✅ Bundled node.exe (Portable Mode)');
  } catch (error) {
    console.warn('  ⚠️ Could not bundle node.exe. User will need Node.js installed.');
  }

  // STEP 7: Create run.bat that uses Bundled Node or System Node
  const batContent = `@echo off
setlocal

echo [Chrome CDP Automation - Portable]
echo.

:: Check for bundled Node.js
if exist "%~dp0node.exe" (
    set "NODE_EXE=%~dp0node.exe"
) else (
    :: Fallback to system Node.js
    where node >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Node.js is not installed and bundled node.exe is missing.
        pause
        exit /b 1
    )
    set "NODE_EXE=node"
)

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    if not exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
        echo [WARNING] Chrome executable not found.
    )
)

:: Check configuration
if not exist "%~dp0config.json" (
    echo [ERROR] config.json not found!
    pause
    exit /b 1
)

:: Run using Node.js
echo Starting Chrome CDP Automation...
"%NODE_EXE%" "%~dp0dist\\cli.js" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'run.bat'), batContent);
  console.log('  ✅ run.bat');

  // STEP 8: Create install script
  const installBat = `@echo off
setlocal

echo [Chrome CDP Automation - Setup]
echo.

:: Check for bundled Node.js
if exist "%~dp0node.exe" (
    set "NODE_EXE=%~dp0node.exe"
    echo [OK] Using bundled Node.js
) else (
    where node >nul 2>nul
    if %ERRORLEVEL% NEQ 0 (
        echo [ERROR] Node.js is not installed!
        pause
        exit /b 1
    )
    set "NODE_EXE=node"
)

:: Install Playwright browsers if needed
echo.
echo Installing Playwright browsers (this may take a few minutes)...
"%NODE_EXE%" "%~dp0node_modules/playwright/cli.js" install chromium

echo.
echo [OK] Setup complete!
echo You can now run: run.bat run flows\\example-flow.yaml
pause
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'install.bat'), installBat);
  console.log('  ✅ install.bat');

  // STEP 9: Create README
  const readme = `# Chrome CDP Automation (Portable Version)

This is a self-contained portable version that includes Node.js.

## Prerequisites

1. Chrome must be installed
2. Chrome must be running with: chrome.exe --remote-debugging-port=9222

## Setup

1. Run install.bat (installs Playwright browsers)
   
   install.bat

## Usage

Run using the batch file:

    run.bat run flows\\example-flow.yaml

## Why Portable?
This version avoids 'pkg' bundling issues while remaining standalone by including the Node.js runtime.
`;
  fs.writeFileSync(path.join(BUILD_DIR, 'README.txt'), readme);
  console.log('  ✅ README.txt');

  // STEP 10: Create ZIP
  console.log('📦 Creating ZIP archive...');
  await createZip(BUILD_DIR, ZIP_NAME);
  const stats = fs.statSync(ZIP_NAME);
  console.log(`✅ Created ${ZIP_NAME} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  console.log(`📍 Location: ${path.resolve(ZIP_NAME)}`);
  console.log('');
  console.log('ℹ️  This version requires Node.js to be installed on the target machine.');
  console.log('   Users should run install.bat first to set up Playwright browsers.');
}

packageDistribution().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
