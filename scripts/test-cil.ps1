# Izolovany test: STEJNY clovek, tri ruzne cile. Meni se jen goal.
# Odpovida na otazku, jestli cil z registrace vubec ovlivni kalorie.
$ErrorActionPreference = 'Continue'
$url = 'https://app.bodyandmindon.cz/api/body-metrics'
$heslo = 'TestBmon2026!'

$cile = @(
  @{ n='c1'; goal='redukce' },
  @{ n='c2'; goal='nabirani_svaly' },
  @{ n='c3'; goal='udrzovani' }
)

foreach ($c in $cile) {
  $telo = @{
    name = "Test Cil $($c.n)"
    email = "janprikopa+$($c.n)@gmail.com"
    password = $heslo; passwordConfirm = $heslo
    gender = 'male'; birth_date = '1991-06-15'; height = '180'; weight = '85'
    smart_scale_choice = 'none'
    activity = 'stredne'; stress = 'medium'; worktype = 'office_it'
    goal = $c.goal
    frequency = '2-3x tydne'; workout_days = @(1,3,5)
    training_environment = 'gym'; training_environment_detail = ''
    available_equipment = @(); diet_type = ''
    dietary_restrictions = ''; foods_to_avoid = ''; notes = ''
    program = 'START'; devices = @(); selected_habits = @()
  } | ConvertTo-Json -Depth 5 -Compress

  try {
    $r = Invoke-WebRequest -Uri $url -Method POST -ContentType 'application/json' -Body $telo -UseBasicParsing -TimeoutSec 180
    "$($c.n)  $($c.goal)  HTTP $($r.StatusCode)"
  } catch {
    $m = $_.ErrorDetails.Message; if (-not $m) { $m = $_.Exception.Message }
    "$($c.n)  $($c.goal)  CHYBA  $m"
  }
  Start-Sleep -Seconds 3
}
"=== HOTOVO ==="
