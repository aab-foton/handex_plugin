# ============================================================
# HANDEX — update-refs.ps1
# Atualiza o skeleton de referências DSC, rebuilda o plugin
# e commita as mudanças automaticamente.
#
# Pré-requisito: FIGMA_TOKEN definido como variável de ambiente
# do sistema (setado uma vez via setup-refs-task.ps1).
#
# Uso manual:   powershell -File scripts/update-refs.ps1
# Agendado:     Task Scheduler chama este script mensalmente
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$LogFile    = Join-Path $ProjectDir "scripts\update-refs.log"

function Log($msg) {
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $msg"
  Write-Host $line
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
}

Log "=== Iniciando atualização de refs DSC ==="

# Verifica token
if (-not $env:FIGMA_TOKEN) {
  Log "ERRO: variável FIGMA_TOKEN não encontrada. Execute setup-refs-task.ps1 primeiro."
  exit 1
}
Log "Token encontrado: $($env:FIGMA_TOKEN.Substring(0,8))..."

Set-Location $ProjectDir

# Fetch + rebuild skeleton
Log "Buscando componentes e estilos das bibliotecas DSC..."
npm run refs:rebuild 2>&1 | Tee-Object -Append -FilePath $LogFile
if ($LASTEXITCODE -ne 0) {
  Log "ERRO: refs:rebuild falhou (exit $LASTEXITCODE)"
  exit 1
}

# Rebuilda o plugin
Log "Rebuilding plugin bundle..."
npm run bundle:ui 2>&1 | Tee-Object -Append -FilePath $LogFile
if ($LASTEXITCODE -ne 0) {
  Log "ERRO: bundle:ui falhou"
  exit 1
}

npm run bundle:code 2>&1 | Tee-Object -Append -FilePath $LogFile
if ($LASTEXITCODE -ne 0) {
  Log "ERRO: bundle:code falhou"
  exit 1
}

# Verifica se houve mudanças
$changes = git status --porcelain src/plugin/refs src/plugin/ui.html src/plugin/code.bundle.js
if (-not $changes) {
  Log "Nenhuma mudança detectada nos refs — skeleton já estava atualizado."
  exit 0
}

# Coleta contagens para o commit message
$skeleton = Get-Content "src/plugin/refs/_skeleton.json" | ConvertFrom-Json
$totalComps = ($skeleton.libraries | ForEach-Object { $_.componentKeys.Count } | Measure-Object -Sum).Sum
$totalStyles = ($skeleton.libraries | ForEach-Object {
  $_.styleTokens.colors.Count + $_.styleTokens.typography.Count + $_.styleTokens.effects.Count
} | Measure-Object -Sum).Sum

# Commit
git add src/plugin/refs/ src/plugin/ui.html src/plugin/code.bundle.js src/plugin/styles/tailwind-compiled.css
$msg = "chore(refs): atualiza skeleton DSC automaticamente`n`n$totalComps component keys | $totalStyles styles`nGerado em $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $msg
if ($LASTEXITCODE -ne 0) {
  Log "ERRO: git commit falhou"
  exit 1
}

Log "=== Atualização concluída com sucesso ==="
Log "  $totalComps componentes | $totalStyles estilos commitados"
