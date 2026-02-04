# Chrome CDP Automation - Distribution Instructions

## Building the Windows Executable

To build the executable for Windows, run:

```bash
npm run pkg
```

This will create `dist/chrome-cdp.exe`.

## Distribution Package

To distribute this application to a Windows user, create a folder (e.g., `chrome-cdp-dist`) and include the following files/folders:

1.  `chrome-cdp.exe` (from `dist/`)
2.  `config.json` (Configuration file)
3.  `flows/` (Directory for YAML flow definitions)
4.  `templates/` (Directory for image templates)
5.  `docs/` (Optional: User documentation)

## Important Notes on Dependencies

### Sharp (Image Processing)
This tool uses the `sharp` library for image template matching. Because `sharp` relies on platform-specific native binaries, they cannot be bundled directly into the single executable file.

**For the executable to work fully on Windows:**
You must provide the Windows native binaries for `sharp` alongside the executable.

1.  On a Windows machine (or using `npm install --platform=win32 --arch=x64 sharp`), install `sharp`.
2.  Copy the resulting `node_modules` folder into your distribution folder.

**Structure:**
```
chrome-cdp-dist/
├── chrome-cdp.exe
├── config.json
├── flows/
│   └── example.yaml
├── templates/
│   └── button.png
└── node_modules/
    └── sharp/
        └── ... (Windows binaries)
```

If `sharp` is not present, features like `click_template` will fail, but selector-based automation will still work.

### Chrome Browser
This tool connects to an existing Chrome instance. The user **must** start Chrome with remote debugging enabled before running the tool:

```cmd
"C:\Program Files\Google\Chrome\Application\chrome.exe" --remote-debugging-port=9222
```
