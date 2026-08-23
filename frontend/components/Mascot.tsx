// A large, faint "AI tactical coach" silhouette used as ambient brand art in the
// global background — a helmet/visor shape with a crosshair eye, monoline style
// matching the logo's cyan-to-amber gradient. Purely decorative, low opacity.
export function Mascot({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 400 460"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="mascot-grad" x1="0" y1="0" x2="400" y2="460" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#fb923c" />
        </linearGradient>
      </defs>

      {/* Helmet outline */}
      <path
        d="M200 20c88 0 150 66 150 152v90c0 78-64 150-150 178-86-28-150-100-150-178v-90C50 86 112 20 200 20Z"
        stroke="url(#mascot-grad)"
        strokeWidth="3"
      />

      {/* Visor band */}
      <rect x="72" y="180" width="256" height="80" rx="40" stroke="url(#mascot-grad)" strokeWidth="3" />

      {/* Crosshair eye */}
      <circle cx="200" cy="220" r="26" stroke="url(#mascot-grad)" strokeWidth="3" />
      <path d="M200 178v20M200 242v20M154 220h20M226 220h20" stroke="url(#mascot-grad)" strokeWidth="3" strokeLinecap="round" />

      {/* Side circuit ticks */}
      <path d="M40 220h24M40 250h16M40 190h16" stroke="url(#mascot-grad)" strokeWidth="3" strokeLinecap="round" />
      <path d="M360 220h-24M360 250h-16M360 190h-16" stroke="url(#mascot-grad)" strokeWidth="3" strokeLinecap="round" />

      {/* Antenna */}
      <path d="M200 20V0" stroke="url(#mascot-grad)" strokeWidth="3" strokeLinecap="round" />
      <circle cx="200" cy="0" r="6" fill="url(#mascot-grad)" />

      {/* Jaw seam */}
      <path d="M110 300c30 22 60 32 90 32s60-10 90-32" stroke="url(#mascot-grad)" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
