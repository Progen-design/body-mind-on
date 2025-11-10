<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Tvůj osobní plán Body & Mind ON</title>
  <style>
    body {
      background-color: #0b0b14;
      color: #eaeaea;
      font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      margin: 0;
      padding: 0;
    }
    .container {
      max-width: 700px;
      margin: 40px auto;
      background: #11111d;
      border-radius: 16px;
      overflow: hidden;
      box-shadow: 0 0 20px rgba(0,0,0,0.3);
      border: 1px solid #1e1e2a;
    }
    .header {
      text-align: center;
      padding: 40px 20px 20px;
      background: linear-gradient(135deg, #0072ff, #00c6ff);
      color: white;
    }
    .header h1 {
      font-size: 26px;
      margin-bottom: 5px;
    }
    .header p {
      font-size: 15px;
      margin: 0;
    }
    .content {
      padding: 35px 40px;
    }
    h2 {
      color: #00c6ff;
      border-bottom: 1px solid #222;
      padding-bottom: 6px;
    }
    h3 {
      color: #80dfff;
      margin-top: 30px;
    }
    ul {
      list-style: none;
      padding-left: 0;
    }
    ul li::before {
      content: "• ";
      color: #00bfff;
    }
    .plan-box {
      background: #181824;
      padding: 20px;
      border-radius: 12px;
      margin: 20px 0;
      border: 1px solid #2a2a3d;
    }
    .cta {
      display: inline-block;
      background: linear-gradient(135deg, #0072ff, #00c6ff);
      color: white;
      text-decoration: none;
      font-weight: bold;
      border-radius: 30px;
      padding: 12px 24px;
      margin: 25px 0;
      text-align: center;
    }
    .footer {
      text-align: center;
      font-size: 13px;
      color: #888;
      padding: 25px;
      border-top: 1px solid #1f1f2e;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>💙 Tvůj osobní plán Body & Mind ON</h1>
      <p>Síla těla, klid mysli, rovnováha života</p>
    </div>
    <div class="content">
      <p>Ahoj,</p>
      <p>Tvůj AI trenér právě připravil osobní plán zaměřený na rovnováhu těla i mysli. 
      Níže najdeš detailní přehled tvého týdne:</p>

      <div class="plan-box">
        {{AI_PLAN_HTML}}
      </div>

      <p><strong>„Každý krok se počítá. I ten nejmenší tě posouvá vpřed.“ 🌿</strong></p>

      <div style="text-align:center;">
        <a href="https://app.bodyandmindon.cz" class="cta">Otevřít svůj plán</a>
      </div>

      <p>S respektem 💙<br>
      <b>Tým Body & Mind ON</b></p>
    </div>

    <div class="footer">
      © 2025 Body & Mind ON | 
      <a href="https://www.bodyandmindon.cz" style="color:#00bfff;text-decoration:none;">www.bodyandmindon.cz</a>
    </div>
  </div>
</body>
</html>
