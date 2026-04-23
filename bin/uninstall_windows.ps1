param(
    [string]$TyporaPath,
    [string]$PluginHome,
    [switch]$NoPause,
    [string]$LogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Typora Writing Copilot Uninstaller"

$script:TranscriptStarted = $false
$script:HadError = $false
$script:DefaultPluginHomeName = "TyporaWritingCopilot"
$script:InstallerStateHomeName = "TyporaWritingCopilotInstaller"
$script:ScriptPath = $PSCommandPath
$script:ScriptDir = Split-Path -Parent $script:ScriptPath

function Start-UninstallerLog {
    if (-not $LogPath) {
        $LogPath = Join-Path $script:ScriptDir "uninstall_windows.log"
    }
    try {
        Start-Transcript -Path $LogPath -Force | Out-Null
        $script:TranscriptStarted = $true
    } catch {
        # Ignore transcript start failures.
    }
}

function Stop-UninstallerLog {
    if ($script:TranscriptStarted) {
        try {
            Stop-Transcript | Out-Null
        } catch {
            # Ignore transcript stop failures.
        }
    }
}

function Wait-BeforeExit {
    Write-Host ""
    Write-Host "Press any key to exit..."
    $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
}

function Test-IsAdministrator {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentIdentity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Test-HasWriteAccess {
    param(
        [string]$LiteralPath,
        [string]$ParentDirectoryPath
    )

    try {
        if ($LiteralPath -and (Test-Path -LiteralPath $LiteralPath -PathType Leaf)) {
            $fileInfo = Get-Item -LiteralPath $LiteralPath
            $stream = $fileInfo.Open([System.IO.FileMode]::Open, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::Read)
            $stream.Close()
            return $true
        }

        if ($ParentDirectoryPath) {
            $probeName = "twc_write_test_{0}.tmp" -f ([System.Guid]::NewGuid().ToString("N"))
            $probePath = Join-Path $ParentDirectoryPath $probeName
            $stream = [System.IO.File]::Open($probePath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
            $stream.Close()
            Remove-Item -LiteralPath $probePath -Force
            return $true
        }
    } catch {
        return $false
    }

    return $false
}

function Ensure-AdministratorIfNeeded {
    param(
        [string]$WindowHtmlPath,
        [string]$TargetRootPath
    )

    if (Test-IsAdministrator) {
        return $false
    }

    $windowDirectory = Split-Path -Parent $WindowHtmlPath
    if ((Test-HasWriteAccess -LiteralPath $WindowHtmlPath -ParentDirectoryPath $windowDirectory) -and
        (Test-HasWriteAccess -ParentDirectoryPath (Split-Path -Parent $TargetRootPath))) {
        return $false
    }

    $arguments = @("-ExecutionPolicy", "Bypass", "-NoProfile", "-File", "`"$script:ScriptPath`"")
    if ($TyporaPath) {
        $arguments += @("-TyporaPath", "`"$TyporaPath`"")
    }
    if ($PluginHome) {
        $arguments += @("-PluginHome", "`"$PluginHome`"")
    }
    if ($NoPause) {
        $arguments += "-NoPause"
    }
    if ($LogPath) {
        $arguments += @("-LogPath", "`"$LogPath`"")
    }

    Write-Host "Administrator privileges are required. Attempting to elevate..." -ForegroundColor Yellow
    try {
        Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait | Out-Null
        return $true
    } catch {
        throw "Elevation was cancelled or failed."
    }
}

function Get-DefaultPluginHomeRoot {
    return (Join-Path $env:LOCALAPPDATA $script:DefaultPluginHomeName)
}

function Get-InstallerStateRoot {
    return (Join-Path $env:LOCALAPPDATA $script:InstallerStateHomeName)
}

function Get-InstallerStatePath {
    return (Join-Path (Get-InstallerStateRoot) "install-state.json")
}

function Read-InstallState {
    $statePath = Get-InstallerStatePath
    if (-not (Test-Path -LiteralPath $statePath -PathType Leaf)) {
        return $null
    }

    try {
        return (Get-Content -LiteralPath $statePath -Encoding UTF8 -Raw | ConvertFrom-Json)
    } catch {
        return $null
    }
}

function Remove-InstallState {
    $statePath = Get-InstallerStatePath
    if (Test-Path -LiteralPath $statePath -PathType Leaf) {
        Remove-Item -LiteralPath $statePath -Force
    }
}

function Resolve-PluginHomeRoot {
    param(
        [string]$ConfiguredPath,
        [object]$State
    )

    if (-not [string]::IsNullOrWhiteSpace($ConfiguredPath)) {
        return [System.IO.Path]::GetFullPath($ConfiguredPath)
    }

    if ($State -and $State.pluginHome -and -not [string]::IsNullOrWhiteSpace([string]$State.pluginHome)) {
        return [System.IO.Path]::GetFullPath([string]$State.pluginHome)
    }

    return (Get-DefaultPluginHomeRoot)
}

function Add-UniqueItem {
    param(
        [System.Collections.Generic.List[string]]$List,
        [string]$Value
    )

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return
    }

    $normalized = $Value.Trim().Trim('"')
    if (-not $List.Contains($normalized)) {
        $List.Add($normalized)
    }
}

function Resolve-RegistryInstallRoots {
    $roots = New-Object System.Collections.Generic.List[string]
    $registryPatterns = @(
        "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    foreach ($pattern in $registryPatterns) {
        $items = @(Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue | Where-Object {
                $_.DisplayName -and $_.DisplayName -like "Typora*"
            })
        foreach ($item in $items) {
            Add-UniqueItem -List $roots -Value $item.InstallLocation

            foreach ($rawValue in @($item.DisplayIcon, $item.UninstallString)) {
                if ([string]::IsNullOrWhiteSpace($rawValue)) {
                    continue
                }
                $trimmed = $rawValue.Trim().Trim('"')
                if ($trimmed -match '^[A-Za-z]:\\[^",]+?\.exe') {
                    $exePath = $Matches[0]
                    if (Test-Path -LiteralPath $exePath -PathType Leaf) {
                        Add-UniqueItem -List $roots -Value (Split-Path -Parent $exePath)
                    }
                }
            }
        }
    }

    return $roots
}

function Resolve-WindowHtmlPath {
    param(
        [string]$CandidatePath,
        [object]$State
    )

    $candidateFiles = New-Object System.Collections.Generic.List[string]
    function Add-CandidateFile {
        param(
            [string]$RootPath,
            [string]$RelativePath
        )
        if ([string]::IsNullOrWhiteSpace($RootPath)) {
            return
        }
        Add-UniqueItem -List $candidateFiles -Value (Join-Path $RootPath $RelativePath)
    }

    if ($CandidatePath) {
        $resolvedInput = (Resolve-Path -LiteralPath $CandidatePath).Path
        if ((Get-Item -LiteralPath $resolvedInput).PSIsContainer) {
            Add-UniqueItem -List $candidateFiles -Value (Join-Path $resolvedInput "window.html")
            Add-CandidateFile -RootPath $resolvedInput -RelativePath "resources\\window.html"
            Add-CandidateFile -RootPath $resolvedInput -RelativePath "resources\\app\\window.html"
        } else {
            Add-UniqueItem -List $candidateFiles -Value $resolvedInput
        }
    } else {
        if ($State -and $State.windowHtmlPath -and -not [string]::IsNullOrWhiteSpace([string]$State.windowHtmlPath)) {
            Add-UniqueItem -List $candidateFiles -Value ([string]$State.windowHtmlPath)
        }

        foreach ($registryRoot in Resolve-RegistryInstallRoots) {
            Add-UniqueItem -List $candidateFiles -Value (Join-Path $registryRoot "resources\\window.html")
            Add-UniqueItem -List $candidateFiles -Value (Join-Path $registryRoot "resources\\app\\window.html")
            Add-UniqueItem -List $candidateFiles -Value (Join-Path $registryRoot "window.html")
        }

        $programFilesX86 = ${env:ProgramFiles(x86)}
        Add-CandidateFile -RootPath $env:LOCALAPPDATA -RelativePath "Programs\\Typora\\resources\\window.html"
        Add-CandidateFile -RootPath $env:LOCALAPPDATA -RelativePath "Programs\\Typora\\resources\\app\\window.html"
        Add-CandidateFile -RootPath $env:ProgramFiles -RelativePath "Typora\\resources\\window.html"
        Add-CandidateFile -RootPath $env:ProgramFiles -RelativePath "Typora\\resources\\app\\window.html"
        Add-CandidateFile -RootPath $programFilesX86 -RelativePath "Typora\\resources\\window.html"
        Add-CandidateFile -RootPath $programFilesX86 -RelativePath "Typora\\resources\\app\\window.html"
    }

    foreach ($candidate in $candidateFiles) {
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Could not locate Typora's window.html automatically. Pass -TyporaPath with your Typora folder or window.html path."
}

function Remove-Injection {
    param(
        [string]$WindowHtmlPath
    )

    $markerPattern = '(?s)\s*<!-- Typora Writing Copilot -->.*?<!-- /Typora Writing Copilot -->\s*'
    $content = Get-Content -LiteralPath $WindowHtmlPath -Encoding UTF8 -Raw
    $updated = [System.Text.RegularExpressions.Regex]::Replace(
        $content,
        $markerPattern,
        [System.Text.RegularExpressions.MatchEvaluator]{ param($m) "`r`n" }
    )
    Set-Content -LiteralPath $WindowHtmlPath -Value $updated.TrimEnd() -Encoding UTF8 -NoNewline
}

$banner = @"
  _______                       __        __      __      __  ___      _           __        ____
 /_  __(_)___  ____  _________ / /_____ _/ /_    / /___ _/ /_/ (_)____(_)___  ____/ /__     / __ \
  / / / / __ \/ __ \/ ___/ __ `/ __/ __ `/ __ \  / / __ `/ __/ / / ___/ / __ \/ __  / _ \   / /_/ /
 / / / / /_/ / /_/ / /  / /_/ / /_/ /_/ / /_/ / / / /_/ / /_/ / / /__/ / /_/ / /_/ /  __/  / _, _/
/_/ /_/ .___/\____/_/   \__,_/\__/\__,_/_.___/_/ /\__,_/\__/_/_/\___/_/\____/\__,_/\___/  /_/ |_|
     /_/                                    /___/
"@

try {
    Start-UninstallerLog

    Write-Host $banner -ForegroundColor Cyan
    Write-Host ""

    $installState = Read-InstallState
    $windowHtmlPath = Resolve-WindowHtmlPath -CandidatePath $TyporaPath -State $installState
    $pluginHomeRoot = Resolve-PluginHomeRoot -ConfiguredPath $PluginHome -State $installState
    if (Ensure-AdministratorIfNeeded -WindowHtmlPath $windowHtmlPath -TargetRootPath $pluginHomeRoot) {
        return
    }

    Write-Host "Typora window  : $windowHtmlPath" -ForegroundColor Cyan
    Write-Host "Plugin home    : $pluginHomeRoot" -ForegroundColor Cyan

    Remove-Injection -WindowHtmlPath $windowHtmlPath

    if (Test-Path -LiteralPath $pluginHomeRoot) {
        Remove-Item -LiteralPath $pluginHomeRoot -Recurse -Force
    }
    Remove-InstallState

    Write-Host ""
    Write-Host "Typora Writing Copilot uninstalled successfully." -ForegroundColor Green
    Write-Host "Restart Typora to apply the removal." -ForegroundColor Green
} catch {
    $script:HadError = $true
    Write-Host ""
    Write-Host "[ERROR] Uninstallation failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    if (-not $NoPause) {
        Wait-BeforeExit
    }
    Stop-UninstallerLog
    if ($script:HadError) {
        exit 1
    }
}
