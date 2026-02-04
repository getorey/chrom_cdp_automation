
@echo off
setlocal

echo [Chrome CDP Automation Launcher]
echo.

:: Check for Chrome
if not exist "C:\Program Files\Google\Chrome\Application\chrome.exe" (
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
chrome-cdp.exe %*

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] Application exited with error code %ERRORLEVEL%
    pause
)

endlocal
