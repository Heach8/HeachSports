@echo off
chcp 65001 >nul
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo HATA: Node.js kurulu degil. https://nodejs.org adresinden LTS surumunu kurun.
  pause
  exit /b 1
)

for /f "tokens=1 delims=." %%v in ('node -v') do set MAJOR=%%v
set MAJOR=%MAJOR:v=%
if %MAJOR% LSS 22 (
  echo HATA: Node.js 22 veya uzeri gerekli. Mevcut surum:
  node -v
  pause
  exit /b 1
)

cd server
echo Paketler kontrol ediliyor...
call npm install --no-audit --no-fund
if errorlevel 1 (
  echo HATA: Paket kurulumu basarisiz. Internet baglantinizi kontrol edin.
  pause
  exit /b 1
)

echo Veritabani hazirlaniyor (tablolar/ornek veri, zaten varsa atlanir)...
node src\seed.js
if errorlevel 1 (
  echo.
  echo Veritabani baglantisi kurulamadi. Yukaridaki hata mesajini kontrol edin.
  pause
  exit /b 1
)
node src\demo.js

echo.
echo  NCL - National Corporate League basliyor: http://localhost:3001
echo  Kapatmak icin bu pencereyi kapatin.
echo.
start "" "http://localhost:3001"
node src\index.js
if errorlevel 1 pause
