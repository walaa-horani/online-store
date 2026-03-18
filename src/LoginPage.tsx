import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Mail, User, Shield, AlertCircle, ShoppingBag, ChevronLeft } from 'lucide-react';
import { getSupabase } from './lib/supabase';
import * as Config from './constants';

interface LoginPageProps {
  onSuccess: () => void;
  onBack: () => void;
  initialMode?: 'login' | 'signup';
  initialError?: string | null;
}

export default function LoginPage({ onSuccess, onBack, initialMode = 'login', initialError = null }: LoginPageProps) {
  const [authMode, setAuthMode] = useState<'login' | 'signup'>(initialMode);
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(initialError);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    const supabase = getSupabase();

    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        
        if (!data.session) {
          setAuthError('Check your email and confirm your account before logging in.');
          setAuthMode('login');
        } else {
          onSuccess();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        onSuccess();
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
          skipBrowserRedirect: true
        }
      });
      if (error) throw error;

      if (data?.url) {
        // Open Google login in a popup window
        const width = 600;
        const height = 700;
        const left = window.screenX + (window.outerWidth - width) / 2;
        const top = window.screenY + (window.outerHeight - height) / 2;
        
        window.open(
          data.url, 
          'google_oauth', 
          `width=${width},height=${height},left=${left},top=${top},status=no,resizable=yes,toolbar=no,menubar=no,location=no`
        );
      }
    } catch (err: any) {
      setAuthError(err.message);
      setAuthLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA] flex flex-col items-center justify-center p-6 font-sans">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/40 via-transparent to-rose-50/30 z-0" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md z-10"
      >
        <button 
          onClick={onBack}
          className="flex items-center gap-2 text-slate-500 hover:text-indigo-600 transition-colors mb-8 group"
        >
          <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
          Back to Store
        </button>

        <div className="bg-white rounded-[2.5rem] p-10 shadow-xl border border-slate-100 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-50 rounded-full -mr-16 -mt-16 opacity-50" />
          
          <div className="relative">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center mb-8 shadow-lg shadow-indigo-200">
              <ShoppingBag className="text-white" size={32} />
            </div>

            <h1 className="text-3xl font-bold text-slate-900 mb-2">
              {authMode === 'login' ? 'Welcome Back' : 'Create Account'}
            </h1>
            <p className="text-slate-500 mb-10">
              {authMode === 'login' ? 'Login to manage your orders.' : 'Sign up to start shopping with us.'}
            </p>

            <form onSubmit={handleAuth} className="space-y-6">
              {authError && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 text-rose-600 text-sm"
                >
                  <AlertCircle size={18} className="shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </motion.div>
              )}

              <div className="space-y-4">
                <div className="relative group">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                  <input 
                    type="email"
                    placeholder="Email Address"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
                <div className="relative group">
                  <Shield className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-indigo-600 transition-colors" size={18} />
                  <input 
                    type="password"
                    placeholder="Password"
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-all"
                    required
                  />
                </div>
              </div>

              <button 
                type="submit"
                disabled={authLoading}
                className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50 active:scale-[0.98]"
              >
                {authLoading ? 'Processing...' : authMode === 'login' ? 'Sign In' : 'Create Account'}
              </button>

              <div className="flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">Or continue with</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <button 
                type="button"
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="w-full flex items-center justify-center gap-3 py-4 bg-white border border-slate-200 rounded-2xl font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-[0.98]"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Google
              </button>

              <div className="text-center pt-4">
                <button 
                  type="button"
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                >
                  {authMode === 'login' ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-12 flex items-center justify-center gap-8 text-slate-400">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest">
            <Shield size={14} className="text-emerald-500" />
            Secure Auth
          </div>
          <div className="w-px h-4 bg-slate-200" />
          <div className="text-xs font-medium uppercase tracking-widest">
            © 2026 {Config.STORE_NAME}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
