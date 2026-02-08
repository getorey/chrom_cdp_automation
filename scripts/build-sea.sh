#!/bin/bash
# Alternative packaging using Node.js Single Executable Application (Node.js 20+)
# This avoids pkg issues with Playwright

echo "Building Chrome CDP Automation with Node.js SEA..."

# Ensure Node.js 20+ is installed
node_version=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$node_version" -lt 20 ]; then
    echo "Error: Node.js 20+ required for SEA"
    exit 1
fi

# Create sea-config.json
cat > sea-config.json << 'EOF'
{
  "main": "dist/bundle.js",
  "output": "dist/chrome-cdp.blob",
  "disableExperimentalSEAWarning": true,
  "useSnapshot": false,
  "useCodeCache": true
}
EOF

# Build the bundle (with Playwright external)
echo "Building bundle..."
npx esbuild src/cli.ts --bundle --platform=node --target=node20 --outfile=dist/bundle.js --format=cjs \
    --external:sharp \
    --external:playwright \
    --external:@playwright/test \
    --external:@techstark/opencv-js \
    --external:cron \
    --external:node-cron

# Generate the blob
echo "Generating SEA blob..."
node --experimental-sea-config sea-config.json

# Copy node binary
echo "Creating executable..."
cp $(command -v node) dist/chrome-cdp-sea.exe

# Inject blob into executable
npx postject dist/chrome-cdp-sea.exe NODE_SEA_BLOB dist/chrome-cdp.blob \
    --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 \
    --macho-segment-name NODE_SEA

echo "✅ Created dist/chrome-cdp-sea.exe"
echo ""
echo "Note: This executable still requires node_modules to be present for Playwright."
echo "For a complete portable package, use scripts/package-v2-external.cjs instead."
