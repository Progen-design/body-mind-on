# Generate v6 email PNG assets using .NET System.Drawing.
# Produces JPG (renamed .jpg) under public/email-assets/v6/ with target <50 KB each.
# Designed to run on Windows PowerShell 5+ (System.Drawing built-in).

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $projectRoot "public\email-assets\v6"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-Bitmap {
    param([int]$Width, [int]$Height)
    $bmp = New-Object System.Drawing.Bitmap $Width, $Height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    return $bmp
}

function Get-Graphics {
    param([System.Drawing.Bitmap]$Bitmap)
    $g = [System.Drawing.Graphics]::FromImage($Bitmap)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    return $g
}

function Fill-LinearGradient {
    param(
        [System.Drawing.Graphics]$Graphics,
        [System.Drawing.Rectangle]$Rect,
        [int[]]$Stops,            # positions 0-100
        [string[]]$Colors,         # hex #RRGGBB
        [float]$AngleDegrees
    )
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($Rect, [System.Drawing.Color]::White, [System.Drawing.Color]::Black, $AngleDegrees)
    $blend = New-Object System.Drawing.Drawing2D.ColorBlend $Stops.Length
    $cols = @()
    $pos = @()
    for ($i = 0; $i -lt $Stops.Length; $i++) {
        $cols += [System.Drawing.ColorTranslator]::FromHtml($Colors[$i])
        $pos += [float]($Stops[$i] / 100.0)
    }
    $blend.Colors = $cols
    $blend.Positions = $pos
    $brush.InterpolationColors = $blend
    $Graphics.FillRectangle($brush, $Rect)
    $brush.Dispose()
}

function Add-RadialOverlay {
    param(
        [System.Drawing.Graphics]$Graphics,
        [int]$CanvasWidth,
        [int]$CanvasHeight,
        [int]$CenterXPct,
        [int]$CenterYPct,
        [int]$RadiusXPct,
        [int]$RadiusYPct,
        [string]$ColorHex,
        [int]$AlphaCenter,         # 0-255
        [int]$Steps = 30
    )
    $color = [System.Drawing.ColorTranslator]::FromHtml($ColorHex)
    $cx = [int]($CanvasWidth * $CenterXPct / 100.0)
    $cy = [int]($CanvasHeight * $CenterYPct / 100.0)
    $maxRx = [int]($CanvasWidth * $RadiusXPct / 100.0)
    $maxRy = [int]($CanvasHeight * $RadiusYPct / 100.0)

    for ($i = $Steps; $i -gt 0; $i--) {
        $frac = $i / [float]$Steps
        $rx = [int]($maxRx * $frac)
        $ry = [int]($maxRy * $frac)
        # Outer rings are nearly transparent; inner rings are fully tinted.
        $alpha = [int]($AlphaCenter * (1.0 - $frac) * (1.0 - $frac))
        if ($alpha -le 0) { continue }
        $c = [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B)
        $brush = New-Object System.Drawing.SolidBrush $c
        $Graphics.FillEllipse($brush, $cx - $rx, $cy - $ry, $rx * 2, $ry * 2)
        $brush.Dispose()
    }
}

function Draw-String-Centered {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [System.Drawing.Font]$Font,
        [string]$ColorHex,
        [int]$AlphaPct,
        [int]$CanvasWidth,
        [int]$Y
    )
    $color = [System.Drawing.ColorTranslator]::FromHtml($ColorHex)
    $a = [int](255 * $AlphaPct / 100.0)
    $c = [System.Drawing.Color]::FromArgb($a, $color.R, $color.G, $color.B)
    $brush = New-Object System.Drawing.SolidBrush $c
    $size = $Graphics.MeasureString($Text, $Font)
    $x = ($CanvasWidth - $size.Width) / 2.0
    $Graphics.DrawString($Text, $Font, $brush, $x, $Y)
    $brush.Dispose()
}

function Draw-String-At {
    param(
        [System.Drawing.Graphics]$Graphics,
        [string]$Text,
        [System.Drawing.Font]$Font,
        [string]$ColorHex,
        [int]$AlphaPct,
        [float]$X,
        [float]$Y
    )
    $color = [System.Drawing.ColorTranslator]::FromHtml($ColorHex)
    $a = [int](255 * $AlphaPct / 100.0)
    $c = [System.Drawing.Color]::FromArgb($a, $color.R, $color.G, $color.B)
    $brush = New-Object System.Drawing.SolidBrush $c
    $Graphics.DrawString($Text, $Font, $brush, $X, $Y)
    $brush.Dispose()
}

function Draw-Dots {
    param(
        [System.Drawing.Graphics]$Graphics,
        [int]$StartX,
        [int]$StartY,
        [int]$Cols,
        [int]$Rows,
        [int]$Spacing,
        [int]$Radius,
        [string]$ColorHex,
        [int]$AlphaPct
    )
    $color = [System.Drawing.ColorTranslator]::FromHtml($ColorHex)
    $a = [int](255 * $AlphaPct / 100.0)
    $c = [System.Drawing.Color]::FromArgb($a, $color.R, $color.G, $color.B)
    $brush = New-Object System.Drawing.SolidBrush $c
    for ($r = 0; $r -lt $Rows; $r++) {
        for ($col = 0; $col -lt $Cols; $col++) {
            $x = $StartX + $col * $Spacing
            $y = $StartY + $r * $Spacing
            $Graphics.FillEllipse($brush, $x, $y, $Radius * 2, $Radius * 2)
        }
    }
    $brush.Dispose()
}

function Save-Jpeg {
    param(
        [System.Drawing.Bitmap]$Bitmap,
        [string]$Path,
        [int]$Quality = 75
    )
    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" } | Select-Object -First 1
    $params = New-Object System.Drawing.Imaging.EncoderParameters 1
    $params.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$Quality)
    $Bitmap.Save($Path, $codec, $params)
    $params.Dispose()
}

# ─────────────────────────────────────────────
# hero.jpg — 1200×500, dark mesh gradient + brand
# ─────────────────────────────────────────────
function Generate-Hero {
    $w = 1200; $h = 500
    $bmp = New-Bitmap $w $h
    $g = Get-Graphics $bmp
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h

    Fill-LinearGradient $g $rect @(0, 50, 100) @("#0F0820", "#0A0815", "#06050A") 90

    # purple radial blob top-left
    Add-RadialOverlay $g $w $h 20 10 80 80 "#A855F7" 90
    # pink radial blob mid-right
    Add-RadialOverlay $g $w $h 90 30 70 70 "#EC4899" 60
    # accent gold spot bottom-center
    Add-RadialOverlay $g $w $h 50 100 60 60 "#F59E0B" 35

    $fontMonoLabel = New-Object System.Drawing.Font "Consolas", 14, ([System.Drawing.FontStyle]::Bold)
    $fontHeroTitle = New-Object System.Drawing.Font "Segoe UI", 78, ([System.Drawing.FontStyle]::Bold)
    $fontHeroSub = New-Object System.Drawing.Font "Segoe UI", 22, ([System.Drawing.FontStyle]::Regular)

    Draw-String-At $g "● BODY & MIND ON" $fontMonoLabel "#F8F4FF" 75 50 38
    Draw-String-At $g "▲ NEW WEEK" $fontMonoLabel "#A855F7" 90 1010 38
    Draw-String-Centered $g "TVŮJ TÝDEN" $fontHeroTitle "#F8F4FF" 100 $w 175
    Draw-String-Centered $g "Sedm dní. Začínáme." $fontHeroSub "#EC4899" 95 $w 320

    # decorative dots bottom-left
    Draw-Dots $g 50 420 8 3 22 3 "#A855F7" 40

    $fontMonoLabel.Dispose(); $fontHeroTitle.Dispose(); $fontHeroSub.Dispose()
    Save-Jpeg $bmp (Join-Path $outDir "hero.jpg") 72
    $g.Dispose(); $bmp.Dispose()
}

# ─────────────────────────────────────────────
# motto.jpg — 1200×400, centered ▲ PRAVIDLO TÝDNE ▲
# ─────────────────────────────────────────────
function Generate-Motto {
    $w = 1200; $h = 400
    $bmp = New-Bitmap $w $h
    $g = Get-Graphics $bmp
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h

    Fill-LinearGradient $g $rect @(0, 100) @("#0F0820", "#150A26") 135

    Add-RadialOverlay $g $w $h 50 50 90 90 "#A855F7" 120
    Add-RadialOverlay $g $w $h 50 50 60 60 "#EC4899" 60
    Add-RadialOverlay $g $w $h 50 50 30 30 "#F59E0B" 30

    # corner dot patterns
    Draw-Dots $g 80 60 8 2 24 3 "#F59E0B" 50
    Draw-Dots $g ($w - 80 - 7 * 24 - 6) 60 8 2 24 3 "#F59E0B" 50
    Draw-Dots $g 80 ($h - 60 - 24) 8 2 24 3 "#A855F7" 50
    Draw-Dots $g ($w - 80 - 7 * 24 - 6) ($h - 60 - 24) 8 2 24 3 "#A855F7" 50

    $fontLabel = New-Object System.Drawing.Font "Consolas", 14, ([System.Drawing.FontStyle]::Bold)
    Draw-String-Centered $g "▲   PRAVIDLO TÝDNE   ▲" $fontLabel "#F59E0B" 95 $w 130
    $fontLabel.Dispose()

    # subtle inner stroke
    $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(40, 168, 85, 247)), 1
    $g.DrawRectangle($pen, 24, 24, $w - 48, $h - 48)
    $pen.Dispose()

    Save-Jpeg $bmp (Join-Path $outDir "motto.jpg") 70
    $g.Dispose(); $bmp.Dispose()
}

# ─────────────────────────────────────────────
# day-header.jpg — 1200×250, dramatic 5-stop gradient
# ─────────────────────────────────────────────
function Generate-DayHeader {
    $w = 1200; $h = 250
    $bmp = New-Bitmap $w $h
    $g = Get-Graphics $bmp
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h

    Fill-LinearGradient $g $rect @(0, 25, 50, 80, 100) @("#1A0B33", "#4C1D95", "#7E22CE", "#BE185D", "#F59E0B") 135

    Add-RadialOverlay $g $w $h 50 50 70 100 "#FFFFFF" 30

    $fontLabel = New-Object System.Drawing.Font "Consolas", 14, ([System.Drawing.FontStyle]::Bold)
    Draw-String-At $g "▲ TVŮJ DEN" $fontLabel "#F8F4FF" 90 60 30
    Draw-String-At $g "DAILY PLAN" $fontLabel "#F8F4FF" 70 ($w - 200) 30
    $fontLabel.Dispose()

    Save-Jpeg $bmp (Join-Path $outDir "day-header.jpg") 70
    $g.Dispose(); $bmp.Dispose()
}

# ─────────────────────────────────────────────
# cta.jpg — 1200×500, explosive gradient
# ─────────────────────────────────────────────
function Generate-Cta {
    $w = 1200; $h = 500
    $bmp = New-Bitmap $w $h
    $g = Get-Graphics $bmp
    $rect = New-Object System.Drawing.Rectangle 0, 0, $w, $h

    Fill-LinearGradient $g $rect @(0, 20, 40, 70, 100) @("#1A0B33", "#4C1D95", "#7E22CE", "#BE185D", "#F59E0B") 135

    Add-RadialOverlay $g $w $h 75 50 60 80 "#F8F4FF" 40

    $fontLabel = New-Object System.Drawing.Font "Consolas", 14, ([System.Drawing.FontStyle]::Bold)
    Draw-String-Centered $g "▲   READY TO GO   ▲" $fontLabel "#F8F4FF" 80 $w 100
    $fontLabel.Dispose()

    $fontCta = New-Object System.Drawing.Font "Segoe UI", 64, ([System.Drawing.FontStyle]::Bold)
    Draw-String-Centered $g "Pojďme do toho." $fontCta "#F8F4FF" 100 $w 200
    $fontCta.Dispose()

    # particles bottom
    Draw-Dots $g 100 400 24 2 38 3 "#F8F4FF" 55

    Save-Jpeg $bmp (Join-Path $outDir "cta.jpg") 70
    $g.Dispose(); $bmp.Dispose()
}

Generate-Hero
Generate-Motto
Generate-DayHeader
Generate-Cta

Write-Host "`n=== Generated v6 PNG assets ==="
Get-ChildItem $outDir | Format-Table @{N="Name";E={$_.Name}}, @{N="KB";E={"{0:N1}" -f ($_.Length / 1024.0)}}, @{N="Dimensions";E={
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    $r = "$($img.Width)x$($img.Height)"
    $img.Dispose()
    $r
}}
