# ============================================================
# HANDEX — setup-refs-task.ps1
# Configura o token do Figma e registra a tarefa agendada
# que roda update-refs.ps1 mensalmente.
#
# Execute UMA VEZ como Administrador:
#   powershell -ExecutionPolicy Bypass -File scripts/setup-refs-task.ps1
# ============================================================

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent $PSScriptRoot
$TaskName   = "Handex - Atualizar Refs DSC"
$UpdateScript = Join-Path $ProjectDir "scripts\update-refs.ps1"

Write-Host ""
Write-Host "=== HANDEX — Configuração de atualização automática DSC ===" -ForegroundColor Cyan
Write-Host ""

# Solicita token
$token = Read-Host "Cole seu Figma Personal Access Token"
if (-not $token -or $token.Length -lt 10) {
  Write-Host "Token inválido." -ForegroundColor Red
  exit 1
}

# Salva como variável de ambiente do sistema (persiste entre reinicializações)
[System.Environment]::SetEnvironmentVariable("FIGMA_TOKEN", $token, "User")
$env:FIGMA_TOKEN = $token
Write-Host "✓ FIGMA_TOKEN salvo como variável de ambiente do usuário" -ForegroundColor Green

# Remove tarefa anterior se existir
if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "✓ Tarefa anterior removida" -ForegroundColor Yellow
}

# Cria a tarefa agendada (toda primeira segunda-feira do mês, às 09h)
$trigger = New-ScheduledTaskTrigger -Weekly -WeeksInterval 4 -DaysOfWeek Monday -At "09:00"
$action  = New-ScheduledTaskAction `
  -Execute "powershell.exe" `
  -Argument "-ExecutionPolicy Bypass -NonInteractive -File `"$UpdateScript`"" `
  -WorkingDirectory $ProjectDir
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
  -RunOnlyIfNetworkAvailable `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $TaskName `
  -Trigger $trigger `
  -Action $action `
  -Settings $settings `
  -Description "Atualiza o skeleton de componentes DSC do plugin Handex mensalmente." `
  -RunLevel Highest | Out-Null

Write-Host "✓ Tarefa agendada criada: '$TaskName'" -ForegroundColor Green
Write-Host "  Executa toda primeira segunda-feira do mês às 09h" -ForegroundColor Gray
Write-Host ""
Write-Host "Para rodar manualmente agora:" -ForegroundColor Cyan
Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\update-refs.ps1"
Write-Host ""
Write-Host "Para ver o log de execuções:" -ForegroundColor Cyan
Write-Host "  scripts\update-refs.log"
Write-Host ""
