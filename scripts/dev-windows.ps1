# Launch Opal in Windows development mode with the native
# Tectonic dependencies configured for this process only.

$ErrorActionPreference = "Stop"

if ($env:OS -ne "Windows_NT") {
  Write-Error "This launcher is intended for Windows. Use 'pnpm dev:desktop' on macOS or Linux."
}

$RepoRoot = Split-Path -Parent $PSScriptRoot
$CargoBin = Join-Path $env:USERPROFILE ".cargo\bin"
$VcpkgRoot = Join-Path $env:USERPROFILE "vcpkg"
$VcpkgExe = Join-Path $VcpkgRoot "vcpkg.exe"
$VcpkgTriplet = "x64-windows-static-md"
$VcpkgInstalled = Join-Path $VcpkgRoot "installed\$VcpkgTriplet"

if (Test-Path -LiteralPath $CargoBin) {
  $env:PATH = "$CargoBin;$env:PATH"
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
  Write-Error "Rust/Cargo was not found. Run '.\scripts\build-windows.ps1 -SetupOnly' first, then open a new terminal."
}

$Pnpm = Get-Command pnpm.cmd -ErrorAction SilentlyContinue
if (-not $Pnpm) {
  $Pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
}
if (-not $Pnpm) {
  Write-Error "pnpm was not found. Run '.\scripts\build-windows.ps1 -SetupOnly' first."
}

if (-not (Test-Path -LiteralPath $VcpkgExe) -or -not (Test-Path -LiteralPath $VcpkgInstalled)) {
  Write-Error "The Windows Tectonic dependencies were not found. Run '.\scripts\build-windows.ps1 -SetupOnly' first."
}

$env:TECTONIC_DEP_BACKEND = "vcpkg"
$env:VCPKG_ROOT = $VcpkgRoot
$env:VCPKGRS_TRIPLET = $VcpkgTriplet
$env:VCPKG_DEFAULT_TRIPLET = $VcpkgTriplet
$env:CXXFLAGS = "/std:c++17"
$env:CFLAGS = ""

Write-Host "Starting Opal..." -ForegroundColor Cyan
Write-Host "  Repository: $RepoRoot"
Write-Host "  vcpkg:     $VcpkgRoot"
Write-Host "  Triplet:   $VcpkgTriplet"
Write-Host ""
Write-Host "Press Ctrl+C to stop the development server." -ForegroundColor DarkGray

Push-Location $RepoRoot
try {
  & $Pnpm.Source dev:desktop
  if ($LASTEXITCODE -ne 0) {
    throw "Opal exited with code $LASTEXITCODE."
  }
}
finally {
  Pop-Location
}
