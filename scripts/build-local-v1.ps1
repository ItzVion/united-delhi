$ErrorActionPreference = "Stop"

$project = Split-Path -Parent $PSScriptRoot
$debug = Join-Path $env:USERPROFILE "Desktop\UnitedDelhi-Debug"
New-Item -ItemType Directory -Path $debug -Force | Out-Null

$log = Join-Path $debug "local-build-v1.txt"
Start-Transcript -Path $log -Force | Out-Null

try {
  Set-Location $project

  Write-Host "=== UNITED DELHI LOCAL V1 BUILD ==="
  Write-Host "Source: $((git rev-parse HEAD).Trim())"
  Write-Host "Cloud builds: DISABLED"
  Write-Host ""

  $sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"
  if (-not (Test-Path $sdk)) { throw "Android SDK not found: $sdk" }
  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk

  $jbr = Join-Path $env:ProgramFiles "Android\Android Studio\jbr"
  if (Test-Path $jbr) { $env:JAVA_HOME = $jbr }

  Write-Host "[1/7] Root dependency install"
  npm ci
  if ($LASTEXITCODE -ne 0) { throw "npm ci failed." }

  Write-Host "[2/7] Native typecheck"
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { throw "Native typecheck failed." }

  Write-Host "[3/7] Unit tests"
  npm test
  if ($LASTEXITCODE -ne 0) { throw "Unit tests failed." }

  Write-Host "[4/7] Backend syntax"
  Push-Location (Join-Path $project "server")
  node --check src/index.js
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Backend syntax check failed." }
  Pop-Location

  Write-Host "[5/7] Web install/typecheck/build"
  Push-Location (Join-Path $project "web")
  if (Test-Path "package-lock.json") { npm ci } else { npm install }
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web dependency install failed." }
  npm run typecheck
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web typecheck failed." }
  npm run build
  if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Web build failed." }
  Pop-Location

  Write-Host "[6/7] Clean native generation"
  $env:NODE_ENV = "production"
  npx expo prebuild --clean --platform android --no-install
  if ($LASTEXITCODE -ne 0) { throw "Expo prebuild failed." }

  Write-Host "[7/7] Local release APK"
  Push-Location (Join-Path $project "android")
  .\gradlew.bat --no-daemon --stacktrace app:assembleRelease
  $gradleExit = $LASTEXITCODE
  Pop-Location
  if ($gradleExit -ne 0) { throw "Gradle release build failed with exit code $gradleExit." }

  $apk = Join-Path $project "android\app\build\outputs\apk\release\app-release.apk"
  if (-not (Test-Path $apk)) { throw "Gradle reported success but APK was not found: $apk" }

  $out = Join-Path $debug "United-Delhi-V1-local.apk"
  Copy-Item $apk $out -Force

  $adb = Join-Path $sdk "platform-tools\adb.exe"
  if (-not (Test-Path $adb)) { throw "ADB not found: $adb" }
  & $adb devices

  Write-Host "Uninstalling previous test package..."
  & $adb uninstall "com.uniteddelhi.app" 2>$null
  Write-Host "Installing freshly built APK..."
  & $adb install -r $out
  if ($LASTEXITCODE -ne 0) { throw "ADB install failed." }

  Write-Host "Launching United Delhi..."
  & $adb shell am force-stop "com.uniteddelhi.app"
  & $adb shell monkey -p "com.uniteddelhi.app" 1
  Start-Sleep -Seconds 8

  & $adb logcat -d -v threadtime > (Join-Path $debug "local-v1-logcat.txt")
  Write-Host ""
  Write-Host "SUCCESS: APK built and installed."
  Write-Host "APK: $out"
}
catch {
  Write-Host ""
  Write-Host "BUILD STOPPED: $($_.Exception.Message)"
  throw
}
finally {
  Stop-Transcript | Out-Null
}
