# Chrome CDP Automation

Chrome DevTools Protocol automation runner with YAML flow definitions.

## Installation

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

## License

MIT
