param(
    [string]$TyporaPath,
    [string]$PluginHome,
    [switch]$NoPause,
    [string]$LogPath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"
$Host.UI.RawUI.WindowTitle = "Typrism Installer"

$script:TranscriptStarted = $false
$script:HadError = $false
$script:DefaultPluginHomeName = "Typrism"
$script:InstallerStateHomeName = "TyporaWritingCopilotInstaller"
$script:ScriptPath = $PSCommandPath
$script:ScriptDir = Split-Path -Parent $script:ScriptPath

function Start-InstallerLog {
    if (-not $LogPath) {
        $LogPath = Join-Path $script:ScriptDir "install_windows.log"
    }
    try {
        Start-Transcript -Path $LogPath -Force | Out-Null
        $script:TranscriptStarted = $true
    } catch {
        # Ignore transcript start failures.
    }
}

function Stop-InstallerLog {
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

function Get-DefaultPluginHomeRoot {
    return (Join-Path $env:LOCALAPPDATA $script:DefaultPluginHomeName)
}

function Get-InstallerStateRoot {
    return (Join-Path $env:LOCALAPPDATA $script:InstallerStateHomeName)
}

function Get-InstallerStatePath {
    return (Join-Path (Get-InstallerStateRoot) "install-state.json")
}

function Resolve-PluginHomeRoot {
    param(
        [string]$ConfiguredPath
    )

    if ([string]::IsNullOrWhiteSpace($ConfiguredPath)) {
        return (Get-DefaultPluginHomeRoot)
    }

    return [System.IO.Path]::GetFullPath($ConfiguredPath)
}

function Write-InstallState {
    param(
        [string]$WindowHtmlPath,
        [string]$PluginHomeRoot
    )

    $stateRoot = Get-InstallerStateRoot
    if (-not (Test-Path -LiteralPath $stateRoot)) {
        New-Item -ItemType Directory -Path $stateRoot -Force | Out-Null
    }

    $state = [ordered]@{
        windowHtmlPath = $WindowHtmlPath
        pluginHome = $PluginHomeRoot
        updatedAt = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 4

    Set-Content -LiteralPath (Get-InstallerStatePath) -Value $state -Encoding UTF8 -NoNewline
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
        [string]$CandidatePath
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
        } elseif ([System.IO.Path]::GetFileName($resolvedInput) -ieq "Typora.exe") {
            $exeRoot = Split-Path -Parent $resolvedInput
            Add-CandidateFile -RootPath $exeRoot -RelativePath "resources\\window.html"
            Add-CandidateFile -RootPath $exeRoot -RelativePath "resources\\app\\window.html"
        } else {
            Add-UniqueItem -List $candidateFiles -Value $resolvedInput
        }
    } else {
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
        if ($candidate -and (Test-Path -LiteralPath $candidate -PathType Leaf) -and
            ([System.IO.Path]::GetFileName($candidate) -ieq "window.html")) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    throw "Could not locate Typora's window.html automatically. Pass -TyporaPath with your Typora folder or window.html path."
}

function Upsert-Injection {
    param(
        [string]$WindowHtmlPath,
        [string]$EntryScriptPath
    )

    $markerStart = "<!-- Typrism -->"
    $markerEnd = "<!-- /Typrism -->"
    $entryUri = [System.Uri]::new($EntryScriptPath).AbsoluteUri
    $scriptTag = "<script type=`"module`" src=`"$entryUri`"></script>"
    $injectionBlock = "$markerStart`r`n$scriptTag`r`n$markerEnd"
    $markerPattern = '(?s)<!-- (Typrism|Typilot|Typora Writing Copilot) -->.*?<!-- /(Typrism|Typilot|Typora Writing Copilot) -->'

    $content = Get-Content -LiteralPath $WindowHtmlPath -Encoding UTF8 -Raw
    if ($content -match $markerPattern) {
        $updated = [System.Text.RegularExpressions.Regex]::Replace(
            $content,
            $markerPattern,
            [System.Text.RegularExpressions.MatchEvaluator]{ param($m) $injectionBlock }
        )
        Set-Content -LiteralPath $WindowHtmlPath -Value $updated -Encoding UTF8 -NoNewline
        return
    }

    if ($content -match '</body>') {
        $updated = $content -replace '</body>', "$injectionBlock`r`n</body>"
    } elseif ($content -match '</html>') {
        $updated = $content -replace '</html>', "$injectionBlock`r`n</html>"
    } else {
        $updated = $content + "`r`n" + $injectionBlock + "`r`n"
    }
    Set-Content -LiteralPath $WindowHtmlPath -Value $updated -Encoding UTF8 -NoNewline
}

function Warn-IfTyporaRunning {
    $running = @(Get-Process -Name "Typora" -ErrorAction SilentlyContinue)
    if ($running.Count -gt 0) {
        Write-Host "Typora appears to be running. Restart Typora after installation so the plugin can load." -ForegroundColor Yellow
    }
}

function Test-InjectionInstalled {
    param(
        [string]$WindowHtmlPath,
        [string]$EntryScriptPath
    )

    $content = Get-Content -LiteralPath $WindowHtmlPath -Encoding UTF8 -Raw
    $entryUri = [System.Uri]::new($EntryScriptPath).AbsoluteUri
    return (($content -like "*<!-- Typrism -->*") -or ($content -like "*<!-- Typilot -->*") -or ($content -like "*<!-- Typora Writing Copilot -->*")) -and ($content -like "*$entryUri*")
}

$banner = @"
Typrism
"@

try {
    Start-InstallerLog

    Write-Host $banner -ForegroundColor Cyan
    Write-Host ""

    $projectRoot = (Resolve-Path (Join-Path $script:ScriptDir "..")).Path
    $sourceSrc = Join-Path $projectRoot "src"
    if (-not (Test-Path -LiteralPath $sourceSrc -PathType Container)) {
        throw "Could not find runtime source folder: $sourceSrc"
    }

    $windowHtmlPath = Resolve-WindowHtmlPath -CandidatePath $TyporaPath
    $pluginHomeRoot = Resolve-PluginHomeRoot -ConfiguredPath $PluginHome
    $targetSrc = Join-Path $pluginHomeRoot "src"
    $entryScriptPath = Join-Path $targetSrc "entry-typora.js"

    if (Ensure-AdministratorIfNeeded -WindowHtmlPath $windowHtmlPath -TargetRootPath $pluginHomeRoot) {
        return
    }

    $installRoot = Split-Path -Parent $windowHtmlPath
    $backupPath = Join-Path $installRoot "window.html.typora-writing-copilot.bak"

    Write-Host "Typora window  : $windowHtmlPath" -ForegroundColor Cyan
    Write-Host "Plugin home    : $pluginHomeRoot" -ForegroundColor Cyan
    Write-Host "Entry script   : $entryScriptPath" -ForegroundColor Cyan
    Warn-IfTyporaRunning

    if (-not (Test-Path -LiteralPath $backupPath)) {
        Copy-Item -LiteralPath $windowHtmlPath -Destination $backupPath -Force
        Write-Host "Backup created : $backupPath" -ForegroundColor DarkGray
    }

    if (Test-Path -LiteralPath $pluginHomeRoot) {
        Remove-Item -LiteralPath $pluginHomeRoot -Recurse -Force
    }

    New-Item -ItemType Directory -Path $pluginHomeRoot -Force | Out-Null
    Copy-Item -LiteralPath $sourceSrc -Destination $targetSrc -Recurse -Force
    Upsert-Injection -WindowHtmlPath $windowHtmlPath -EntryScriptPath $entryScriptPath
    if (-not (Test-InjectionInstalled -WindowHtmlPath $windowHtmlPath -EntryScriptPath $entryScriptPath)) {
        throw "Installation verification failed: injection marker was not found in window.html."
    }
    Write-InstallState -WindowHtmlPath $windowHtmlPath -PluginHomeRoot $pluginHomeRoot

    Write-Host ""
    Write-Host "Typrism installed successfully." -ForegroundColor Green
    Write-Host "Restart Typora to load the plugin." -ForegroundColor Green
} catch {
    $script:HadError = $true
    Write-Host ""
    Write-Host "[ERROR] Installation failed." -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
} finally {
    if (-not $NoPause) {
        Wait-BeforeExit
    }
    Stop-InstallerLog
    if ($script:HadError) {
        exit 1
    }
}
