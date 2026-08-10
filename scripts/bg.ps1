<#
.SYNOPSIS
  Spustí dlouhoběžící příkaz na pozadí a hned se vrátí s ID jobu.

.DESCRIPTION
  Most mezi cloudem a tímto PC má tvrdý strop ~60 s na jedno volání nástroje.
  Blokující příkaz (build, test, import, npm install) se proto nikdy nedá
  dokončit v jednom volání — volání spadne na timeout, i když proces běží dál.

  Vzor je: spustit a hned se vrátit, výsledek vyzvednout dalším voláním
  přes scripts\bgstat.ps1.

  Joby žijí v %LOCALAPPDATA%\bmon-jobs, tedy mimo repozitář — do .gitignore
  se nic přidávat nemusí.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bg.ps1 `
    -Command "npm run test:unit" -WorkDir "C:\Users\prikopa\Documents\GitHub\body-mind-on"
  JOB 260810-002455-a1b2

  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bgstat.ps1 -Id 260810-002455-a1b2
#>
param(
  [Parameter(Mandatory)][string]$Command,
  [string]$WorkDir = (Get-Location).Path
)

$ErrorActionPreference = 'Stop'

$root = "$env:LOCALAPPDATA\bmon-jobs"
$id   = (Get-Date -Format 'yyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,4)
$dir  = Join-Path $root $id
New-Item -ItemType Directory -Force -Path $dir | Out-Null

# UTF8 s BOM schválně: bez něj PowerShell 5.1 načte soubor jako Windows-1250
# a diakritika v příkazu se rozsype ještě před spuštěním.
Set-Content -LiteralPath "$dir\cmd.ps1" -Value $Command -Encoding UTF8

$runner = @'
param($Dir, $WorkDir)
# Výstup i vstup UTF-8, jinak se čeština v out.log rozsype.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$ProgressPreference = 'SilentlyContinue'
# Continue, ne Stop: chceme dojet a zapsat exit kód, ne umřít bez stopy.
$ErrorActionPreference = 'Continue'
Set-Location -LiteralPath $WorkDir
$code = 0
try {
  $global:LASTEXITCODE = 0
  & "$Dir\cmd.ps1" *>&1 | Out-File -FilePath "$Dir\out.log" -Encoding UTF8 -Append
  if ($null -ne $LASTEXITCODE) { $code = $LASTEXITCODE }
} catch {
  ($_ | Out-String) | Out-File -FilePath "$Dir\out.log" -Encoding UTF8 -Append
  $code = 1
}
# Soubor `exit` se zapisuje POSLEDNÍ a je jediný signál "hotovo".
# Dokud neexistuje, job běží.
Set-Content -LiteralPath "$Dir\exit" -Value $code -Encoding ASCII
'@

Set-Content -LiteralPath "$dir\run.ps1" -Value $runner -Encoding UTF8

Start-Process -FilePath 'powershell' `
  -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File',"$dir\run.ps1",'-Dir',$dir,'-WorkDir',$WorkDir `
  -WindowStyle Hidden | Out-Null

Write-Output "JOB $id"
