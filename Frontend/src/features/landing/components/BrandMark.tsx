/** The three-node dependency glyph, in the two sizes and two colourways the screen uses. */
export const BrandMark = ({ size, on }: { size: number; on: 'dark' | 'light' }) => {
  const fill = 'rgba(199,184,157,0.30)';
  const ring = on === 'dark' ? 'rgba(255,253,248,0.92)' : 'rgba(35,56,77,0.92)';
  const link = on === 'dark' ? 'rgba(255,253,248,0.55)' : 'rgba(35,56,77,0.55)';
  const faint = on === 'dark' ? 'rgba(255,253,248,0.40)' : 'rgba(35,56,77,0.40)';

  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="8" cy="20" r="6" fill={fill} stroke={ring} strokeWidth="2" />
      <circle cx="32" cy="8" r="6" fill={fill} stroke={ring} strokeWidth="2" />
      <circle cx="32" cy="32" r="6" fill={fill} stroke={ring} strokeWidth="2" />
      <line x1="14" y1="17" x2="26" y2="11" stroke={link} strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="14" y1="23" x2="26" y2="29" stroke={link} strokeWidth="1.5" strokeDasharray="3 2" />
      <line x1="32" y1="14" x2="32" y2="26" stroke={faint} strokeWidth="1.5" strokeDasharray="3 2" />
    </svg>
  );
};
