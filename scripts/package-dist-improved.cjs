const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const DIST_DIR = 'dist';
const EXE_NAME = 'chrome-cdp.exe';
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
  if (fs.existsSync('node_modules/sharp')) {
    copyDir('node_modules/sharp', sharpDir);
    console.log('✅ Copied local sharp module');
  }

  // Copy @img (sharp binaries for 0.33+)
  const imgDir = path.join(RELEASE_DIR, 'node_modules', '@img');
  if (fs.existsSync('node_modules/@img')) {
    copyDir('node_modules/@img', imgDir);
    console.log('✅ Copied local @img (sharp binaries)');
  }

  // Copy Playwright (must be external to pkg to avoid 'Invalid host defined options')
  const playwrightDir = path.join(RELEASE_DIR, 'node_modules', 'playwright');
  if (fs.existsSync('node_modules/playwright')) {
    copyDir('node_modules/playwright', playwrightDir);
    console.log('✅ Copied local playwright module');
  }

  const playwrightCoreDir = path.join(RELEASE_DIR, 'node_modules', 'playwright-core');
  if (fs.existsSync('node_modules/playwright-core')) {
    copyDir('node_modules/playwright-core', playwrightCoreDir);
    console.log('✅ Copied local playwright-core module');
  }

  // Copy other dependencies that sharp might need if they aren't bundled in sharp itself
  // Sharp 0.33+ is pretty self-contained in @img
  
  const sharpReadme = `
IMPORTANT: Dependencies (Sharp & Playwright)
==========================================

This application includes 'sharp' and 'playwright' libraries.
The necessary files have been copied from the build environment.

If you encounter errors:
1. Ensure the 'node_modules' folder is in the same directory as the executable.
2. The included binaries are for Windows x64.
3. Playwright browsers are NOT included by default. 
   Running the app might trigger browser download, or ensure Chrome is installed.
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README_DEPENDENCIES.txt'), sharpReadme);
  console.log('✅ Created dependency instructions');

  const batContent = `
@echo off
setlocal EnableDelayedExpansion

echo [Chrome CDP Automation Launcher]
echo.

:: Get the directory where this batch file is located
set "SCRIPT_DIR=%~dp0"

:: Set NODE_PATH to include local node_modules for pkg external dependencies
set "NODE_PATH=%SCRIPT_DIR%node_modules"

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    echo [WARNING] Chrome executable not found in default location.
    echo Please ensure Chrome is installed.
)

:: Check configuration
if not exist "%SCRIPT_DIR%config.json" (
    echo [ERROR] config.json not found!
    pause
    exit /b 1
)

:: Check node_modules exists
if not exist "%SCRIPT_DIR%node_modules" (
    echo [WARNING] node_modules folder not found. Some features may not work.
)

:: Run the application
echo Starting Chrome CDP Automation...
echo NODE_PATH: %NODE_PATH%
"%SCRIPT_DIR%chrome-cdp.exe" %*

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