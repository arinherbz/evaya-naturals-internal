import { useEffect, useState } from 'react';

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
  showName?: boolean;
  nameClassName?: string;
};

export default function BrandMark({
  compact = false,
  className = '',
  showName = false,
  nameClassName = '',
}: BrandMarkProps) {
  const [brand, setBrand] = useState({
    logoSrc: '/evaya-logo.svg',
    businessName: 'Evaya Naturals',
  });

  useEffect(() => {
    const syncBrand = () => {
      try {
        const raw = localStorage.getItem('evaya-business-profile');
        if (!raw) {
          setBrand({
            logoSrc: '/evaya-logo.svg',
            businessName: 'Evaya Naturals',
          });
          return;
        }
        const profile = JSON.parse(raw) as { logoDataUrl?: string | null; businessName?: string | null };
        setBrand({
          logoSrc: profile.logoDataUrl || '/evaya-logo.svg',
          businessName: profile.businessName?.trim() || 'Evaya Naturals',
        });
      } catch {
        setBrand({
          logoSrc: '/evaya-logo.svg',
          businessName: 'Evaya Naturals',
        });
      }
    };

    syncBrand();
    window.addEventListener('storage', syncBrand);
    window.addEventListener('evaya-brand-updated', syncBrand as EventListener);
    return () => {
      window.removeEventListener('storage', syncBrand);
      window.removeEventListener('evaya-brand-updated', syncBrand as EventListener);
    };
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src={brand.logoSrc}
        alt="Evaya Naturals logo"
        className={compact ? 'h-10 w-auto' : 'h-14 w-auto'}
      />
      {showName && (
        <div className={`min-w-0 ${nameClassName}`.trim()}>
          <p className={`truncate font-semibold text-slate-900 ${compact ? 'text-sm' : 'text-base'}`}>
            {brand.businessName}
          </p>
        </div>
      )}
    </div>
  );
}
