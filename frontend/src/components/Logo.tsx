// The StockWise box mark, the same drawing as public/favicon.svg.
export function LogoMark({ size = 44 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" fill="none" aria-hidden="true">
      <rect width="44" height="44" rx="12" fill="var(--primary)" />
      <path
        d="M12 17l10-5 10 5v11l-10 5-10-5z M12 17l10 5 10-5 M22 22v11"
        stroke="#fff"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  )
}
