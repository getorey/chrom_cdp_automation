# Chrome CDP Automation - User Guide

## Installation

```bash
# Install dependencies
npm install

# Build the project
npm run build
```

## Quick Start

```bash
# 1. Start Chrome with CDP enabled
chrome --remote-debugging-port=9222

# 2. Validate your flow file
npm run run validate flows/my-flow.yaml

# 3. Run the flow
npm run run flows/my-flow.yaml
```

## Chrome CDP Startup

**macOS:**
```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

**Linux:**
```bash
google-chrome --remote-debugging-port=9222
```

**Windows:**
```bash
chrome.exe --remote-debugging-port=9222
```

## Flow Format Reference

```yaml
name: Flow Name
description: Flow description
url_prefix: https://example.com

steps:
  - step_no: 1
    action: navigate
    target: https://example.com
    description: Navigate to page
    timeout: 30000

  - step_no: 2
    action: click
    target: #submit-button
    description: Click button

  - step_no: 3
    action: type
    target: #input-field
    value: hello world
    description: Type text

  - step_no: 4
    action: select
    target: #dropdown
    value: option-value
    description: Select option

  - step_no: 5
    action: wait
    target: #result
    description: Wait for element
```

**Action Types:**
- `navigate` - Navigate to URL (target: URL)
- `click` - Click element (target: CSS selector)
- `type` - Type text into input (target: CSS selector, value: text)
- `select` - Select dropdown option (target: CSS selector, value: option)
- `wait` - Wait for element (target: CSS selector)

## CLI Command Reference

| Command | Description |
|---------|-------------|
| `run <flow-file>` | Execute a flow file |
| `validate <flow-file>` | Validate flow file syntax |
| `check-cdp [--port 9222]` | Test CDP connection |
| `scheduler start <file> --schedule <cron>` | Start scheduled flow |
| `scheduler stop` | Stop scheduler daemon |
| `scheduler status` | Show scheduler status |
| `status` | Show active automation session |

## Troubleshooting

**"No tab found matching URL prefix"**
- Ensure Chrome is running with `--remote-debugging-port=9222`
- Check that `url_prefix` matches an open tab's URL

**"Unable to acquire lock"**
- Another flow may be running. Check with `npm run run status`
- Remove lock file if needed: `rm .chrome-cdp.lock`

**CDP connection errors**
- Close all Chrome instances and restart with CDP flag
- Verify port 9222 is not in use: `lsof -i :9222`
- Use `check-cdp` to test connection

**Validation errors**
- Run `validate` command before executing
- Ensure `step_no` is sequential starting from 1
- Check required fields per action type
