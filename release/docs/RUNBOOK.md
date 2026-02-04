# Troubleshooting Runbook

This runbook provides solutions for common issues encountered when running Chrome CDP Automation flows.

## Chrome Won't Connect

### Symptoms
- Error: `Failed to connect to Chrome DevTools Protocol`
- Error: `connect ECONNREFUSED 127.0.0.1:9222`
- Flow hangs indefinitely during connection

### Root Causes
1. Chrome is not running with remote debugging enabled
2. Port 9222 is already in use
3. Firewall blocking localhost connection
4. Wrong CDP port configured

### Solutions

#### Start Chrome with Remote Debugging
```bash
# macOS/Linux
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222

# Windows
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222

# Linux
google-chrome --remote-debugging-port=9222
```

#### Check if Port is in Use
```bash
# macOS/Linux
lsof -i :9222

# Windows
netstat -ano | findstr :9222
```

If another process is using the port:
- Stop the conflicting process, OR
- Use a different port in your config

#### Verify Connection
```bash
# Test CDP endpoint
curl http://localhost:9222/json/version

# Expected response: JSON with browser info
```

#### Multiple Chrome Instances
If you have multiple Chrome instances running:
1. Close all Chrome instances
2. Start only one with remote debugging
3. Verify only one process is listening on the port

## Lock File Stuck

### Symptoms
- Error: `Failed to acquire lock`
- Flow appears to be running but nothing happens
- Lock file persists after flow completion

### Root Causes
1. Previous flow crashed before releasing lock
2. Process killed without cleanup
3. System restart while lock was held

### Solutions

#### Check Lock Status
```bash
# View lock file
cat .sisyphus/chrome-cdp-automation.lock

# Check if PID is still running
ps -p <PID_FROM_LOCK_FILE>
```

#### Clear Stale Lock
```bash
# If PID is not running, safe to remove
rm .sisyphus/chrome-cdp-automation.lock

# Or use the CLI
npx chrome-cdp-automation unlock
```

#### Prevent Future Issues
- Use graceful shutdown: `Ctrl+C` instead of force kill
- Monitor process health with process managers
- Set up automatic lock expiration in your config

## Flow Validation Errors

### Symptoms
- Error: `Invalid flow configuration`
- Error: `YAML parse error`
- Error: `Missing required field: actions`
- Flow won't start

### Root Causes
1. YAML syntax errors (indentation, colons, quotes)
2. Missing required fields
3. Invalid data types
4. Circular references

### Solutions

#### Validate YAML Syntax
```bash
# Install yamllint
pip install yamllint

# Validate flow file
yamllint flows/my-flow.yaml
```

#### Common YAML Issues
- **Indentation**: Use 2 spaces (not tabs)
- **Quotes**: Use single quotes for strings with special characters
- **Lists**: Use hyphen + space for list items
- **Maps**: Use `key: value` format

#### Required Fields
Ensure your flow has:
```yaml
name: flow-name
description: Flow description
actions:
  - name: step-name
    type: action-type
    selector: "#element"
```

#### Validate Flow Schema
```bash
# Run flow validator
npx chrome-cdp-automation validate flows/my-flow.yaml
```

#### Debug Mode
```bash
# Enable verbose validation output
DEBUG=validation npx chrome-cdp-automation run flows/my-flow.yaml
```

## Scheduler Not Running

### Symptoms
- Scheduled flows never execute
- No errors in logs
- Cron syntax appears correct

### Root Causes
1. Scheduler process not running
2. PID file corrupted
3. Invalid cron syntax
4. System time/timezone issues

### Solutions

#### Check Scheduler Status
```bash
# Check if scheduler is running
ps aux | grep chrome-cdp-automation

# Check scheduler logs
tail -f logs/scheduler.log
```

#### Start Scheduler
```bash
# Start scheduler in background
npx chrome-cdp-automation schedule start

# Or use foreground for debugging
npx chrome-cdp-automation schedule start --foreground
```

#### Check PID File
```bash
# View PID file
cat .sisyphus/scheduler.pid

# Verify process is running
ps -p $(cat .sisyphus/scheduler.pid)
```

#### Clear Corrupted PID File
```bash
# If PID file exists but process is not running
rm .sisyphus/scheduler.pid
npx chrome-cdp-automation schedule start
```

#### Validate Cron Syntax
```bash
# Test cron pattern
npx chrome-cdp-automation cron "*/5 * * * *"

# Common formats:
# */5 * * * *      - Every 5 minutes
# 0 * * * *        - Every hour
# 0 0 * * *        - Daily at midnight
# 0 9 * * 1-5      - Weekdays at 9 AM
# 0 0 1 * *        - First of month
```

#### System Time Check
```bash
# Verify system time is correct
date

# Check timezone
timedatectl  # Linux
date +%Z     # macOS
```

## Session Expiration Handling

### Symptoms
- Error: `Session expired or invalid`
- Flows fail after running successfully
- Login required errors during automation

### Root Causes
1. Session token expired
2. Cookie cleared or invalidated
3. IP address change triggered security
4. Concurrent sessions from different locations

### Solutions

#### Re-login Manually
```bash
# Open Chrome and login to the site
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --remote-debugging-port=9222
```

#### Add Login Flow to Automation
Create a dedicated login step:
```yaml
actions:
  - name: login
    type: navigate
    url: https://example.com/login

  - name: enter-username
    type: fill
    selector: "#username"
    value: "${USERNAME}"

  - name: enter-password
    type: fill
    selector: "#password"
    value: "${PASSWORD}"

  - name: submit-login
    type: click
    selector: "#login-button"
    waitFor: navigation

  - name: verify-login
    type: assert
    selector: ".user-profile"
    timeout: 10000
```

#### Detect Session Expiration
Add checks before sensitive actions:
```yaml
- name: check-session
  type: check
  selector: ".login-required"
  onFound: login-flow

- name: sensitive-action
  type: click
  selector: "#delete-button"
```

#### Use Session Storage
```javascript
// Save session state
await context.storageState({ path: 'state.json' });

// Restore session state
const context = await browser.newContext({
  storageState: 'state.json'
});
```

#### Handle Multiple Session Scenarios
```yaml
# Use different browsers/contexts for different users
contexts:
  - name: user1
    profile: profiles/user1.json
  - name: user2
    profile: profiles/user2.json
```

## Selector Not Found Errors

### Symptoms
- Error: `Timeout waiting for selector`
- Error: `Element not found`
- Flow fails at specific step

### Root Causes
1. Selector is incorrect or has changed
2. Element hasn't loaded yet
3. Element is hidden or in shadow DOM
4. Page structure changed
5. Multiple elements with same selector

### Solutions

#### Test Selector in DevTools
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Test selector:
   ```javascript
   document.querySelector("#my-selector")
   document.querySelectorAll(".my-class")
   ```

#### Use Wait Strategies
```yaml
# Wait for specific time
actions:
  - name: wait-for-load
    type: wait
    duration: 2000

# Wait for element (with timeout)
actions:
  - name: click-element
    type: click
    selector: "#submit-btn"
    timeout: 10000
```

#### Handle Dynamic Selectors
```yaml
# Use partial selectors
actions:
  - name: dynamic-button
    type: click
    selector: "[data-testid*='submit']"

# Use parent + child
    selector: ".form-container button[type='submit']"

# Use nth-child
    selector: "ul.items li:nth-child(3)"
```

#### Shadow DOM Elements
```yaml
# Use deep selector (if supported)
actions:
  - name: shadow-element
    type: click
    selector: "my-component::shadow .inner-button"

# Or pierce shadow DOM manually
    type: execute
    script: |
      const host = document.querySelector('my-component');
      const shadow = host.shadowRoot;
      shadow.querySelector('.inner-button').click();
```

#### Multiple Elements
```yaml
# Use index
actions:
  - name: click-third-item
    type: click
    selector: ".item >> nth=2"

# Use text content
    selector: "text='Click me'"

# Use multiple attributes
    selector: "[data-type='primary'][role='button']"
```

#### Debug Selectors
```bash
# Run with selector debugging
DEBUG=selector npx chrome-cdp-automation run flows/my-flow.yaml

# Take screenshot before failed step
actions:
  - name: screenshot-before
    type: screenshot
    path: debug/before-failure.png

  - name: failing-step
    type: click
    selector: "#missing-element"
```

#### Alternative Strategies
```yaml
# Try multiple selectors
actions:
  - name: try-primary
    type: click
    selector: "#primary-btn"
    onFail: try-secondary

  - name: try-secondary
    type: click
    selector: ".btn-primary"

  - name: try-text
    type: click
    selector: "text='Submit'"
```

## Permission Denied Errors

### Symptoms
- Error: `EACCES: permission denied`
- Error: `Cannot write to artifacts directory`
- Error: `Cannot read log file`

### Root Causes
1. Directory lacks write permissions
2. Running as wrong user
3. File/directory owned by root
4. SELinux/AppArmor blocking access

### Solutions

#### Check Permissions
```bash
# Check directory permissions
ls -la artifacts/
ls -la logs/

# Check file owner
stat artifacts/screenshot.png
```

#### Fix Directory Permissions
```bash
# Fix artifacts directory
chmod 755 artifacts/
chmod 644 artifacts/*

# Fix logs directory
chmod 755 logs/
chmod 644 logs/*

# Fix specific file
chmod 644 artifacts/screenshot.png
```

#### Fix Ownership
```bash
# Change owner (Linux/macOS)
sudo chown -R $USER:$USER artifacts/
sudo chown -R $USER:$USER logs/

# Change group
sudo chgrp -R $USER artifacts/
```

#### Create Directories with Correct Permissions
```bash
# Create with correct permissions from start
mkdir -p artifacts
chmod 755 artifacts

mkdir -p logs
chmod 755 logs
```

#### SELinux Issues (Linux)
```bash
# Check SELinux context
ls -Z artifacts/

# Set correct context
chcon -R -t httpd_sys_rw_content_t artifacts/

# Or temporarily disable (not recommended for production)
setenforce 0
```

#### Run as Correct User
```bash
# Don't use sudo for running automation
# Run as regular user
npx chrome-cdp-automation run flows/my-flow.yaml

# If you must use sudo, fix permissions afterward
sudo chown -R $USER:$USER artifacts/
```

#### Verify Write Access
```bash
# Test write access
touch artifacts/test.txt && rm artifacts/test.txt

# Test log access
tail logs/scheduler.log
```

## Node.js Version Mismatch

### Symptoms
- Error: `The engine "node" is incompatible with this module`
- Error: `SyntaxError: Unexpected token`
- Build or runtime errors with modern JavaScript features
- Dependencies fail to install

### Root Causes
1. Node.js version too old
2. Node.js version too new (breaking changes)
3. Multiple Node.js versions installed
4. Wrong Node.js version in PATH

### Solutions

#### Check Current Version
```bash
# Check Node version
node --version

# Check npm version
npm --version

# Check required version in package.json
cat package.json | grep "engines"
```

#### Check Required Version
```json
{
  "engines": {
    "node": ">=18.0.0",
    "npm": ">=9.0.0"
  }
}
```

#### Update Node.js
```bash
# Using nvm (recommended)
nvm install 20
nvm use 20
nvm alias default 20

# Using n
sudo npm install -g n
sudo n 20

# Using Homebrew (macOS)
brew install node@20
brew link node@20

# Download from nodejs.org
# https://nodejs.org/
```

#### Switch Node Versions
```bash
# Using nvm
nvm list
nvm use 18

# Using n
sudo n 18

# Verify switch
node --version
```

#### Clear npm Cache
```bash
# Clear npm cache after version change
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

#### Verify Package Compatibility
```bash
# Check for outdated packages
npm outdated

# Update all packages
npm update

# Audit for vulnerabilities
npm audit
npm audit fix
```

#### Verify Build
```bash
# Clean build artifacts
rm -rf dist/
npm run build

# Run tests
npm test
```

## Additional Debugging Tips

### Enable Verbose Logging
```bash
# All debug output
DEBUG=* npx chrome-cdp-automation run flows/my-flow.yaml

# Specific modules
DEBUG=chrome-cdp:* npx chrome-cdp-automation run flows/my-flow.yaml
DEBUG=cdp:*,scheduler:* npx chrome-cdp-automation schedule start
```

### Run with Headed Browser
```bash
# Modify config or use flag
HEADLESS=false npx chrome-cdp-automation run flows/my-flow.yaml

# See browser actions in real-time
```

### Inspect Artifacts
```bash
# View screenshots
open artifacts/

# View HTML captures
cat artifacts/*.html

# View logs
tail -f logs/flow-*.log
```

### Generate Diagnostic Report
```bash
# Collect system info
npx chrome-cdp-automation doctor

# Output includes:
# - Node/npm versions
# - Chrome version
# - System info
# - Configuration
# - Recent errors
```

### Common Command Patterns
```bash
# Validate flow
npx chrome-cdp-automation validate flows/my-flow.yaml

# Dry run (no actual execution)
npx chrome-cdp-automation run flows/my-flow.yaml --dry-run

# Continue on error
npx chrome-cdp-automation run flows/my-flow.yaml --continue-on-error

# Retry failed flows
npx chrome-cdp-automation retry <flow-id>
```

## Getting Help

### Check Logs First
```bash
# Most recent flow log
ls -t logs/flow-*.log | head -1 | xargs tail

# Scheduler log
tail -f logs/scheduler.log
```

### Search Issues
- GitHub Issues: https://github.com/your-org/chrome-cdp-automation/issues
- Use error message as search term

### Provide Diagnostic Info
When reporting issues, include:
1. Full error message and stack trace
2. Node.js and npm versions
3. Chrome version
4. Flow YAML (sanitized)
5. `npx chrome-cdp-automation doctor` output
6. Relevant log excerpts
