<#
.SYNOPSIS
  Vyzvedne stav a výstup jobu spuštěného přes scripts\bg.ps1.

.DESCRIPTION
  Vrací jeden ze stavů:
    STATE RUNNING          job běží, soubor `exit` ještě neexistuje
    STATE DONE exit=<kód>  job doběhl
    UNKNOWN <id>           job s tímhle ID neexistuje (exit code 1)

  Za stavovým řádkem následuje posledních -Tail řádků z out.log.
  Volat se dá opakovaně, dokud nepadne DONE.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bgstat.ps1 -Id 260810-002455-a1b2
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\bgstat.ps1 -Id 260810-002455-a1b2 -Tail 200
#>
param(
  [Parameter(Mandatory)][string]$Id,
  [int]$Tail = 40
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$dir = Join-Path "$env:LOCALAPPDATA\bmon-jobs" $Id
if (-not (Test-Path $dir)) {
  Write-Output "UNKNOWN $Id"
  exit 1
}

# Pořadí je záměrné: nejdřív stav, pak log. Kdo čte jen první řádek, ví dost.
if (Test-Path "$dir\exit") {
  Write-Output ("STATE DONE exit=" + (Get-Content "$dir\exit" -Raw).Trim())
} else {
  Write-Output "STATE RUNNING"
}

if (Test-Path "$dir\out.log") {
  Get-Content "$dir\out.log" -Tail $Tail -Encoding UTF8
}
