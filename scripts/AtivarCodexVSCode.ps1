[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$ProjectPath,

    [switch]$SkipExtensionUpdate
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$ExtensionId = 'openai.chatgpt'
$LogPath = Join-Path $PSScriptRoot 'ativar-codex-vscode.log'

function Write-Log {
    param([string]$Message)

    try {
        $timestamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
        Add-Content -LiteralPath $LogPath -Value "[$timestamp] $Message" -Encoding UTF8
    }
    catch {
        # O log e opcional e nunca deve impedir a abertura do Codex.
    }
}

function Show-Message {
    param(
        [string]$Text,
        [string]$Title,
        [System.Windows.Forms.MessageBoxIcon]$Icon
    )

    [void][System.Windows.Forms.MessageBox]::Show(
        $Text,
        $Title,
        [System.Windows.Forms.MessageBoxButtons]::OK,
        $Icon
    )
}

function Find-VSCodeCli {
    $commandNames = @('code.cmd', 'code', 'code-insiders.cmd', 'code-insiders')

    foreach ($commandName in $commandNames) {
        $command = Get-Command $commandName -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($null -ne $command -and $command.Source) {
            return $command.Source
        }
    }

    $candidatePaths = @(
        (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code\bin\code.cmd'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Microsoft VS Code Insiders\bin\code-insiders.cmd'),
        (Join-Path $env:ProgramFiles 'Microsoft VS Code\bin\code.cmd'),
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft VS Code\bin\code.cmd')
    ) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

    foreach ($candidatePath in $candidatePaths) {
        if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
            return $candidatePath
        }
    }

    throw 'O Visual Studio Code nao foi encontrado. Instala o VS Code e volta a executar este ficheiro.'
}

function Invoke-VSCodeCli {
    param(
        [string]$CliPath,
        [string[]]$Arguments
    )

    # stderr de comandos nativos (ex.: DeprecationWarning do node) nao e erro fatal.
    $ErrorActionPreference = 'Continue'
    $output = & $CliPath @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE

    if (-not [string]::IsNullOrWhiteSpace($output)) {
        Write-Log $output.Trim()
    }

    return [pscustomobject]@{
        ExitCode = $exitCode
        Output = $output.Trim()
    }
}

try {
    Add-Type -AssemblyName System.Windows.Forms

    Write-Log 'Inicio da ativacao do Codex no VS Code.'
    $vsCodeCli = Find-VSCodeCli
    Write-Log "VS Code CLI: $vsCodeCli"

    if ([string]::IsNullOrWhiteSpace($ProjectPath)) {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description = 'Escolhe a pasta principal do projeto que queres abrir no VS Code.'
        $dialog.ShowNewFolderButton = $false

        $documentsPath = [Environment]::GetFolderPath('MyDocuments')
        if (Test-Path -LiteralPath $documentsPath -PathType Container) {
            $dialog.SelectedPath = $documentsPath
        }

        if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
            Write-Log 'Operacao cancelada pelo utilizador.'
            exit 0
        }

        $ProjectPath = $dialog.SelectedPath
    }

    if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
        throw "A pasta escolhida nao existe: $ProjectPath"
    }

    $resolvedProjectPath = (Resolve-Path -LiteralPath $ProjectPath).ProviderPath
    Write-Log "Projeto: $resolvedProjectPath"

    $listResult = Invoke-VSCodeCli -CliPath $vsCodeCli -Arguments @('--list-extensions')
    if ($listResult.ExitCode -ne 0) {
        throw 'Nao foi possivel consultar as extensoes instaladas no VS Code.'
    }

    $installedExtensions = $listResult.Output -split "`r?`n"
    $codexWasInstalled = [bool]($installedExtensions -match '^openai\.chatgpt$')
    $extensionWarning = $null

    if (-not $SkipExtensionUpdate) {
        Write-Log 'A instalar ou atualizar a extensao oficial do Codex.'
        $installResult = Invoke-VSCodeCli -CliPath $vsCodeCli -Arguments @(
            '--install-extension',
            $ExtensionId,
            '--force'
        )

        if ($installResult.ExitCode -ne 0) {
            if (-not $codexWasInstalled) {
                throw "Falhou a instalacao da extensao oficial do Codex. $($installResult.Output)"
            }

            $extensionWarning = 'Nao foi possivel procurar atualizacoes agora; foi usada a versao do Codex que ja estava instalada.'
            Write-Log $extensionWarning
        }
    }
    elseif (-not $codexWasInstalled) {
        throw 'A extensao do Codex nao esta instalada e a atualizacao foi ignorada.'
    }

    Write-Log 'A abrir o projeto numa nova janela do VS Code.'
    $openResult = Invoke-VSCodeCli -CliPath $vsCodeCli -Arguments @(
        '--new-window',
        $resolvedProjectPath
    )

    if ($openResult.ExitCode -ne 0) {
        throw "O VS Code nao conseguiu abrir a pasta do projeto. $($openResult.Output)"
    }

    Start-Sleep -Seconds 3

    try {
        # A extensao regista este URI e usa-o para revelar o painel do Codex.
        Start-Process 'vscode://openai.chatgpt/'
        Write-Log 'Pedido para abrir o painel do Codex enviado ao VS Code.'
    }
    catch {
        Write-Log "Nao foi possivel abrir o painel por URI: $($_.Exception.Message)"
    }

    $successMessage = @(
        'O projeto foi aberto no VS Code e a extensao oficial do Codex esta ativa.'
        ''
        'Se aparecer o pedido de inicio de sessao, confirma-o uma vez no browser.'
    )

    if ($extensionWarning) {
        $successMessage += ''
        $successMessage += $extensionWarning
    }

    Show-Message -Text ($successMessage -join [Environment]::NewLine) `
        -Title 'Codex ativado' `
        -Icon ([System.Windows.Forms.MessageBoxIcon]::Information)

    Write-Log 'Ativacao concluida.'
    exit 0
}
catch {
    $errorMessage = $_.Exception.Message
    Write-Log "ERRO: $errorMessage"

    try {
        Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
        Show-Message `
            -Text ("Nao foi possivel concluir a ativacao.`n`n$errorMessage`n`nDetalhes: $LogPath") `
            -Title 'Erro ao ativar o Codex' `
            -Icon ([System.Windows.Forms.MessageBoxIcon]::Error)
    }
    catch {
        Write-Host "Nao foi possivel concluir a ativacao: $errorMessage" -ForegroundColor Red
        Write-Host "Detalhes: $LogPath"
    }

    exit 1
}
