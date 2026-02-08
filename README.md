# Chrome CDP Automation

Chrome DevTools Protocol automation runner with YAML flow definitions.

## Quick Start (Windows - No Node.js Required)

### Download & Install

1. Download `chrome-cdp-automation-windows.zip` from [Releases](https://github.com/yourusername/chrome-cdp-automation/releases)
2. Extract to any folder (e.g., `C:\Program Files\chrome-cdp-automation`)
3. Add to PATH (optional): System Properties → Environment Variables → Path → Add folder path

### Usage

```cmd
# Validate a flow file
chrome-cdp.exe validate flows\example-flow.yaml

# Run a flow
chrome-cdp.exe run flows\example-flow.yaml --mode manual

# Show help
chrome-cdp.exe --help
```

### Prerequisites

1. Chrome must be running with CDP mode:
   ```cmd
   "C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222




   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
  --remote-debugging-port=9222 `
  --user-data-dir="C:\temp\chrome-debug-$(Get-Date -Format yyyyMMdd-HHmmss)" `
  --no-first-run `
  --no-default-browser-check `
  --disable-default-apps

  
   ```

2. See [Windows Installation Guide](docs/WINDOWS_INSTALL.md) for detailed instructions.

---

## Installation (Development - Node.js Required)

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Install Playwright browsers
npx playwright install chromium
```

## Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npx playwright install chromium` to install the Chrome browser
4. Build the project with `npm run build`

## Usage

```bash
# Run a flow file
npm start run flows/example-flow.yaml

# Schedule a flow to run periodically
npm start schedule flows/example-flow.yaml --cron "0 * * * *"
```

## Project Structure

```
chrome-cdp-automation/
├── src/              # TypeScript source files
├── tests/            # Test files (unit, integration)
├── flows/            # YAML flow definitions
├── artifacts/        # Generated screenshots/HTML
├── logs/             # CSV logs
└── docs/             # Documentation
```

## Development

```bash
# Build TypeScript
npm run build

# Run tests
npm test

# Run unit tests
npm run test:unit

# Run integration tests
npm run test:integration

# Run with development mode
npm run dev
```

## Building Windows Executable

```bash
# Install pkg globally
npm install -g pkg

# Build Windows executable
npm run pkg

# Build all platforms (Windows, macOS, Linux)
npm run pkg:all
```

The executable will be created in `dist/chrome-cdp.exe`.

## License

MIT
