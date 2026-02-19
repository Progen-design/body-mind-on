// /components/BodyFigure.js – Vizualizace postavy podle parametrů (váha, výška → BMI)
// Zobrazuje „předtím“ vs „teď“ – mění se podle postupu času

function bmiToBodyType(weight, height) {
  if (!weight || !height || height <= 0) return 0.5;
  const heightM = height / 100;
  const bmi = weight / (heightM * heightM);
  if (bmi < 18) return 0.2;
  if (bmi < 21) return 0.35;
  if (bmi < 24) return 0.5;
  if (bmi < 27) return 0.65;
  if (bmi < 30) return 0.8;
  return 0.95;
}

export default function BodyFigure({ weight, height, label, size = 120, id }) {
  const type = bmiToBodyType(weight, height);
  const torsoWidth = 28 + type * 24;
  const headSize = 22;
  const armTopY = headSize + 28;
  const gradId = id ? `bodyGrad-${id}` : 'bodyGrad';

  return (
    <div className="body-figure-wrap" title={weight && height ? `BMI: ${(weight / ((height/100)**2)).toFixed(1)}` : ''}>
      <svg
        viewBox="0 0 80 140"
        width={size}
        height={size * 1.75}
        className="body-figure-svg"
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.7" />
          </linearGradient>
        </defs>

        {/* Hlava */}
        <ellipse cx="40" cy={headSize} rx={headSize * 0.45} ry={headSize * 0.5} fill={`url(#${gradId})`} />

        {/* Krk */}
        <path d={`M ${40 - 6} ${headSize + 8} Q 40 ${headSize + 14} ${40 + 6} ${headSize + 8}`} fill={`url(#${gradId})`} />

        {/* Trup – šířka podle typu */}
        <ellipse
          cx="40"
          cy={headSize + 45}
          rx={torsoWidth}
          ry={28}
          fill={`url(#${gradId})`}
        />

        {/* Paže */}
        <path
          d={`M ${40 - torsoWidth - 2} ${armTopY} Q ${40 - torsoWidth - 6} ${armTopY + 20} ${40 - torsoWidth - 2} ${armTopY + 45}`}
          stroke={`url(#${gradId})`}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d={`M ${40 + torsoWidth + 2} ${armTopY} Q ${40 + torsoWidth + 6} ${armTopY + 20} ${40 + torsoWidth + 2} ${armTopY + 45}`}
          stroke={`url(#${gradId})`}
          strokeWidth="8"
          strokeLinecap="round"
          fill="none"
        />

        {/* Boky */}
        <path
          d={`M ${40 - torsoWidth * 0.9} ${headSize + 68} Q ${40} ${headSize + 82} ${40 + torsoWidth * 0.9} ${headSize + 68}`}
          fill={`url(#${gradId})`}
        />

        {/* Nohy */}
        <ellipse
          cx={40 - 12}
          cy={headSize + 105}
          rx={10 + type * 4}
          ry={18}
          fill={`url(#${gradId})`}
        />
        <ellipse
          cx={40 + 12}
          cy={headSize + 105}
          rx={10 + type * 4}
          ry={18}
          fill={`url(#${gradId})`}
        />
      </svg>
      {label && <span className="body-figure-label">{label}</span>}
      {weight != null && <span className="body-figure-meta">{weight} kg</span>}

      <style jsx>{`
        .body-figure-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
        }
        .body-figure-svg {
          filter: drop-shadow(0 4px 12px rgba(139, 92, 255, 0.3));
        }
        .body-figure-label {
          font-size: 13px;
          font-weight: 600;
          color: #a78bfa;
        }
        .body-figure-meta {
          font-size: 11px;
          color: #71717a;
        }
      `}</style>
    </div>
  );
}
