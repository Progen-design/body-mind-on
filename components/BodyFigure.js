// /components/BodyFigure.js – Atraktivní vizualizace postavy (BMI → tvar), varianty Předtím / Teď
function bmiToShape(weight, height) {
  if (!weight || !height || height <= 0) return { torso: 0.5, legs: 0.5 };
  const bmi = weight / ((height / 100) ** 2);
  const t = bmi < 18 ? 0.15 : bmi < 22 ? 0.35 : bmi < 26 ? 0.5 : bmi < 30 ? 0.7 : 0.9;
  const l = bmi < 20 ? 0.3 : bmi < 26 ? 0.5 : 0.75;
  return { torso: t, legs: l };
}

export default function BodyFigure({ weight, height, label, size = 120, id, variant, weightDiff }) {
  const { torso, legs } = bmiToShape(weight, height);
  const gradId = id ? `bodyGrad-${id}` : 'bodyGrad';
  const isBefore = variant === 'before';
  const isNow = variant === 'now';

  const w = 80;
  const h = 120;
  const cx = w / 2;
  const headR = 14;
  const shoulderY = headR + 18;
  const waistY = headR + 52;
  const hipY = headR + 72;
  const footY = h - 8;

  const shoulderW = 22 + torso * 18;
  const waistW = 16 + torso * 16;
  const hipW = 18 + torso * 14;
  const thighW = 8 + legs * 8;

  const fillUrl = `url(#${gradId})`;

  return (
    <div
      className={`body-figure-wrap ${isBefore ? 'body-figure-before' : ''} ${isNow ? 'body-figure-now' : ''}`}
      title={weight && height ? `BMI: ${(weight / ((height / 100) ** 2)).toFixed(1)}` : ''}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        width={size}
        height={(size * h) / w}
        className="body-figure-svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            {isBefore ? (
              <>
                <stop offset="0%" stopColor="#94a3b8" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#64748b" stopOpacity="0.7" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#e9d5ff" stopOpacity="0.95" />
                <stop offset="40%" stopColor="#c4b5fd" stopOpacity="0.95" />
                <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.9" />
              </>
            )}
          </linearGradient>
          {isNow && (
            <filter id={`glow-${id || 'x'}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        <g style={isNow ? { filter: `url(#glow-${id || 'x'})` } : {}}>
          <circle cx={cx} cy={headR} r={headR * 0.95} fill={fillUrl} />
          <path
            d={`
              M ${cx - 7} ${headR * 2 - 2}
              L ${cx - shoulderW} ${shoulderY}
              Q ${cx - waistW} ${waistY} ${cx - hipW * 0.85} ${hipY}
              L ${cx - thighW} ${footY - 4}
              Q ${cx - thighW * 0.5} ${hipY + 24} ${cx} ${hipY + 16}
              Q ${cx + thighW * 0.5} ${hipY + 24} ${cx + thighW} ${footY - 4}
              L ${cx + hipW * 0.85} ${hipY}
              Q ${cx + waistW} ${waistY} ${cx + shoulderW} ${shoulderY}
              L ${cx + 7} ${headR * 2 - 2}
              Z
            `}
            fill={fillUrl}
          />
        </g>
      </svg>
      {label && <span className="body-figure-label">{label}</span>}
      <span className="body-figure-meta">
        {weight != null && <>{weight} kg</>}
        {isNow && weightDiff != null && Number(weightDiff) !== 0 && (
          <span className={`body-figure-delta ${Number(weightDiff) < 0 ? 'body-figure-delta--loss' : 'body-figure-delta--gain'}`}>
            {Number(weightDiff) > 0 ? '+' : ''}{weightDiff} kg
          </span>
        )}
      </span>

      <style jsx>{`
        .body-figure-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: transform 0.2s ease;
        }
        .body-figure-wrap.body-figure-before {
          opacity: 0.85;
        }
        .body-figure-wrap.body-figure-now .body-figure-svg {
          filter: drop-shadow(0 8px 24px rgba(139, 92, 255, 0.35));
        }
        .body-figure-svg {
          display: block;
        }
        .body-figure-label {
          font-size: 14px;
          font-weight: 700;
          letter-spacing: 0.02em;
          color: #a78bfa;
        }
        .body-figure-before .body-figure-label {
          color: #94a3b8;
        }
        .body-figure-meta {
          font-size: 12px;
          color: #71717a;
          font-weight: 500;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
        }
        .body-figure-delta {
          font-size: 11px;
          padding: 3px 10px;
          border-radius: 20px;
          font-weight: 700;
        }
        .body-figure-delta--loss {
          background: rgba(34, 197, 94, 0.25);
          color: #4ade80;
        }
        .body-figure-delta--gain {
          background: rgba(251, 146, 60, 0.25);
          color: #fb923c;
        }
      `}</style>
    </div>
  );
}
