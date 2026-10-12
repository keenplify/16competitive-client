$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$root = 'C:\16c-build'
New-Item -ItemType Directory -Force "$root\tools" | Out-Null
Start-Transcript -Path "$root\bootstrap.log" -Append
try {
    # Only signed installers from their official publishers are executed.
    function Install-Signed([string]$Url, [string]$Name, [string[]]$Arguments, [string]$Publisher) {
        $file = Join-Path "$root\tools" $Name
        Invoke-WebRequest -UseBasicParsing -Uri $Url -OutFile $file
        $sig = Get-AuthenticodeSignature $file
        if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch $Publisher) { throw "Installer signature rejected: $Name" }
        $process = Start-Process -FilePath $file -ArgumentList $Arguments -Wait -PassThru
        if ($process.ExitCode -notin @(0, 3010)) { throw "Installer failed: $Name ($($process.ExitCode))" }
    }
    Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 | Out-Null
    Start-Service sshd
    Stop-Service sshd
    $keys = "$env:ProgramData\ssh\administrators_authorized_keys"
    Copy-Item (Join-Path $PSScriptRoot 'ssh-key.pub') $keys -Force
    icacls.exe $keys /inheritance:r /grant '*S-1-5-18:F' /grant '*S-1-5-32-544:F' | Out-Null
    $sshd = "$env:ProgramData\ssh\sshd_config"
    Add-Content $sshd "`nPasswordAuthentication no`nPubkeyAuthentication yes"
    Set-Service sshd -StartupType Automatic
    Start-Service sshd
    if (!(Get-NetFirewallRule -Name '16c-build-ssh' -ErrorAction SilentlyContinue)) {
        New-NetFirewallRule -Name '16c-build-ssh' -DisplayName 'Local build SSH' -Direction Inbound -Protocol TCP -LocalPort 22 -Action Allow | Out-Null
    }
    $vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
    $vc = if (Test-Path $vswhere) { & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath } else { $null }
    if (!$vc) {
        Write-Host 'Installing Visual Studio C++ Build Tools...'
        Install-Signed 'https://aka.ms/vs/17/release/vs_BuildTools.exe' 'vs-buildtools.exe' @('--quiet','--wait','--norestart','--add','Microsoft.VisualStudio.Workload.VCTools','--includeRecommended') 'Microsoft Corporation'
    }
    if (!(Test-Path 'C:\Program Files\Git\cmd\git.exe')) {
        Write-Host 'Installing Git...'
        Install-Signed 'https://github.com/git-for-windows/git/releases/download/v2.56.0.windows.2/Git-2.56.0.2-64-bit.exe' 'git.exe' @('/VERYSILENT','/NORESTART','/NOCANCEL','/SP-') 'Open Source Developer|Johannes Schindelin|Git'
    }
    $node = 'v22.23.3'
    $zip = "$root\tools\node.zip"
    if (!(Test-Path "$root\tools\node\node.exe")) {
    Write-Host 'Installing Node.js...'
    Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$node/node-$node-win-x64.zip" -OutFile $zip
    $sums = (Invoke-WebRequest -UseBasicParsing "https://nodejs.org/dist/$node/SHASUMS256.txt").Content
    $hash = ($sums -split "`n" | Where-Object { $_ -match "  node-$node-win-x64.zip$" }) -split '\s+' | Select-Object -First 1
    if (!$hash -or (Get-FileHash $zip -Algorithm SHA256).Hash.ToLower() -ne $hash) { throw 'Node archive checksum failed' }
    Expand-Archive $zip "$root\tools" -Force
    if (Test-Path "$root\tools\node") { Remove-Item "$root\tools\node" -Recurse -Force }
    Rename-Item "$root\tools\node-$node-win-x64" 'node'
    }
    $env:Path = "$root\tools\node;C:\Program Files\Git\cmd;$env:USERPROFILE\.cargo\bin;$env:Path"
    $rustup = "$root\tools\rustup-init.exe"
    $rustUrl = 'https://static.rust-lang.org/rustup/dist/x86_64-pc-windows-msvc/rustup-init.exe'
    if (!(Test-Path "$env:USERPROFILE\.cargo\bin\cargo.exe")) {
    Write-Host 'Installing Rust from its official checksum-verified archive...'
    Invoke-WebRequest -UseBasicParsing $rustUrl -OutFile $rustup
    Invoke-WebRequest -UseBasicParsing "$rustUrl.sha256" -OutFile "$rustup.sha256"
    $rustHash = (Get-Content "$rustup.sha256" -Raw).Trim()
    if ((Get-FileHash $rustup -Algorithm SHA256).Hash.ToLower() -ne $rustHash) { throw 'Rustup checksum failed' }
    & $rustup -y --default-toolchain stable --profile minimal --default-host x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Rust toolchain setup failed' }
    }
    rustup target add i686-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Rust target setup failed' }
    $machine = [Environment]::GetEnvironmentVariable('Path','Machine')
    [Environment]::SetEnvironmentVariable('Path', "$root\tools\node;C:\Program Files\Git\cmd;$env:USERPROFILE\.cargo\bin;$machine", 'Machine')
    # Remove temporary unattended login credentials after provisioning.
    $winlogon = 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Winlogon'
    Set-ItemProperty $winlogon AutoAdminLogon '0'
    Remove-ItemProperty $winlogon DefaultPassword -ErrorAction SilentlyContinue
    New-Item -ItemType File "$root\ready" -Force | Out-Null
} finally { Stop-Transcript }
