import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import BrandMark from '../components/BrandMark';
import { getDefaultRoute } from '../lib/access';
import { api } from '../services/api';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const settingsQuery = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => api.settings.public(),
    staleTime: 5 * 60_000,
  });

  const businessName = settingsQuery.data?.businessProfile.businessName ?? 'Evaya Naturals';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      const data = await login(email, password);
      const roleName: string = data.user?.role?.name ?? '';
      navigate(getDefaultRoute(roleName));
    } catch {
      setError('Invalid email or password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f5f7] px-4">
      <div className="w-full max-w-sm">

        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
            <BrandMark compact showName nameClassName="text-left" />
          </div>
          <h1 className="mt-5 text-xl font-semibold text-slate-900">Sign in to {businessName}</h1>
          <p className="mt-1 text-sm text-slate-400">Internal management portal</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-100 bg-white p-6 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">

            {error && (
              <div className="flex items-center gap-2.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700">
                <AlertTriangle size={14} className="shrink-0" strokeWidth={1.75} />
                {error}
              </div>
            )}

            <div>
              <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-500">
                Email address
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                placeholder="you@evaya.ug"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
              />
            </div>

            <div>
              <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-500">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none transition focus:border-[#1B4332]/40 focus:bg-white focus:ring-2 focus:ring-[#1B4332]/10"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="mt-2 w-full rounded-xl py-3 text-sm font-semibold text-white transition disabled:opacity-60"
              style={{ background: '#1B4332' }}
            >
              {isLoading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-400">
          {businessName} Internal System
        </p>
      </div>
    </div>
  );
}
