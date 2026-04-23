Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$scriptDir = Split-Path -Parent $PSCommandPath
$installScriptPath = Join-Path $scriptDir "install_windows.ps1"
$uninstallScriptPath = Join-Path $scriptDir "uninstall_windows.ps1"
$fallbackPluginHome = Join-Path $env:LOCALAPPDATA "TyporaWritingCopilot"

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

function Get-RegistryInstallRoots {
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

function Get-DetectedTyporaPath {
    $candidates = New-Object System.Collections.Generic.List[string]
    foreach ($root in Get-RegistryInstallRoots) {
        Add-UniqueItem -List $candidates -Value $root
    }

    $programFilesX86 = ${env:ProgramFiles(x86)}
    Add-UniqueItem -List $candidates -Value (Join-Path $env:LOCALAPPDATA "Programs\Typora")
    Add-UniqueItem -List $candidates -Value (Join-Path $env:ProgramFiles "Typora")
    if (-not [string]::IsNullOrWhiteSpace($programFilesX86)) {
        Add-UniqueItem -List $candidates -Value (Join-Path $programFilesX86 "Typora")
    }

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) {
            return (Resolve-Path -LiteralPath $candidate).Path
        }
    }

    return ""
}

function Get-DefaultPluginHomeForTyporaPath {
    param(
        [string]$TyporaPath
    )

    if ([string]::IsNullOrWhiteSpace($TyporaPath)) {
        return $fallbackPluginHome
    }

    try {
        $resolved = [System.IO.Path]::GetFullPath($TyporaPath)
        return (Join-Path $resolved "typora-writing-copilot")
    } catch {
        return $fallbackPluginHome
    }
}

function Select-FolderPath {
    param(
        [string]$Description,
        [string]$CurrentPath
    )

    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = $Description
    $dialog.ShowNewFolderButton = $true
    if ($CurrentPath -and (Test-Path -LiteralPath $CurrentPath)) {
        $dialog.SelectedPath = $CurrentPath
    }

    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
        return $dialog.SelectedPath
    }

    return $null
}

function Set-UiBusy {
    param(
        [bool]$Busy
    )

    $typoraTextBox.Enabled = -not $Busy
    $pluginTextBox.Enabled = -not $Busy
    $browseTyporaButton.Enabled = -not $Busy
    $browsePluginButton.Enabled = -not $Busy
    $autoDetectButton.Enabled = -not $Busy
    $installButton.Enabled = -not $Busy
    $uninstallButton.Enabled = -not $Busy
    $closeButton.Enabled = -not $Busy
}

function Invoke-WorkerScript {
    param(
        [string]$ScriptPath,
        [string]$TyporaPath,
        [string]$PluginHome
    )

    $logName = if ([System.IO.Path]::GetFileName($ScriptPath) -like "uninstall*") {
        "uninstall_windows_gui.log"
    } else {
        "install_windows_gui.log"
    }
    $logPath = Join-Path $scriptDir $logName
    if (Test-Path -LiteralPath $logPath) {
        Remove-Item -LiteralPath $logPath -Force
    }

    $arguments = @(
        "-ExecutionPolicy", "Bypass",
        "-NoProfile",
        "-File", $ScriptPath,
        "-NoPause",
        "-LogPath", $logPath
    )

    if (-not [string]::IsNullOrWhiteSpace($TyporaPath)) {
        $arguments += @("-TyporaPath", $TyporaPath)
    }
    if (-not [string]::IsNullOrWhiteSpace($PluginHome)) {
        $arguments += @("-PluginHome", $PluginHome)
    }

    $process = Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -Wait -PassThru -WindowStyle Hidden
    $logContent = if (Test-Path -LiteralPath $logPath) {
        Get-Content -LiteralPath $logPath -Raw -Encoding UTF8
    } else {
        ""
    }

    return [pscustomobject]@{
        ExitCode = $process.ExitCode
        LogPath = $logPath
        LogContent = $logContent
    }
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Typora 写作副驾安装器"
$form.StartPosition = "CenterScreen"
$form.Size = New-Object System.Drawing.Size(760, 560)
$form.MinimumSize = New-Object System.Drawing.Size(760, 560)
$form.MaximizeBox = $false
$form.FormBorderStyle = "FixedDialog"

$titleLabel = New-Object System.Windows.Forms.Label
$titleLabel.Text = "Typora 写作副驾安装器"
$titleLabel.Font = New-Object System.Drawing.Font("Segoe UI", 14, [System.Drawing.FontStyle]::Bold)
$titleLabel.AutoSize = $true
$titleLabel.Location = New-Object System.Drawing.Point(20, 18)
$form.Controls.Add($titleLabel)

$hintLabel = New-Object System.Windows.Forms.Label
$hintLabel.Text = "选择 Typora 目录和插件目录，然后点击安装。"
$hintLabel.AutoSize = $true
$hintLabel.Location = New-Object System.Drawing.Point(22, 52)
$form.Controls.Add($hintLabel)

$typoraLabel = New-Object System.Windows.Forms.Label
$typoraLabel.Text = "Typora 目录"
$typoraLabel.AutoSize = $true
$typoraLabel.Location = New-Object System.Drawing.Point(22, 92)
$form.Controls.Add($typoraLabel)

$typoraTextBox = New-Object System.Windows.Forms.TextBox
$typoraTextBox.Location = New-Object System.Drawing.Point(25, 112)
$typoraTextBox.Size = New-Object System.Drawing.Size(560, 27)
$detectedTyporaPath = Get-DetectedTyporaPath
$typoraTextBox.Text = $detectedTyporaPath
$form.Controls.Add($typoraTextBox)

$browseTyporaButton = New-Object System.Windows.Forms.Button
$browseTyporaButton.Text = "浏览..."
$browseTyporaButton.Location = New-Object System.Drawing.Point(598, 110)
$browseTyporaButton.Size = New-Object System.Drawing.Size(115, 30)
$browseTyporaButton.Add_Click({
    $selectedPath = Select-FolderPath -Description "选择 Typora 安装目录" -CurrentPath $typoraTextBox.Text
    if ($selectedPath) {
        $typoraTextBox.Text = $selectedPath
        $pluginTextBox.Text = Get-DefaultPluginHomeForTyporaPath -TyporaPath $selectedPath
    }
})
$form.Controls.Add($browseTyporaButton)

$pluginLabel = New-Object System.Windows.Forms.Label
$pluginLabel.Text = "插件目录"
$pluginLabel.AutoSize = $true
$pluginLabel.Location = New-Object System.Drawing.Point(22, 152)
$form.Controls.Add($pluginLabel)

$pluginTextBox = New-Object System.Windows.Forms.TextBox
$pluginTextBox.Location = New-Object System.Drawing.Point(25, 172)
$pluginTextBox.Size = New-Object System.Drawing.Size(560, 27)
$pluginTextBox.Text = Get-DefaultPluginHomeForTyporaPath -TyporaPath $detectedTyporaPath
$form.Controls.Add($pluginTextBox)

$browsePluginButton = New-Object System.Windows.Forms.Button
$browsePluginButton.Text = "浏览..."
$browsePluginButton.Location = New-Object System.Drawing.Point(598, 170)
$browsePluginButton.Size = New-Object System.Drawing.Size(115, 30)
$browsePluginButton.Add_Click({
    $selectedPath = Select-FolderPath -Description "选择插件文件存放目录" -CurrentPath $pluginTextBox.Text
    if ($selectedPath) {
        $pluginTextBox.Text = $selectedPath
    }
})
$form.Controls.Add($browsePluginButton)

$tipLabel = New-Object System.Windows.Forms.Label
$tipLabel.Text = "默认会建议放到 Typora 目录下的 typora-writing-copilot 文件夹。"
$tipLabel.AutoSize = $true
$tipLabel.Location = New-Object System.Drawing.Point(22, 213)
$form.Controls.Add($tipLabel)

$autoDetectButton = New-Object System.Windows.Forms.Button
$autoDetectButton.Text = "自动识别 Typora"
$autoDetectButton.Location = New-Object System.Drawing.Point(25, 244)
$autoDetectButton.Size = New-Object System.Drawing.Size(150, 34)
$autoDetectButton.Add_Click({
    $detected = Get-DetectedTyporaPath
    if ($detected) {
        $typoraTextBox.Text = $detected
        $pluginTextBox.Text = Get-DefaultPluginHomeForTyporaPath -TyporaPath $detected
    } else {
        [System.Windows.Forms.MessageBox]::Show(
            "没有自动识别到 Typora，请手动选择 Typora 目录。",
            "Typora 写作副驾",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Information
        ) | Out-Null
    }
})
$form.Controls.Add($autoDetectButton)

$installButton = New-Object System.Windows.Forms.Button
$installButton.Text = "安装"
$installButton.Location = New-Object System.Drawing.Point(490, 244)
$installButton.Size = New-Object System.Drawing.Size(105, 34)
$form.Controls.Add($installButton)

$uninstallButton = New-Object System.Windows.Forms.Button
$uninstallButton.Text = "卸载"
$uninstallButton.Location = New-Object System.Drawing.Point(608, 244)
$uninstallButton.Size = New-Object System.Drawing.Size(105, 34)
$form.Controls.Add($uninstallButton)

$logLabel = New-Object System.Windows.Forms.Label
$logLabel.Text = "输出日志"
$logLabel.AutoSize = $true
$logLabel.Location = New-Object System.Drawing.Point(22, 294)
$form.Controls.Add($logLabel)

$outputTextBox = New-Object System.Windows.Forms.TextBox
$outputTextBox.Location = New-Object System.Drawing.Point(25, 316)
$outputTextBox.Size = New-Object System.Drawing.Size(688, 180)
$outputTextBox.Multiline = $true
$outputTextBox.ScrollBars = "Vertical"
$outputTextBox.ReadOnly = $true
$outputTextBox.Font = New-Object System.Drawing.Font("Consolas", 9)
$form.Controls.Add($outputTextBox)

$closeButton = New-Object System.Windows.Forms.Button
$closeButton.Text = "关闭"
$closeButton.Location = New-Object System.Drawing.Point(608, 505)
$closeButton.Size = New-Object System.Drawing.Size(105, 32)
$closeButton.Add_Click({ $form.Close() })
$form.Controls.Add($closeButton)

function Run-Action {
    param(
        [string]$Mode
    )

    $typoraPath = $typoraTextBox.Text.Trim()
    $pluginHome = $pluginTextBox.Text.Trim()

    if ($Mode -eq "install" -and [string]::IsNullOrWhiteSpace($pluginHome)) {
        [System.Windows.Forms.MessageBox]::Show(
            "请选择插件目录。",
            "Typora 写作副驾",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Warning
        ) | Out-Null
        return
    }

    if ($Mode -eq "install" -and [string]::IsNullOrWhiteSpace($typoraPath)) {
        $confirmAuto = [System.Windows.Forms.MessageBox]::Show(
            "Typora 目录为空。安装器会尝试自动识别，是否继续？",
            "Typora 写作副驾",
            [System.Windows.Forms.MessageBoxButtons]::YesNo,
            [System.Windows.Forms.MessageBoxIcon]::Question
        )
        if ($confirmAuto -ne [System.Windows.Forms.DialogResult]::Yes) {
            return
        }
    }

    Set-UiBusy -Busy $true
    $actionLabel = if ($Mode -eq "uninstall") { "正在卸载..." } else { "正在安装..." }
    $outputTextBox.Text = $actionLabel + [Environment]::NewLine
    $form.Refresh()

    try {
        $scriptPath = if ($Mode -eq "uninstall") { $uninstallScriptPath } else { $installScriptPath }
        $result = Invoke-WorkerScript -ScriptPath $scriptPath -TyporaPath $typoraPath -PluginHome $pluginHome
        $outputTextBox.Text = if ($result.LogContent) { $result.LogContent } else { "没有捕获到输出内容。" }
        $doneText = if ($Mode -eq "uninstall") { "卸载成功。" } else { "安装成功。" }
        $failedActionText = if ($Mode -eq "uninstall") { "卸载" } else { "安装" }

        if ($result.ExitCode -eq 0) {
            [System.Windows.Forms.MessageBox]::Show(
                $doneText,
                "Typora 写作副驾",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Information
            ) | Out-Null
        } else {
            [System.Windows.Forms.MessageBox]::Show(
                ("{0}失败，请查看日志输出。`n`n日志文件：{1}" -f $failedActionText, $result.LogPath),
                "Typora 写作副驾",
                [System.Windows.Forms.MessageBoxButtons]::OK,
                [System.Windows.Forms.MessageBoxIcon]::Error
            ) | Out-Null
        }
    } catch {
        $outputTextBox.Text = $_.Exception.Message
        [System.Windows.Forms.MessageBox]::Show(
            $_.Exception.Message,
            "Typora 写作副驾",
            [System.Windows.Forms.MessageBoxButtons]::OK,
            [System.Windows.Forms.MessageBoxIcon]::Error
        ) | Out-Null
    } finally {
        Set-UiBusy -Busy $false
    }
}

$installButton.Add_Click({ Run-Action -Mode "install" })
$uninstallButton.Add_Click({ Run-Action -Mode "uninstall" })

[void]$form.ShowDialog()
