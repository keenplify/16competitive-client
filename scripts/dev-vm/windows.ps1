param([switch]$Prepare, [switch]$Launch, [switch]$Run)
$ErrorActionPreference = 'Stop'
$root = 'C:\16c-dev'
$client = "$root\16competitive-client"
$env:Path = "C:\16c-build\tools\node;C:\Program Files\Git\cmd;$env:USERPROFILE\.cargo\bin;$env:Path"
function CheckExit { if ($LASTEXITCODE -ne 0) { throw "Command failed: $LASTEXITCODE" } }
function SyncSource([string]$Name, [string]$Destination) {
    New-Item -ItemType Directory -Force $Destination | Out-Null
    $files = Get-Content "$root\$Name.tar.json" -Raw | ConvertFrom-Json
    $marker = "$Destination\.dev-vm-files.json"
    if (Test-Path $marker) {
        $previous = Get-Content $marker -Raw | ConvertFrom-Json
        foreach ($old in $previous) {
            if ($old -match '(^|[/\\])config\.cfg$|(^|[/\\])\.\.([/\\]|$)|^[A-Za-z]:|^[/\\]') { throw 'Unsafe previous source manifest' }
            if ($old -notin $files) { Remove-Item -LiteralPath (Join-Path $Destination $old) -Force -ErrorAction SilentlyContinue }
        }
    }
    tar.exe -xf "$root\$Name.tar" -C $Destination; CheckExit
    Copy-Item "$root\$Name.tar.json" $marker -Force
}
if ($Prepare) {
    $task = Get-ScheduledTask -TaskName '16CompetitiveDev' -ErrorAction SilentlyContinue
    if ($task -and $task.State -eq 'Running') { throw 'Close the existing Windows dev console before syncing a new source snapshot.' }
    SyncSource 'client' $client
    SyncSource 'helper' "$root\16competitive-helper"
    $native = "$client\resources\native\win-x64"
    New-Item -ItemType Directory -Force $native | Out-Null
    foreach ($name in @('game-inspector.exe', 'manifest.json', 'papamo-cosmetic-module-win-x86.dll', 'papamo-nextclient-client-mini-win-x86.dll')) {
        Copy-Item -LiteralPath "$root\native-assets\$name" -Destination "$native\$name" -Force
    }
    # SSH provisioning is elevated; the interactive dev task is not. Grant
    # write access only to the dedicated dev checkout, never game installs.
    icacls.exe $root /grant 'build:(OI)(CI)M' /Q | Out-Null; CheckExit
    Set-Location $client
    $lock = (Get-FileHash package-lock.json -Algorithm SHA256).Hash
    $marker = "$root\npm-lock.hash"
    if (!(Test-Path node_modules) -or !(Test-Path $marker) -or (Get-Content $marker -Raw).Trim() -ne $lock) {
        npm.cmd ci; CheckExit
        Set-Content $marker $lock
    }
    Write-Output 'Windows dev source and dependencies are ready.'
}
if ($Launch) {
    $principal = New-ScheduledTaskPrincipal -UserId 'build' -LogonType Interactive -RunLevel Limited
    $action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument '-NoProfile -NoExit -ExecutionPolicy Bypass -File C:\16c-dev\windows.ps1 -Run' -WorkingDirectory $client
    $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
    Register-ScheduledTask -TaskName '16CompetitiveDev' -Action $action -Principal $principal -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName '16CompetitiveDev'
}
if ($Run) {
    $env:API_BASE_URL = 'http://127.0.0.1:3000'
    $env:MATCHMAKING_WS_URL = 'ws://127.0.0.1:3000/matchmaking/ws'
    $env:VCPKG_DEFAULT_BINARY_CACHE = "$root\vcpkg-cache"
    $env:VCPKG_DOWNLOADS = "$root\vcpkg-downloads"
    New-Item -ItemType Directory -Force $env:VCPKG_DEFAULT_BINARY_CACHE, $env:VCPKG_DOWNLOADS | Out-Null
    Set-Location $client
    $relay = Start-Process -FilePath 'node.exe' -ArgumentList 'scripts/dev-vm/udp-relay.mjs' -WorkingDirectory $client -PassThru -NoNewWindow
    # predev rebuilds unsigned binaries and invalidates the signed manifest.
    # start retains approved native artifacts while rebuilding the HUD renderer.
    try { npm.cmd start; CheckExit }
    finally { if (!$relay.HasExited) { Stop-Process -Id $relay.Id } }
}
