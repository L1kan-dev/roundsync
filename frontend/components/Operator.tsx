// A filled tactical-operator silhouette — an original, abstract shape (helmet, vest,
// stance, weapon) built from simple geometric primitives, not a trace of any specific
// game's character model, likeness, or logo. Color alone carries the CT/T identity,
// the same cyan/amber convention this app already uses everywhere else — not Valve's
// team branding. Weapon silhouette shape (straight mag vs. curved mag) distinguishes an
// M4-style rifle from an AK-style rifle using only their real-world, non-trademarked
// silhouettes.
export function Operator({
  className = '',
  color = '#22d3ee',
  flip = false,
  weapon = 'straight',
}: {
  className?: string;
  color?: string;
  flip?: boolean;
  weapon?: 'straight' | 'curved';
}) {
  return (
    <svg
      viewBox="0 0 220 480"
      className={className}
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Head + helmet brow */}
      <circle cx="110" cy="46" r="30" fill={color} />
      <path d="M78 32 Q110 12 142 32 L142 42 Q110 26 78 42 Z" fill={color} opacity="0.85" />

      {/* Neck */}
      <rect x="100" y="72" width="20" height="16" fill={color} />

      {/* Torso / vest */}
      <path d="M58 100 Q110 78 162 100 L162 226 Q110 246 58 226 Z" fill={color} />
      {/* Vest pouch detailing (subtractive, reads as gear seams) */}
      <rect x="84" y="140" width="16" height="26" rx="3" fill="#05070a" opacity="0.35" />
      <rect x="120" y="140" width="16" height="26" rx="3" fill="#05070a" opacity="0.35" />
      <rect x="96" y="184" width="28" height="10" rx="3" fill="#05070a" opacity="0.3" />

      {/* Hips */}
      <path d="M62 226 Q110 244 158 226 L158 250 Q110 266 62 250 Z" fill={color} />

      {/* Legs — staggered stance */}
      <path d="M76 248 L66 400 Q65 410 75 410 L90 410 Q98 410 98 400 L100 250 Z" fill={color} />
      <path d="M144 248 L158 396 Q160 408 150 410 L136 410 Q128 410 127 400 L120 250 Z" fill={color} />

      {/* Rear arm, tucked */}
      <path d="M60 108 Q26 130 20 172 Q18 186 30 188 Q40 188 42 176 Q46 142 68 122 Z" fill={color} />

      {/* Front arm, extended toward the weapon grip */}
      <path d="M158 108 Q196 124 212 148 Q218 158 208 164 Q198 168 192 158 Q176 138 150 128 Z" fill={color} />

      {/* Weapon — real-world silhouette (not game-specific artwork) */}
      {weapon === 'straight' ? (
        <g fill={color}>
          {/* M4-style: straight body, top rail, vertical box magazine, stock */}
          <rect x="150" y="150" width="148" height="11" rx="3" />
          <rect x="150" y="141" width="90" height="6" rx="2" opacity="0.85" />
          <rect x="278" y="149" width="28" height="9" rx="2" />
          <rect x="176" y="161" width="12" height="42" rx="2" />
          <rect x="216" y="161" width="20" height="9" rx="2" />
        </g>
      ) : (
        <g fill={color}>
          {/* AK-style: straight body, top rail, curved banana magazine */}
          <rect x="150" y="150" width="148" height="11" rx="3" />
          <rect x="150" y="141" width="90" height="6" rx="2" opacity="0.85" />
          <rect x="278" y="149" width="28" height="9" rx="2" />
          <path d="M182 161 Q206 190 192 228 Q184 236 174 230 Q188 196 172 165 Z" />
        </g>
      )}
    </svg>
  );
}
