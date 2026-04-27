// size: 'sm' | 'md' | 'lg', label: optional text shown next to spinner
export default function Spinner({ size = 'md', label, className = '' }) {
  const sizeClass = { sm: 'w-4 h-4', md: 'w-5 h-5', lg: 'w-8 h-8' }[size]
  return (
    <div className={`flex items-center gap-2 text-gray-400 ${className}`}>
      <svg
        className={`animate-spin ${sizeClass}`}
        viewBox="0 0 24 24"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
        <path
          d="M22 12a10 10 0 0 1-10 10"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </div>
  )
}
