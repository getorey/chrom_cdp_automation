
IMPORTANT: Sharp Native Dependency Missing
==========================================

This application uses the 'sharp' library for image processing (template matching).
Because 'sharp' relies on platform-specific native binaries, the included executable
cannot contain the Windows binaries if it was built on macOS/Linux.

To make template matching work on Windows:

Option 1 (If you have Node.js installed):
1. Open this folder in Command Prompt/PowerShell
2. Run: npm install --platform=win32 --arch=x64 sharp

Option 2 (Manual Copy):
1. On a Windows machine, run 'npm install sharp' in any empty folder
2. Copy the resulting 'node_modules' folder here, merging with this one.
