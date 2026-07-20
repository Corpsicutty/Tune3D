# Tune3D — Blender MCP one-time setup (Windows)
# Run: powershell -ExecutionPolicy Bypass -File scripts/setup-blender-mcp.ps1

$ErrorActionPreference = "Stop"

$uvx = "$env:USERPROFILE\.local\bin\uvx.exe"
$addonUrl = "https://raw.githubusercontent.com/ahujasid/blender-mcp/main/addon.py"
$blenderVersions = Get-ChildItem "$env:APPDATA\Blender Foundation\Blender" -Directory -ErrorAction SilentlyContinue

if (-not (Test-Path $uvx)) {
  Write-Host "uvx not found. Install uv first: https://docs.astral.sh/uv/"
  exit 1
}

Write-Host "Prefetching blender-mcp package..."
& $uvx blender-mcp --help 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Warning: uvx blender-mcp returned exit $LASTEXITCODE (may still work once Blender addon is running)."
}

if (-not $blenderVersions) {
  Write-Host "No Blender user config found under $env:APPDATA\Blender Foundation\Blender"
  Write-Host "Open Blender once, then re-run this script."
  exit 1
}

foreach ($ver in $blenderVersions) {
  $addonsDir = Join-Path $ver.FullName "scripts\addons"
  New-Item -ItemType Directory -Force -Path $addonsDir | Out-Null
  $dest = Join-Path $addonsDir "blender_mcp.py"
  Write-Host "Installing addon -> $dest"
  Invoke-WebRequest -Uri $addonUrl -OutFile $dest -UseBasicParsing
}

Write-Host ""
Write-Host "Done. Manual steps in Blender (one time):"
Write-Host "  1. Edit -> Preferences -> Add-ons -> search 'Blender MCP' -> Enable"
Write-Host "  2. Press N in 3D view -> BlenderMCP tab -> Connect to MCP server"
Write-Host "  3. Restart Cursor, open Tune3D project — MCP config is in .cursor/mcp.json"
