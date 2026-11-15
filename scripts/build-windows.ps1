param([string]$Credentials = "$env:USERPROFILE\.config\16competitive-release\credentials.json")
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = Split-Path $PSScriptRoot -Parent
if ($Credentials.Contains('"')) { throw 'Invalid credential path' }
# File-symlink security regressions require an elevated Windows developer shell.
$principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    $arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '" -Credentials "' + $Credentials + '"'
    $process = Start-Process powershell.exe -Verb RunAs -WindowStyle Hidden -ArgumentList $arguments -PassThru -Wait
    Write-Host "Windows build exited $($process.ExitCode). Log: $root\dist\native-windows-build.log"
    exit $process.ExitCode
}
$env:Path = [Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [Environment]::GetEnvironmentVariable('Path','User') + ';' + $env:USERPROFILE + '\.cargo\bin'
$settings = Get-Content -LiteralPath $Credentials -Raw | ConvertFrom-Json
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$allowed = @($sid, 'S-1-5-18', 'S-1-5-32-544')
foreach ($path in @($Credentials, $settings.privateKeyPath)) {
    $item = Get-Item -LiteralPath $path
    if ($item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Signing credentials must be ordinary private files' }
    $acl = Get-Acl -LiteralPath $path
    $owner = ([Security.Principal.NTAccount]::new($acl.Owner)).Translate([Security.Principal.SecurityIdentifier]).Value
    if ($owner -ne $sid) { throw 'Signing credentials must belong to the current user' }
    foreach ($rule in $acl.Access) {
        $identity = $rule.IdentityReference.Translate([Security.Principal.SecurityIdentifier]).Value
        if ($rule.AccessControlType -eq 'Allow' -and $identity -notin $allowed) { throw 'Signing credential ACL allows another account' }
    }
}
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
$vs = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $vs) { throw 'Visual Studio C++ Build Tools are required' }
& (Join-Path $vs 'Common7\Tools\Launch-VsDevShell.ps1') -Arch amd64 -HostArch amd64 -SkipAutomaticLocation
Set-Location -LiteralPath $root
New-Item -ItemType Directory -Path (Join-Path $root 'dist') -Force | Out-Null
& node.exe scripts/build-windows.mjs $Credentials *> (Join-Path $root 'dist\native-windows-build.log')
exit $LASTEXITCODE
