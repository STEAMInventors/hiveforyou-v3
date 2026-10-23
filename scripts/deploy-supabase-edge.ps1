#Requires -Version 5.1
<#
.SYNOPSIS
  Deploy Supabase Edge Functions v1-documents and v1-hives (with _shared modules).

.DESCRIPTION
  Validates repository layout, npx/Supabase CLI availability, authentication, and target
  project ref, then deploys each function in order. Stops on the first failed deploy.
  JWT verification follows supabase/config.toml (never passes --no-verify-jwt).
  Invokes the Supabase CLI via `npx --yes supabase@latest` (no global install required).

.PARAMETER ProjectRef
  Hosted Supabase project reference (20-char id). Falls back to SUPABASE_PROJECT_REF
  or supabase/.temp/project-ref after supabase link.

.EXAMPLE
  .\scripts\deploy-supabase-edge.ps1 -ProjectRef YOUR_PROJECT_REF
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $false)]
    [string]$ProjectRef = $env:SUPABASE_PROJECT_REF
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$FunctionNames = @("v1-documents", "v1-hives")

$RequiredRelativePaths = @(
    "supabase/config.toml",
    "supabase/functions/v1-documents/index.ts",
    "supabase/functions/v1-hives/index.ts",
    "supabase/functions/_shared/http.ts",
    "supabase/functions/_shared/hive-source-storage.ts"
)

function Write-Step {
    param([string]$Message)
    Write-Host "==> $Message"
}

function Get-RepositoryRoot {
    $cursor = if ($PSScriptRoot) { Split-Path -Parent $PSScriptRoot } else { (Get-Location).Path }
    while ($true) {
        $configPath = Join-Path $cursor "supabase\config.toml"
        if (Test-Path -LiteralPath $configPath) {
            return (Resolve-Path -LiteralPath $cursor).Path
        }
        $parent = Split-Path -Parent $cursor
        if (-not $parent -or $parent -eq $cursor) {
            throw "Could not locate repository root (missing supabase/config.toml)."
        }
        $cursor = $parent
    }
}

function Resolve-ProjectRef {
    param(
        [string]$RepoRoot,
        [string]$ExplicitRef
    )

    if ($ExplicitRef -and $ExplicitRef.Trim()) {
        return $ExplicitRef.Trim()
    }

    $linkedRefPath = Join-Path $RepoRoot "supabase\.temp\project-ref"
    if (Test-Path -LiteralPath $linkedRefPath) {
        $linked = (Get-Content -LiteralPath $linkedRefPath -Raw).Trim()
        if ($linked) {
            Write-Host "Using linked project ref from supabase/.temp/project-ref"
            return $linked
        }
    }

    throw @"
Project ref is required. Provide -ProjectRef, set SUPABASE_PROJECT_REF, or run:
  npx --yes supabase@latest link --project-ref <your-project-ref>
"@
}

function Assert-NpxAvailable {
    $cmd = Get-Command npx -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw @"
npx not found on PATH. Install Node.js (includes npm/npx), then retry:
  https://nodejs.org/
"@
    }
}

function Invoke-Supabase {
    param(
        [string[]]$Arguments
    )

    $npxArguments = @("--yes", "supabase@latest") + $Arguments
    Write-Host ("npx --yes supabase@latest " + ($Arguments -join " "))
    & npx @npxArguments
    $exitCode = $LASTEXITCODE
    if ($null -eq $exitCode) {
        $exitCode = 0
    }
    if ($exitCode -ne 0) {
        throw "Supabase CLI exited with code $exitCode."
    }
}

function Assert-RequiredFiles {
    param(
        [string]$RepoRoot,
        [string[]]$RelativePaths
    )

    $missing = @()
    foreach ($relative in $RelativePaths) {
        $full = Join-Path $RepoRoot ($relative -replace "/", "\")
        if (-not (Test-Path -LiteralPath $full)) {
            $missing += $relative
        }
    }
    if ($missing.Count -gt 0) {
        throw ("Missing required file(s):`n  " + ($missing -join "`n  "))
    }
}

function Assert-SupabaseAuthentication {
    if ($env:SUPABASE_ACCESS_TOKEN -and $env:SUPABASE_ACCESS_TOKEN.Trim()) {
        Write-Host "Using SUPABASE_ACCESS_TOKEN for CLI authentication."
        return
    }

    Write-Step "Checking Supabase CLI login (supabase projects list)"
    try {
        Invoke-Supabase -Arguments @("projects", "list")
    }
    catch {
        throw @"
Supabase CLI is not authenticated. Run 'npx --yes supabase@latest login' or set SUPABASE_ACCESS_TOKEN.
Original error: $($_.Exception.Message)
"@
    }
}

function Assert-TargetProject {
    param(
        [string]$ProjectRef
    )

    if ($ProjectRef -notmatch "^[a-z0-9]{20}$") {
        throw "Project ref must be a 20-character lowercase alphanumeric id; got '$ProjectRef'."
    }

    Write-Step "Verifying access to project ref $ProjectRef"
    try {
        Invoke-Supabase -Arguments @(
            "functions", "list", "--project-ref", $ProjectRef
        )
    }
    catch {
        throw @"
Could not access project '$ProjectRef'. Confirm the ref and your account permissions.
Original error: $($_.Exception.Message)
"@
    }
}

function Deploy-EdgeFunction {
    param(
        [string]$ProjectRef,
        [string]$FunctionName
    )

    Write-Step "Deploying Edge Function '$FunctionName' (bundles ../_shared imports via CLI)"
    try {
        Invoke-Supabase -Arguments @(
            "functions", "deploy", $FunctionName,
            "--project-ref", $ProjectRef,
            "--use-api"
        )
    }
    catch {
        throw "Deployment failed for function '$FunctionName': $($_.Exception.Message)"
    }
}

$repoRoot = Get-RepositoryRoot
Write-Step "Repository root: $repoRoot"

Assert-RequiredFiles -RepoRoot $repoRoot -RelativePaths $RequiredRelativePaths

Assert-NpxAvailable

$resolvedProjectRef = Resolve-ProjectRef -RepoRoot $repoRoot -ExplicitRef $ProjectRef
Write-Step "Target Supabase project ref: $resolvedProjectRef"

Assert-SupabaseAuthentication
Assert-TargetProject -ProjectRef $resolvedProjectRef

Push-Location -LiteralPath $repoRoot
try {
    foreach ($name in $FunctionNames) {
        Deploy-EdgeFunction -ProjectRef $resolvedProjectRef -FunctionName $name
    }
}
finally {
    Pop-Location
}

Write-Host ""
Write-Host "Success: deployed $($FunctionNames -join ' and ') to project $resolvedProjectRef."
Write-Host "JWT verification: unchanged (config.toml; script never uses --no-verify-jwt)."
