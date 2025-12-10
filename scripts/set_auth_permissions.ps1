<#
Set NTFS permissions on auth artifacts so only the current user may read/write.
Run this script from the repository root in an elevated PowerShell session (Run as Administrator).
#>

$repo = Split-Path -Parent $MyInvocation.MyCommand.Definition
$authDir = Join-Path $repo 'auth'
$files = @('users.db', 'auth_tokens.db', '.oauth_key')

Write-Host "Repository: $repo"
Write-Host "Auth dir: $authDir"

foreach ($f in $files) {
    $path = Join-Path $authDir $f
    if (Test-Path $path) {
        Write-Host "Applying permissions to: $path"
        try {
            # Remove inherited ACEs
            icacls $path /inheritance:r | Out-Null
            # Grant full control to current user (modify as needed)
            icacls $path /grant:r "$($env:USERNAME):(R,W)" | Out-Null
            # Remove common broad groups (ignore errors)
            icacls $path /remove "Users" "Authenticated Users" "Everyone" | Out-Null
            Write-Host "[OK] tightened permissions on $path"
        } catch {
            Write-Warning "Failed to set permissions on $path: $_"
        }
    } else {
        Write-Host "Not found (skipping): $path"
    }
}

# Also tighten uploads directory (avatars) if present
$avatars = Join-Path $repo 'static\uploads\avatars'
if (Test-Path $avatars) {
    Write-Host "Applying permissions to avatars directory: $avatars"
    try {
        Get-ChildItem -Path $avatars -File -Recurse | ForEach-Object {
            $p = $_.FullName
            icacls $p /inheritance:r | Out-Null
            icacls $p /grant:r "$($env:USERNAME):(R,W)" | Out-Null
        }
        Write-Host "[OK] tightened permissions on avatar files"
    } catch {
        Write-Warning "Failed to set avatar permissions: $_"
    }
} else {
    Write-Host "Avatars directory not found: $avatars"
}

Write-Host "Permission script finished. Review output for any warnings."
