const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const BUILD_DIR = 'build-temp-pkg-v5';
const RELEASE_DIR = 'release/chrome-cdp-windows-v5';
const ZIP_NAME = 'chrome-cdp-windows-v5.zip';

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
  console.log('📦 Starting packaging process (v5 - absolute path requires)...');

  // STEP 1: Create clean build directory
  console.log('🔧 Creating isolated build directory...');
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(BUILD_DIR, { recursive: true });

  // Copy source files
  const rootFiles = fs.readdirSync(process.cwd(), { withFileTypes: true });
  for (const entry of rootFiles) {
    if (entry.name === 'node_modules' || entry.name.startsWith('build-temp') || entry.name === 'release') continue;
    
    const srcPath = path.join(process.cwd(), entry.name);
    const destPath = path.join(BUILD_DIR, entry.name);
    
    if (entry.isDirectory()) copyDir(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
  console.log('  ✅ Copied source files');

  // STEP 2: Create a stub module that will be replaced at runtime
  const stubContent = `
// This stub will be replaced with the actual path at runtime
const path = require('path');
const Module = require('module');

function getPlaywrightPath() {
  // Try to find playwright relative to executable
  const execDir = process.pkg ? path.dirname(process.execPath) : process.cwd();
  const candidates = [
    path.join(execDir, 'node_modules', 'playwright'),
    path.join(execDir, '..', 'node_modules', 'playwright'),
    path.join(process.cwd(), 'node_modules', 'playwright'),
  ];
  
  for (const candidate of candidates) {
    if (require('fs').existsSync(candidate)) {
      return candidate;
    }
  }
  
  throw new Error('Playwright not found. Searched: ' + candidates.join(', '));
}

module.exports = require(getPlaywrightPath());
`;
  fs.mkdirSync(path.join(BUILD_DIR, 'dist'), { recursive: true });
  fs.writeFileSync(path.join(BUILD_DIR, 'dist', 'playwright-stub.js'), stubContent);
  console.log('  ✅ Created Playwright stub module');

  // STEP 3: Create modified source that uses stub
  // Read original cli.ts and create a modified version
  const cliPath = path.join(BUILD_DIR, 'src', 'cli.ts');
  let cliContent = fs.readFileSync(cliPath, 'utf8');
  
  // Replace playwright imports with stub
  cliContent = cliContent.replace(
    /from ['"]playwright['"];?/g,
    `from '../dist/playwright-stub.js'; // STUBBED`
  );
  
  // Do the same for cdp-connector.ts
  const cdpConnectorPath = path.join(BUILD_DIR, 'src', 'runner', 'cdp-connector.ts');
  if (fs.existsSync(cdpConnectorPath)) {
    let cdpContent = fs.readFileSync(cdpConnectorPath, 'utf8');
    cdpContent = cdpContent.replace(
      /from ['"]playwright['"];?/g,
      `from '../dist/playwright-stub.js'; // STUBBED`
    );
    fs.writeFileSync(cdpConnectorPath, cdpContent);
  }
  
  fs.writeFileSync(cliPath, cliContent);
  console.log('  ✅ Modified source files to use stub');

  // STEP 4: Build bundle
  console.log('🔨 Building bundle...');
  execSync(
    'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v5.js --format=cjs --external:sharp --external:@techstark/opencv-js --external:cron --external:node-cron',
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 5: Create pkg executable
  console.log('🔨 Creating executable...');
  const exePath = path.join(process.cwd(), RELEASE_DIR, 'chrome-cdp.exe');
  if (!fs.existsSync(path.dirname(exePath))) fs.mkdirSync(path.dirname(exePath), { recursive: true });
  
  execSync(
    `npx pkg dist/bundle-v5.js --compress GZip --targets node18-win-x64 --output ${exePath}`,
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 6: Copy required node_modules
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

  // STEP 8: Create run.bat
  const batContent = `@echo off
setlocal

echo [Chrome CDP Automation Launcher v5]
echo.

:: Set NODE_PATH
set "NODE_PATH=%~dp0node_modules"

:: Check for Chrome
if not exist "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" (
    if not exist "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe" (
        echo [WARNING] Chrome executable not found.
    )
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

  // STEP 9: Create README
  const readme = `# Chrome CDP Automation v5

Uses stub module to dynamically load Playwright from external node_modules.

Usage:
  run.bat run flows\\example-flow.yaml
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readme);

  // STEP 10: Create ZIP
  console.log('📦 Creating ZIP archive...');
  await createZip(RELEASE_DIR, ZIP_NAME);
  const stats = fs.statSync(ZIP_NAME);
  console.log(`✅ Created ${ZIP_NAME} (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);

  // Cleanup
  fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  console.log('✅ Done!');
}

packageDistribution().catch(err => {
  console.error('❌ Error:', err.message);
  if (fs.existsSync(BUILD_DIR)) fs.rmSync(BUILD_DIR, { recursive: true, force: true });
  process.exit(1);
});
