param([ValidateSet('helper','desktop')][string]$Kind, [ValidatePattern('^[0-9a-f]{40}$')][string]$Commit)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = "C:\16c-build\jobs\$Kind-$Commit"
$env:Path = "C:\16c-build\tools\node;C:\Program Files\Git\cmd;$env:USERPROFILE\.cargo\bin;$env:Path"
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (!(Test-Path $vswhere)) { throw 'Visual Studio C++ Build Tools are missing' }
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (!$vs) { throw 'Visual Studio C++ toolchain is missing' }
Import-Module (Join-Path $vs 'Common7\Tools\Microsoft.VisualStudio.DevShell.dll')
Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64'
$source = Join-Path $root 'source'
New-Item -ItemType Directory -Force $source | Out-Null
tar.exe -xf (Join-Path $root 'source.tar') -C $source
if ($LASTEXITCODE -ne 0) { throw 'Source extraction failed' }
Set-Location $source
$dist = Join-Path $root 'artifacts'
if (Test-Path $dist) { Remove-Item -LiteralPath $dist -Recurse -Force }
New-Item -ItemType Directory $dist | Out-Null
function CheckExit { if ($LASTEXITCODE -ne 0) { throw 'Local Windows build command failed' } }
if ($Kind -eq 'helper') {
    $cmake = Join-Path $vs 'Common7\IDE\CommonExtensions\Microsoft\CMake\CMake\bin\cmake.exe'
    $ctest = Join-Path (Split-Path $cmake) 'ctest.exe'
    & $cmake -S nextclient/tests -B target/match-handoff-tests; CheckExit
    & $cmake --build target/match-handoff-tests --config Release; CheckExit
    & $ctest --test-dir target/match-handoff-tests -C Release --output-on-failure; CheckExit
    cargo test --locked; CheckExit
    cargo test --locked -p papamo-cosmetic-module; CheckExit
    cargo build --locked --release --features cosmetic-probe --target x86_64-pc-windows-msvc; CheckExit
    cargo build --locked --release -p papamo-cosmetic-module --target i686-pc-windows-msvc; CheckExit
    # Optional owner-provided game fixture: exact hashes are checked by the test.
    if (Test-Path 'C:\16c-build\won-validation\hw.dll') {
        & .\scripts\test-won-recovery.ps1 -Helper target\x86_64-pc-windows-msvc\release\game-inspector.exe -Module target\i686-pc-windows-msvc\release\papamo_cosmetic_module.dll -GameRoot 'C:\16c-build\won-validation'
    }
    $env:VCPKG_DEFAULT_BINARY_CACHE = 'C:\16c-build\vcpkg-cache'
    $env:VCPKG_DOWNLOADS = 'C:\16c-build\vcpkg-downloads'
    New-Item -ItemType Directory -Force $env:VCPKG_DEFAULT_BINARY_CACHE | Out-Null
    New-Item -ItemType Directory -Force $env:VCPKG_DOWNLOADS | Out-Null
    & .\scripts\build-nextclient-client-mini.ps1 -OutputDirectory $dist
    Copy-Item target\x86_64-pc-windows-msvc\release\game-inspector.exe (Join-Path $dist 'game-inspector-win-x64.exe')
    Copy-Item target\i686-pc-windows-msvc\release\papamo_cosmetic_module.dll (Join-Path $dist 'papamo-cosmetic-module-win-x86.dll')
} else {
    $settings = Get-Content (Join-Path $root 'build-environment.json') -Raw | ConvertFrom-Json
    foreach ($name in @('API_BASE_URL','MATCHMAKING_WS_URL','DISCORD_CLIENT_ID','DISCORD_LARGE_IMAGE_KEY')) {
        $property = $settings.PSObject.Properties[$name]
        if ($null -ne $property) { [Environment]::SetEnvironmentVariable($name, [string]$property.Value, 'Process') }
    }
    $env:LOCAL_HELPER_ASSET_DIR = Join-Path $root 'approved-helper'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    npm.cmd ci; CheckExit
    npm.cmd run verify; CheckExit
    npm.cmd run test:helper; CheckExit
    node --experimental-strip-types --experimental-vm-modules --test scripts/renderer-update.test.mjs scripts/renderer-update-package.test.mjs scripts/updater-tolerance.test.mjs scripts/update-banner.test.mjs scripts/cs13-bootstrap.test.mjs scripts/cs13-controls.test.mjs scripts/game-display.test.mjs scripts/custom-room-settings.test.mjs scripts/goldsrc-client-capabilities.test.mjs scripts/shared-model-directory.test.mjs scripts/windows-cosmetic-compatibility.test.mjs scripts/windows-cosmetic-recovery.test.mjs; CheckExit
    npm.cmd run build:win; CheckExit
    node --experimental-strip-types scripts/check-release-backend.mjs; CheckExit
    Get-ChildItem dist -File | Where-Object { $_.Name -match '\.(exe|blockmap|asar)$|^latest.*\.yml$|^renderer-update-.*\.unsigned\.json$' } | Copy-Item -Destination $dist
}
Write-Output "Local Windows $Kind build completed for $Commit"
