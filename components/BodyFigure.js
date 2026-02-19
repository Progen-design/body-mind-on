// /components/BodyFigure.js – Vizualizace postavy (váha, výška → BMI), varianty „předtím“ / „teď“
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

export default function BodyFigure({ weight, height, label, size = 120, id, variant }) {
  const type = bmiToBodyType(weight, height);
  const torsoW = 26 + type * 22;
  const headR = 14;
  const legW = 10 + type * 5;
  const gradId = id ? `bodyGrad-${id}` : 'bodyGrad';
  const isBefore = variant === 'before';
  const isNow = variant === 'now';

  const fillUrl = `url(#${gradId})`;
  const strokeUrl = `url(#${gradId})`;

  return (
    <div
      className={`body-figure-wrap ${isBefore ? 'body-figure-before' : ''} ${isNow ? 'body-figure-now' : ''}`}
      title={weight && height ? `BMI: ${(weight / ((height / 100) ** 2)).toFixed(1)}` : ''}
    >
      <svg
        viewBox="0 0 100 160"
        width={size}
        height={(size * 160) / 100}
        className="body-figure-svg"
        aria-hidden
      >
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="0%" y2="100%">
            {isBefore ? (
              <>
                <stop offset="0%" stopColor="#64748b" stopOpacity="0.85" />
                <stop offset="100%" stopColor="#475569" stopOpacity="0.6" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#a78bfa" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.85" />
              </>
            )}
          </linearGradient>
          {isNow && (
            <filter id={`glow-${id || 'x'}`} x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          )}
        </defs>

        <g className={isNow ? 'body-figure-glow' : ''} style={isNow ? { filter: `url(#glow-${id || 'x'})` } : {}}>
          {/* Hlava */}
          <circle cx="50" cy={headR + 4} r={headR} fill={fillUrl} />

          {/* Krk */}
          <path
            d={`M ${50 - 7} ${headR * 2 + 2} L ${50 + 7} ${headR * 2 + 2} L ${50 + torsoW * 0.5} ${headR * 2 + 22} L ${50 - torsoW * 0.5} ${headR * 2 + 22} Z`}
            fill={fillUrl}
          />

          {/* Trup – zaoblený tvar */}
          <path
            d={`M ${50 - torsoW * 0.95} ${headR * 2 + 24} 
                Q ${50 - torsoW} ${headR * 2 + 50} ${50 - torsoW * 0.85} ${headR * 2 + 72}
                Q ${50} ${headR * 2 + 82} ${50 + torsoW * 0.85} ${headR * 2 + 72}
                Q ${50 + torsoW} ${headR * 2 + 50} ${50 + torsoW * 0.95} ${headR * 2 + 24} Z`}
            fill={fillUrl}
          />

          {/* Paže – plynule od ramen */}
          <path
            d={`M ${50 - torsoW * 0.95} ${headR * 2 + 32} 
                Q ${50 - torsoW - 8} ${headR * 2 + 38} ${50 - torsoW - 4} ${headR * 2 + 58}
                Q ${50 - torsoW} ${headR * 2 + 70} ${50 - torsoW + 2} ${headR * 2 + 72}`}
            stroke={strokeUrl}
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d={`M ${50 + torsoW * 0.95} ${headR * 2 + 32} 
                Q ${50 + torsoW + 8} ${headR * 2 + 38} ${50 + torsoW + 4} ${headR * 2 + 58}
                Q ${50 + torsoW} ${headR * 2 + 70} ${50 + torsoW - 2} ${headR * 2 + 72}`}
            stroke={strokeUrl}
            strokeWidth="7"
            strokeLinecap="round"
            fill="none"
          />

          {/* Nohy – jednoduché zaoblené tvary */}
          <ellipse cx={50 - 14} cy={headR * 2 + 118} rx={legW} ry={20} fill={fillUrl} />
          <ellipse cx={50 + 14} cy={headR * 2 + 118} rx={legW} ry={20} fill={fillUrl} />
        </g>
      </svg>
      {label && <span className="body-figure-label">{label}</span>}
      {weight != null && <span className="body-figure-meta">{weight} kg</span>}

      <style jsx>{`
        .body-figure-wrap {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          transition: transform 0.2s ease;
        }
        .body-figure-wrap.body-figure-before {
          opacity: 0.82;
        }
        .body-figure-wrap.body-figure-before .body-figure-svg {
          filter: none;
        }
        .body-figure-wrap.body-figure-now .body-figure-svg {
          filter: drop-shadow(0 6px 20px rgba(139, 92, 255, 0.4));
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
        }
        .body-figure-before .body-figure-meta {
          color: #64748b;
        }
      `}</style>
    </div>
  );
}
