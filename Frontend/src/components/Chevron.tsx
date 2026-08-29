/** The dropdown arrow drawn over the native select. Decorative, so it is hidden from readers. */
export const Chevron = () => (
  <span className="select-chevron" aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  </span>
);
