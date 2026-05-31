@echo off
echo ========================================
echo  OlomiPay - Windows Setup Script (CMD)
echo ========================================
echo.
echo This script will guide you through setup.
echo Run each section manually if you prefer.
echo.

echo [1] Downloading Rust installer...
curl -o "%TEMP%\rustup-init.exe" https://win.rustup.rs/x86_64
echo.
echo [2] Running Rust installer (follow the prompts, press 1 for default install)...
"%TEMP%\rustup-init.exe"
echo.
echo After Rust installs, CLOSE this window and open a NEW CMD window.
echo Then run: rustup target add wasm32v1-none
pause
