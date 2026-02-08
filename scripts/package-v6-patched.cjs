const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const archiver = require('archiver');

const BUILD_DIR = 'build-temp-pkg-v6';
const RELEASE_DIR = 'release/chrome-cdp-windows-v6';
const ZIP_NAME = 'chrome-cdp-windows-v6.zip';

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
  console.log('📦 Starting packaging process (v6 - post-build patch)...');

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

  // STEP 2: Build bundle (with Playwright external)
  console.log('🔨 Building bundle...');
  execSync(
    'npx esbuild src/cli.ts --bundle --platform=node --target=node18 --outfile=dist/bundle-v6.js --format=cjs --external:sharp --external:playwright --external:@playwright/test --external:@techstark/opencv-js --external:cron --external:node-cron',
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 3: Post-process bundle to replace Playwright requires
  console.log('🔧 Patching bundle for external Playwright...');
  const bundlePath = path.join(BUILD_DIR, 'dist', 'bundle-v6.js');
  let bundle = fs.readFileSync(bundlePath, 'utf8');
  
  // Find and replace the Playwright import with a dynamic loader
  // The bundle will have something like: var import_playwright = require("playwright");
  // We need to replace this with code that loads from external node_modules
  
  const loaderCode = `
// PATCHED: Dynamic Playwright loader
var import_playwright = (() => {
  const path = require('path');
  const fs = require('fs');
  const Module = require('module');
  
  function findPlaywright() {
    const candidates = [
      path.join(process.cwd(), 'node_modules', 'playwright'),
      path.join(__dirname, '..', 'node_modules', 'playwright'),
      path.join(process.execPath, '..', 'node_modules', 'playwright'),
    ];
    
    // Also check NODE_PATH
    if (process.env.NODE_PATH) {
      candidates.push(path.join(process.env.NODE_PATH, 'playwright'));
    }
    
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) {
          return require(candidate);
        }
      } catch(e) {}
    }
    
    throw new Error('Playwright not found. Searched: ' + candidates.join(', '));
  }
  
  return findPlaywright();
})();
`;

  // Replace the require("playwright") line
  bundle = bundle.replace(
    /var import_playwright = require\("playwright"\);/,
    loaderCode
  );
  
  // Also handle any other playwright requires
  bundle = bundle.replace(
    /require\("@playwright\/test"\)/g,
    '(function(){ try { return require(process.env.NODE_PATH + "/@playwright/test"); } catch(e) { throw new Error("@playwright/test not found"); } })()'
  );

  fs.writeFileSync(bundlePath, bundle);
  console.log('  ✅ Bundle patched');

  // STEP 4: Create pkg executable
  console.log('🔨 Creating executable...');
  const exePath = path.join(process.cwd(), RELEASE_DIR, 'chrome-cdp.exe');
  if (!fs.existsSync(path.dirname(exePath))) fs.mkdirSync(path.dirname(exePath), { recursive: true });
  
  execSync(
    `npx pkg dist/bundle-v6.js --compress GZip --targets node18-win-x64 --output ${exePath}`,
    { stdio: 'inherit', cwd: BUILD_DIR }
  );

  // STEP 5: Copy required node_modules
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

echo [Chrome CDP Automation Launcher v6]
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

  // STEP 8: Create README
  const readme = `# Chrome CDP Automation v6

Uses post-build patching to load Playwright from external node_modules.

Usage:
  run.bat run flows\\example-flow.yaml
`;
  fs.writeFileSync(path.join(RELEASE_DIR, 'README.txt'), readme);

  // STEP 9: Create ZIP
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
