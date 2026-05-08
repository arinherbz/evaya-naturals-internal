import { useEffect, useState } from 'react';

type BrandMarkProps = {
  compact?: boolean;
  className?: string;
};

export default function BrandMark({ compact = false, className = '' }: BrandMarkProps) {
  const [logoSrc, setLogoSrc] = useState('/evaya-logo.svg');

  useEffect(() => {
    const syncLogo = () => {
      try {
        const raw = localStorage.getItem('evaya-business-profile');
        if (!raw) {
          setLogoSrc('/evaya-logo.svg');
          return;
        }
        const profile = JSON.parse(raw) as { logoDataUrl?: string | null };
        setLogoSrc(profile.logoDataUrl || '/evaya-logo.svg');
      } catch {
        setLogoSrc('/evaya-logo.svg');
      }
    };

    syncLogo();
    window.addEventListener('storage', syncLogo);
    window.addEventListener('evaya-brand-updated', syncLogo as EventListener);
    return () => {
      window.removeEventListener('storage', syncLogo);
      window.removeEventListener('evaya-brand-updated', syncLogo as EventListener);
    };
  }, []);

  return (
    <div className={`flex items-center gap-3 ${className}`.trim()}>
      <img
        src={logoSrc}
        alt="Evaya Naturals logo"
        className={compact ? 'h-10 w-auto' : 'h-14 w-auto'}
      />
    </div>
  );
}
