interface LoadingSpinnerProps {
  size?: number
  label?: string
}

/**
 * Accessible loading spinner with optional label.
 * Uses CSS animation, no external dependencies.
 */
export function LoadingSpinner({ size = 24, label = 'Loading…' }: LoadingSpinnerProps) {
  return (
    <div className="loading-spinner" role="status" aria-label={label}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="spinner-svg"
      >
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <span className="spinner-label">{label}</span>
    </div>
  )
}
