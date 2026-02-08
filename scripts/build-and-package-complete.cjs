const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const DIST_DIR = 'dist';
const EXE_NAME = 'chrome-cdp.exe';
const RELEASE_DIR = 'release/chrome-cdp-windows';
const ZIP_NAME = 'chrome-cdp-windows.zip';

function backupTemplateMatcher() {
  const original = 'src/runner/template-matcher.ts';
  const backup = 'src/runner/template-matcher-original.ts';
  const sharpFree = 'src/runner/template-matcher-no-sharp.ts';
  
  // Backup original if not already backed up
  if (fs.existsSync(original) && !fs.existsSync(backup)) {
    fs.copyFileSync(original, backup);
    console.log('📋 Backed up original template-matcher.ts');
  }
  
  // Use Sharp-free version for build
  if (fs.existsSync(sharpFree)) {
    fs.copyFileSync(sharpFree, original);
    console.log('🔄 Using Sharp-free template-matcher for build');
  }
}

function restoreTemplateMatcher() {
  const original = 'src/runner/template-matcher.ts';
  const backup = 'src/runner/template-matcher-original.ts';
  
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, original);
    console.log('🔄 Restored original template-matcher.ts');
  }
}

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

async function buildAndPackageDistribution() {
  console.log('🚀 Starting complete build and package process...');
  
  try {
    // Step 1: Use Sharp-free version for build
    backupTemplateMatcher();
    
    // Step 2: Clean previous builds
    console.log('🧹 Cleaning previous builds...');
    if (fs.existsSync('chrome-cdp-windows.zip')) {
      fs.unlinkSync('chrome-cdp-windows.zip');
    }
    if (fs.existsSync(RELEASE_DIR)) {
      fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
    }
    
    // Step 3: Build executable
    console.log('🔨 Building executable...');
    execSync('npm run pkg', { stdio: 'inherit' });
    
    // Step 4: Package distribution
    console.log('📦 Packaging distribution...');
    
    if (!fs.existsSync(RELEASE_DIR)) {
      fs.mkdirSync(RELEASE_DIR, { recursive: true });
    }

    const exePath = path.join(DIST_DIR, EXE_NAME);
    if (!fs.existsSync(exePath)) {
      throw new Error(`Executable not found at ${exePath}`);
    }
    fs.copyFileSync(exePath, path.join(RELEASE_DIR, EXE_NAME));
    console.log('✅ Copied executable');

    if (fs.existsSync('config.json')) {
      fs.copyFileSync('config.json', path.join(RELEASE_DIR, 'config.json'));
      console.log('✅ Copied config.json');
    }

    // Copy Assets
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
was built without Sharp support for maximum compatibility.

To make template matching work on Windows:

Option 1 (If you have Node.js installed):
1. Open this folder in Command Prompt/PowerShell
2. Run: npm install --platform=win32 --arch=x64 sharp

Option 2 (Manual Copy):
1. On a Windows machine, run 'npm install sharp' in any empty folder
2. Copy the resulting 'node_modules' folder here, merging with this one.

Note: All other features work perfectly without this dependency.
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
chrome-cdp.exe %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
`;
    fs.writeFileSync(path.join(RELEASE_DIR, 'run.bat'), batContent);
    console.log('✅ Created run.bat');

    // Step 5: Create ZIP
    console.log('📦 Creating distribution ZIP...');
    await createZipWithArchiver(RELEASE_DIR, ZIP_NAME);
    
    console.log(`🎉 Successfully created ${ZIP_NAME}`);
    console.log(`   Location: ${path.resolve(ZIP_NAME)}`);
    console.log(`   Size: ${(fs.statSync(ZIP_NAME).size / 1024 / 1024).toFixed(1)}MB`);
    
  } finally {
    // Always restore original template-matcher
    restoreTemplateMatcher();
  }
}

buildAndPackageDistribution().catch(console.error);