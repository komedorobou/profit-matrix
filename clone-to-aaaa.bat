@echo off
chcp 65001 >nul
echo ========================================
echo   PROFIT MATRIX - Clone Setup Script
echo ========================================
echo.

set CLONE_DIR=C:\Users\komed\Desktop\AAAA

if exist "%CLONE_DIR%" (
    echo [!] %CLONE_DIR% は既に存在します。
    echo     上書きする場合は先にフォルダを削除してください。
    pause
    exit /b 1
)

echo [1/3] リポジトリをクローン中...
git clone https://github.com/komedorobou/profit-matrix.git "%CLONE_DIR%"
if errorlevel 1 (
    echo [ERROR] クローンに失敗しました。
    pause
    exit /b 1
)

echo.
echo [2/3] クローン完了！
echo.
echo [3/3] セットアップ確認:
echo     - .mcp.json をバックアップからコピーしてください
echo       （.gitignore に含まれているためクローンには含まれません）
echo.
echo ========================================
echo   完了！ フォルダ: %CLONE_DIR%
echo ========================================
echo.
pause
