const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const DIST_DIR = 'dist';
const EXE_NAME = 'chrome-cdp-standalone.exe';
const RELEASE_DIR = 'release/chrome-cdp-windows';
const ZIP_NAME = 'chrome-cdp-windows.zip';

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

async function createZipWithArchiver(sourceDir, outputPath) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      console.log(`📦 Archive created: ${archive.pointer()} bytes`);
      resolve();
    });

    archive.on('error', (err) => {
      reject(err);
    });

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

async function packageDistribution() {
  console.log('📦 Starting packaging process...');

  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  const exePath = path.join(DIST_DIR, EXE_NAME);
  if (!fs.existsSync(exePath)) {
    console.error(`❌ Executable not found at ${exePath}. Run 'npm run pkg' first.`);
    process.exit(1);
  }
  fs.copyFileSync(exePath, path.join(RELEASE_DIR, EXE_NAME));
  console.log('✅ Copied executable');

  if (fs.existsSync('config.json')) {
    fs.copyFileSync('config.json', path.join(RELEASE_DIR, 'config.json'));
    console.log('✅ Copied config.json');
  }

  // Copy Assets (flows, templates, docs)
  const assets = ['flows', 'templates', 'docs'];
  for (const asset of assets) {
    if (fs.existsSync(asset)) {
      copyDir(asset, path.join(RELEASE_DIR, asset));
      console.log(`✅ Copied ${asset}/`);
    } else {
      fs.mkdirSync(path.join(RELEASE_DIR, asset), { recursive: true });
      console.log(`⚠️ Created empty ${asset}/ directory`);
    }
  }

  const sharpDir = path.join(RELEASE_DIR, 'node_modules', 'sharp');
  fs.mkdirSync(sharpDir, { recursive: true });
  
  const sharpReadme = `
IMPORTANT: Sharp Native Dependency Missing
==========================================

This application uses the 'sharp' library for image processing (template matching).
Because 'sharp' relies on platform-specific native binaries, the included executable
cannot contain the Windows binaries if it was built on macOS/Linux.

To make template matching work on Windows:

Option 1 (If you have Node.js installed):
1. Open this folder in Command Prompt/PowerShell
2. Run: npm install --platform=win32 --arch=x64 sharp

Option 2 (Manual Copy):
1. On a Windows machine, run 'npm install sharp' in any empty folder
2. Copy the resulting 'node_modules' folder here, merging with this one.
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README_DEPENDENCIES.txt'), sharpReadme);
  console.log('✅ Created dependency instructions');

  const batContent = `
@echo off
setlocal

echo [Chrome CDP Automation Launcher]
echo.

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    echo [WARNING] Chrome executable not found in default location.
    echo Please ensure Chrome is installed.
)

:: Check configuration
if not exist config.json (
    echo [ERROR] config.json not found!
    pause
    exit /b 1
)

:: Run the application
echo Starting Chrome CDP Automation...
chrome-cdp-standalone.exe %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'run.bat'), batContent);
  console.log('✅ Created run.bat');

  // Create ZIP using archiver (cross-platform)
  try {
    console.log('📦 Creating distribution ZIP...');
    await createZipWithArchiver(RELEASE_DIR, ZIP_NAME);
    console.log(`🎉 Successfully created ${ZIP_NAME}`);
    console.log(`   Location: ${path.resolve(ZIP_NAME)}`);
    console.log(`   Size: ${(fs.statSync(ZIP_NAME).size / 1024 / 1024).toFixed(1)}MB`);
  } catch (error) {
    console.error('❌ Failed to create zip file:', error.message);
    console.log('   The "release" folder is ready but unzipped.');
    process.exit(1);
  }
}

packageDistribution().catch(console.error);