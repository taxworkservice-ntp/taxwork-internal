export default function SearchInput({
  value,
  onChange,
  placeholder = "ค้นหา...",
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={`relative min-w-[220px] flex-1 ${className}`}>
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-neutral-400">
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5L14 14" strokeLinecap="round" />
        </svg>
      </span>
      <input
        className="input pr-8 pl-9"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="ล้างคำค้นหา"
          className="absolute top-1/2 right-2 -translate-y-1/2 text-lg leading-none text-neutral-400 hover:text-neutral-600"
          onClick={() => onChange("")}
        >
          ×
        </button>
      )}
    </div>
  );
}
