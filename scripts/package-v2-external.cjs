const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const DIST_DIR = 'dist';
const EXE_NAME = 'chrome-cdp.exe';
const RELEASE_DIR = 'release/chrome-cdp-windows-v2';
const ZIP_NAME = 'chrome-cdp-windows-v2.zip';

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
  console.log('📦 Starting packaging process (v2 - with external Playwright)...');

  if (fs.existsSync(RELEASE_DIR)) {
    fs.rmSync(RELEASE_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RELEASE_DIR, { recursive: true });

  // Step 1: Create bundle WITHOUT Playwright bundled in
  console.log('🔨 Building bundle (Playwright external)...');
  try {
    execSync(
      'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v2.js --format=cjs --external:sharp --external:playwright --external:@playwright/test --external:@techstark/opencv-js --external:cron --external:node-cron',
      { stdio: 'inherit' }
    );
  } catch (error) {
    console.error('❌ Bundle creation failed');
    process.exit(1);
  }

  // Step 2: Package with pkg (without node_modules)
  console.log('🔨 Creating executable with pkg...');
  try {
    // Temporarily move node_modules to exclude it from pkg
    const nodeModulesPath = path.join(process.cwd(), 'node_modules');
    const nodeModulesBackupPath = path.join(process.cwd(), 'node_modules_backup');
    
    if (fs.existsSync(nodeModulesPath)) {
      fs.renameSync(nodeModulesPath, nodeModulesBackupPath);
    }

    try {
      execSync(
        `npx pkg dist/bundle-v2.js --compress GZip --targets node18-win-x64 --output ${path.join(RELEASE_DIR, EXE_NAME)}`,
        { stdio: 'inherit' }
      );
    } finally {
      // Restore node_modules
      if (fs.existsSync(nodeModulesBackupPath)) {
        fs.renameSync(nodeModulesBackupPath, nodeModulesPath);
      }
    }
  } catch (error) {
    console.error('❌ pkg creation failed');
    process.exit(1);
  }

  console.log('✅ Created executable');

  // Step 3: Copy required node_modules to release folder
  console.log('📦 Copying required dependencies...');
  
  const requiredModules = [
    'playwright',
    '@playwright',
    'commander',
    'js-yaml',
    'ajv',
  ];

  for (const mod of requiredModules) {
    const srcPath = path.join('node_modules', mod);
    const destPath = path.join(RELEASE_DIR, 'node_modules', mod);
    
    if (fs.existsSync(srcPath)) {
      copyDir(srcPath, destPath);
      console.log(`✅ Copied ${mod}/`);
    } else {
      console.warn(`⚠️ Module not found: ${mod}`);
    }
  }

  // Step 4: Copy config and assets
  if (fs.existsSync('config.json')) {
    fs.copyFileSync('config.json', path.join(RELEASE_DIR, 'config.json'));
    console.log('✅ Copied config.json');
  }

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

  // Step 5: Create run.bat that sets up NODE_PATH
  const batContent = `
@echo off
setlocal

echo [Chrome CDP Automation Launcher v2]
echo.

:: Set NODE_PATH to include local node_modules
set "NODE_PATH=%~dp0node_modules"

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
"%~dp0${EXE_NAME}" %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'run.bat'), batContent);
  console.log('✅ Created run.bat');

  // Step 6: Create README
  const readmeContent = `# Chrome CDP Automation - Windows Distribution v2

This version uses external Playwright to avoid bundling issues.

## Prerequisites

1. Chrome must be installed
2. Chrome must be running with CDP enabled:
   \"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe\" --remote-debugging-port=9222

## Usage

Run the application using run.bat:

    run.bat run flows\\example-flow.yaml

Or directly (node_modules must be in NODE_PATH):

    set NODE_PATH=%CD%\\node_modules
    chrome-cdp.exe run flows\\example-flow.yaml

## Files

- chrome-cdp.exe - Main executable
- node_modules/ - Required dependencies (Playwright, etc.)
- run.bat - Launcher script
- config.json - Configuration
- flows/ - Flow definitions
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readmeContent);
  console.log('✅ Created README.txt');

  // Step 7: Create ZIP
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
