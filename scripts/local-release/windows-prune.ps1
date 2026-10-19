param(
    [ValidatePattern('^(desktop|helper)-[0-9a-f]{40}$')][string]$CurrentJob,
    [long]$MinimumFreeBytes = 8589934592
)
$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
$jobs = 'C:\16c-build\jobs'
$free = (Get-PSDrive -Name C).Free
if ($free -ge $MinimumFreeBytes) { exit 0 }

# Job sources are disposable build inputs. Keep every job's artifacts and metadata.
$cutoff = (Get-Date).AddHours(-12)
$stale = Get-ChildItem -LiteralPath $jobs -Directory |
    Where-Object { $_.Name -ne $CurrentJob -and $_.Name -match '^(desktop|helper)-[0-9a-f]{40}$' -and $_.LastWriteTime -lt $cutoff } |
    Sort-Object LastWriteTime
foreach ($job in $stale) {
    foreach ($name in @('source', 'source.tar')) {
        $path = Join-Path $job.FullName $name
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Recurse -Force }
    }
    $free = (Get-PSDrive -Name C).Free
    if ($free -ge $MinimumFreeBytes) { break }
}
if ($free -lt $MinimumFreeBytes) {
    throw "Windows build drive has only $free bytes free; need $MinimumFreeBytes. Stale job sources were pruned without removing artifacts."
}
Write-Output "Windows build drive ready: $free bytes free"
