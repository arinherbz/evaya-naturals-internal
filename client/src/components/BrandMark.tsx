type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src="/evaya-logo.svg"
        alt="Evaya Naturals logo"
        className={compact ? 'h-10 w-auto' : 'h-14 w-auto'}
      />
    </div>
  );
}
