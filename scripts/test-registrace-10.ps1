# Testovaci registrace 10 uzivatelu pres produkcni /api/body-metrics.
# Stejny endpoint i payload, jaky posila registracni formular.
$ErrorActionPreference = 'Continue'
$url = 'https://app.bodyandmindon.cz/api/body-metrics'
$heslo = 'TestBmon2026!'

$profily = @(
  @{ n='u01'; name='Petra Nova';     gender='female'; bd='1994-03-12'; h='168'; w='72';  act='sedavy';        stress='high';   work='office_it';    goal='redukce';   freq='2-3x tydne'; days=@(1,3,5);   env='home_bodyweight'; eq=@();                      diet='';            prog='START' },
  @{ n='u02'; name='Martin Dvorak';  gender='male';   bd='1988-07-30'; h='183'; w='95';  act='sedavy';   stress='medium'; work='office_it';    goal='redukce';   freq='4-5x tydne'; days=@(1,2,4,6); env='gym';             eq=@();                      diet='';            prog='START' },
  @{ n='u03'; name='Lucie Kralova';  gender='female'; bd='2001-11-05'; h='172'; w='58';  act='velmi';      stress='low';    work='manual';   goal='nabirani_svaly';   freq='4-5x tydne'; days=@(1,2,3,5,6); env='gym';           eq=@();                      diet='vegetarian';  prog='START' },
  @{ n='u04'; name='Tomas Svoboda';  gender='male';   bd='1975-01-22'; h='178'; w='88';  act='stredne';stress='high';   work='teacher_sales'; goal='udrzovani';    freq='2-3x tydne'; days=@(2,4,6);   env='home_equipment';  eq=@('dumbbells','bands');   diet='gluten_free'; prog='START' },
  @{ n='u05'; name='Eva Cerna';      gender='female'; bd='1968-09-18'; h='160'; w='79';  act='sedavy';        stress='medium'; work='office_it';    goal='redukce';   freq='1-2x tydne'; days=@(2,5);     env='home_bodyweight'; eq=@();                      diet='lactose_free';prog='START' },
  @{ n='u06'; name='Jakub Vesely';   gender='male';   bd='1999-05-02'; h='190'; w='72';  act='sedavy';   stress='low';    work='office_it';    goal='nabirani_svaly';   freq='4-5x tydne'; days=@(1,3,5,6); env='home_equipment';  eq=@('dumbbells','pullup_bar'); diet='';        prog='START' },
  @{ n='u07'; name='Klara Bilkova';  gender='female'; bd='1991-12-14'; h='165'; w='63';  act='stredne';stress='high';   work='teacher_sales'; goal='udrzovani';    freq='2-3x tydne'; days=@(1,3,6);   env='gym';             eq=@();                      diet='low_carb';    prog='START' },
  @{ n='u08'; name='Radek Horak';    gender='male';   bd='1983-04-09'; h='176'; w='110'; act='sedavy';        stress='high';   work='office_it';    goal='redukce';   freq='2-3x tydne'; days=@(2,4,7);   env='home_bodyweight'; eq=@();                      diet='';            prog='START' },
  @{ n='u09'; name='Nikola Mala';    gender='female'; bd='2004-08-26'; h='158'; w='50';  act='velmi';      stress='low';    work='manual';   goal='nabirani_svaly';   freq='4-5x tydne'; days=@(1,2,4,5,6); env='gym';           eq=@();                      diet='';            prog='START' },
  @{ n='u10'; name='Ondrej Maly';    gender='male';   bd='1962-02-11'; h='170'; w='84';  act='sedavy';   stress='medium'; work='office_it';    goal='udrzovani';      freq='1-2x tydne'; days=@(3,6);     env='home_equipment';  eq=@('bands');               diet='vegetarian';  prog='START' }
)

$vysledky = @()
foreach ($p in $profily) {
  $telo = @{
    name = $p.name
    email = "janprikopa+$($p.n)b@gmail.com"
    password = $heslo
    passwordConfirm = $heslo
    gender = $p.gender
    birth_date = $p.bd
    height = $p.h
    weight = $p.w
    smart_scale_choice = 'none'
    activity = $p.act
    stress = $p.stress
    worktype = $p.work
    goal = $p.goal
    frequency = $p.freq
    workout_days = $p.days
    training_environment = $p.env
    training_environment_detail = ''
    available_equipment = $p.eq
    diet_type = $p.diet
    dietary_restrictions = ''
    foods_to_avoid = ''
    notes = ''
    program = $p.prog
    devices = @()
    selected_habits = @()
  } | ConvertTo-Json -Depth 5 -Compress

  $zacatek = Get-Date
  try {
    $r = Invoke-WebRequest -Uri $url -Method POST -ContentType 'application/json' -Body $telo -UseBasicParsing -TimeoutSec 180
    $obsah = $r.Content
    $stav = $r.StatusCode
  } catch {
    $obsah = $_.ErrorDetails.Message
    if (-not $obsah) { $obsah = $_.Exception.Message }
    $stav = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
  }
  $trvani = [math]::Round(((Get-Date) - $zacatek).TotalSeconds, 1)
  $vysledky += [pscustomobject]@{ ucet = $p.n; email = "janprikopa+$($p.n)b@gmail.com"; stav = $stav; sekund = $trvani; odpoved = $obsah }
  "$($p.n)  HTTP $stav  ${trvani}s  $obsah"
}

$vysledky | ConvertTo-Json -Depth 5 | Set-Content "$env:TEMP\registrace10.json" -Encoding UTF8
"=== HOTOVO ==="

