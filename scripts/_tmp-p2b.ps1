[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$f = Get-ChildItem "C:\Users\prikopa\.claude\projects\C--Users-prikopa-Documents-GitHub-body-mind-on\*.jsonl" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
Write-Output ("CAS: " + $f.LastWriteTime)
$lines = Get-Content $f.FullName -Tail 30 -Encoding UTF8
foreach ($l in $lines) {
  try { $o = $l | ConvertFrom-Json } catch { continue }
  if ($o.type -eq 'assistant') {
    foreach ($c in $o.message.content) {
      if ($c.type -eq 'text' -and $c.text.Length -gt 300) {
        Write-Output "=====CHUNK====="
        Write-Output $c.text.Substring(0, [Math]::Min(2500, $c.text.Length))
      }
    }
  }
}
