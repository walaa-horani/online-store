/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShoppingBag, 
  Truck, 
  Shield,
  ShieldCheck, 
  Zap, 
  ChevronDown, 
  CheckCircle2, 
  AlertCircle,
  Package,
  CreditCard,
  MapPin,
  Phone,
  Mail,
  User,
  LogOut
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import * as Config from './constants';
import AdminDashboard from './AdminDashboard';
import LoginPage from './LoginPage';
import { getSupabase } from './lib/supabase';

export default function App() {
  const [view, setView] = useState<'store' | 'admin' | 'login'>('store');
  const [user, setUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [canBootstrap, setCanBootstrap] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(false);
  
  console.log('App Render - View:', view, 'User:', user?.email, 'Role:', userRole);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [quantity, setQuantity] = useState(1);
  const [variant, setVariant] = useState(Config.VARIANTS[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderStatus, setOrderStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [formData, setFormData] = useState({
    customer_name: '',
    phone: '',
    email: '',
    city: '',
    address: '',
    country: Config.DEFAULT_COUNTRY,
    notes: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [debugInfo, setDebugInfo] = useState<any>(null);

  const fetchUserProfile = async (supabase: any, currentUser: any) => {
    if (!supabase || !currentUser) return;
    
    const maxRetries = 2;
    let lastError = null;

    for (let i = 0; i < maxRetries; i++) {
      try {
        console.log(`Fetching profile (Attempt ${i + 1}) for:`, currentUser.id);
        
        const { data: profile, error: profileError }: any = await supabase
          .from('profiles')
          .select('*')
          .eq('user_id', currentUser.id)
          .maybeSingle();
          
        if (profileError) throw profileError;

        if (!profile) {
          console.log('No profile found, creating/syncing user profile...');
          const initialRole = 'user';
          
          // Use upsert to be safer (updates if exists, inserts if not)
          const { error: insertError } = await supabase
            .from('profiles')
            .upsert({ 
              user_id: currentUser.id, 
              role: initialRole,
              email: currentUser.email || null
            }, { onConflict: 'user_id' });
          
          if (insertError) {
            console.error('CRITICAL: Failed to sync profile to Supabase.', {
              error: insertError.message,
              details: insertError.details,
              hint: insertError.hint,
              code: insertError.code
            });
            setUserRole(initialRole);
            throw insertError;
          }

          console.log('Profile successfully synced to Supabase');
          setUserRole(initialRole);
          setDebugInfo({
            userId: currentUser.id,
            email: currentUser.email,
            profile: { role: initialRole, email: currentUser.email },
            profileError: null
          });
        } else {
          setUserRole(profile.role);
          setDebugInfo({
            userId: currentUser.id,
            email: currentUser.email,
            profile,
            profileError: null
          });
        }
        
        return; // Success
      } catch (err: any) {
        lastError = err;
        console.warn(`Profile fetch/create attempt ${i + 1} failed:`, err.message);
        if (i < maxRetries - 1) {
          await new Promise(r => setTimeout(r, 1000));
        }
      }
    }

    console.error('All profile attempts failed:', lastError);
    setUserRole('user');
  };

  useEffect(() => {
    // 1. Check if this window is an OAuth popup
    if (window.opener && (window.location.hash.includes('access_token') || window.location.search.includes('code'))) {
      window.opener.postMessage({ type: 'OAUTH_SUCCESS' }, window.location.origin);
      window.close();
      return;
    }

    // 2. Listen for success message from popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      if (event.data?.type === 'OAUTH_SUCCESS') {
        console.log('OAuth Success received from popup');
        setShowAuthModal(false);
        setView(prev => prev === 'login' ? 'store' : prev);
      }
    };
    window.addEventListener('message', handleMessage);

    const supabase = getSupabase();
    if (!supabase) return;

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }: any) => {
      const currentUser = session?.user ?? null;
      console.log('Initial session check - User:', currentUser?.email);
      setUser(currentUser);
      
      if (currentUser) {
        setFormData(prev => ({ ...prev, email: currentUser.email ?? '' }));
        fetchUserProfile(supabase, currentUser);
      }
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
      console.log('Auth state changed:', event, session ? 'Session exists' : 'No session');
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        setFormData(prev => ({ ...prev, email: currentUser.email ?? '' }));
        setShowAuthModal(false);
        setView(prev => prev === 'login' ? 'store' : prev);
        fetchUserProfile(supabase, currentUser);
      } else {
        setUserRole(null);
        setView(prev => {
          if (prev === 'admin') {
            return 'login';
          }
          return 'store';
        });
        setDebugInfo(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Protect admin view
  useEffect(() => {
    const checkAuth = async () => {
      if (view === 'admin') {
        const supabase = getSupabase();
        if (!supabase) return;
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          setView('login');
          setAuthError('You must be logged in to access the dashboard.');
        }
      }
    };
    checkAuth();
  }, [view]);

  // Handle Auth Redirects (Email Confirmation)
  useEffect(() => {
    const handleAuthRedirect = async () => {
      const hash = window.location.hash;
      if (hash.includes('type=signup') || hash.includes('access_token')) {
        // Wait a moment for Supabase to process the token
        setTimeout(async () => {
          const supabase = getSupabase();
          if (!supabase) return;
          const { data: { session } } = await supabase.auth.getSession();
          
          if (!session) {
            setView('login');
            setAuthError('Email confirmed! You can now log in.');
          } else {
            // If they are auto-logged in, maybe show a success message
            console.log('User auto-logged in after email confirmation');
          }
          // Clean up the URL hash
          window.history.replaceState(null, '', window.location.pathname);
        }, 500);
      }
    };
    handleAuthRedirect();
  }, []);

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
          // Email confirmation is required
          setAuthError('Check your email and confirm your account before logging in.');
          setAuthMode('login');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
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

  const handleLogout = async () => {
    console.log('Logout initiated...');
    
    // Clear local state IMMEDIATELY for responsive UI
    setUser(null);
    setUserRole(null);
    setView('store');
    setShowAuthModal(false);

    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase not configured, cannot logout');
      return;
    }
    try {
      // We don't await this if we want immediate UI feedback, 
      // but it's better to trigger it in the background
      supabase.auth.signOut().then(({ error }) => {
        if (error) {
          console.error('Error during signOut:', error);
        } else {
          console.log('SignOut successful');
        }
      });
    } catch (err: any) {
      console.error('Unexpected error during signOut:', err);
    }
  };

  const bootstrapAdmin = async () => {
    const supabase = getSupabase();
    if (!supabase || !user) return;

    setIsBootstrapping(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .upsert({
          user_id: user.id,
          email: user.email,
          role: 'admin',
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) {
        // Try 'id' column if 'user_id' fails
        const { error: retryError } = await supabase
          .from('profiles')
          .upsert({
            id: user.id,
            email: user.email,
            role: 'admin',
            updated_at: new Date().toISOString()
          }, { onConflict: 'id' });
        
        if (retryError) throw retryError;
      }

      setUserRole('admin');
      setCanBootstrap(false);
      alert('Admin access granted! You can now access the dashboard.');
    } catch (err: any) {
      console.error('Bootstrap failed:', err);
      alert('Failed to setup admin: ' + err.message);
    } finally {
      setIsBootstrapping(false);
    }
  };

  const totalPrice = quantity * Config.PRICE_PER_UNIT;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (errors[name]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.customer_name) newErrors.customer_name = "Name is required";
    if (!formData.phone) newErrors.phone = "Phone number is required";
    if (!formData.email) newErrors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = "Invalid email format";
    if (!formData.city) newErrors.city = "City is required";
    if (!formData.address) newErrors.address = "Address is required";
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!user) {
      setShowAuthModal(true);
      return;
    }

    if (!validateForm()) return;

    const supabase = getSupabase();
    if (!supabase) {
      console.error('Supabase is not configured correctly in src/constants.ts');
      setOrderStatus('error');
      return;
    }

    setIsSubmitting(true);
    setOrderStatus('idle');
    console.log('Attempting to submit order to Supabase...', {
      url: Config.SUPABASE_URL,
      table: 'orders'
    });

    try {
      const payload = {
        customer_name: formData.customer_name,
        phone: formData.phone,
        email: formData.email,
        city: formData.city,
        address: formData.address,
        country: formData.country,
        product_name: Config.PRODUCT_NAME,
        product_variant: variant,
        quantity: quantity,
        notes: formData.notes,
        status: 'pending',
        user_id: user.id // Track which user placed the order
      };

      const { data, error } = await supabase
        .from('orders')
        .insert([payload])
        .select();

      if (error) {
        console.error('Supabase Insert Error:', error);
        throw error;
      }

      console.log('Order submitted successfully:', data);
      setOrderStatus('success');
      
      setFormData({
        customer_name: '',
        phone: '',
        email: user.email ?? '',
        city: '',
        address: '',
        country: Config.DEFAULT_COUNTRY,
        notes: ''
      });
      setQuantity(1);
    } catch (err: any) {
      console.error('Detailed submission error:', err);
      setOrderStatus('error');
      if (err.message) {
        alert(`Submission failed: ${err.message}`);
      }
    } finally {
      setIsSubmitting(false);
      console.log('Order submission process finished.');
    }
  };

  const scrollToCheckout = () => {
    document.getElementById('checkout')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (view === 'admin') {
    return <AdminDashboard onExit={() => setView('store')} onLogout={handleLogout} />;
  }

  if (view === 'login') {
    return (
      <LoginPage 
        onSuccess={() => setView('store')} 
        onBack={() => setView('store')}
        initialMode={authMode}
        initialError={authError}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#FAFAFA] text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Subtle Pastel Gradient Overlay */}
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,_var(--tw-gradient-stops))] from-indigo-50/40 via-transparent to-rose-50/30 z-0" />

      {/* Auth Modal */}
      <AnimatePresence>
        {showAuthModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white rounded-[2rem] p-8 w-full max-w-md shadow-2xl relative"
            >
              <button 
                onClick={() => setShowAuthModal(false)}
                className="absolute top-6 right-6 text-slate-400 hover:text-slate-600"
              >
                <ChevronDown className="rotate-90" />
              </button>
              
              <h2 className="text-2xl font-bold mb-2">{authMode === 'login' ? 'Welcome Back' : 'Create Account'}</h2>
              <p className="text-slate-500 mb-8">{authMode === 'login' ? 'Login to place your order.' : 'Sign up to start shopping.'}</p>

              <form onSubmit={handleAuth} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Email Address</label>
                  <input 
                    type="email" 
                    required
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="you@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-700">Password</label>
                  <input 
                    type="password" 
                    required
                    value={authPassword}
                    onChange={(e) => setAuthPassword(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                    placeholder="••••••••"
                  />
                </div>

                {authError && <p className="text-rose-500 text-sm">{authError}</p>}

                <button 
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-indigo-600 text-white py-4 rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50"
                >
                  {authLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')}
                </button>
              </form>

              <div className="mt-6 flex items-center gap-4">
                <div className="flex-1 h-px bg-slate-100" />
                <span className="text-xs font-medium text-slate-400 uppercase tracking-widest">Or continue with</span>
                <div className="flex-1 h-px bg-slate-100" />
              </div>

              <button 
                onClick={handleGoogleLogin}
                disabled={authLoading}
                className="mt-6 w-full flex items-center justify-center gap-3 py-4 bg-white border border-slate-200 rounded-xl font-bold text-slate-700 hover:bg-slate-50 transition-all disabled:opacity-50 active:scale-[0.98]"
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

              <div className="mt-6 text-center">
                <button 
                  onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')}
                  className="text-sm text-indigo-600 font-semibold hover:underline"
                >
                  {authMode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Login"}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200/60">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="text-xl font-bold tracking-tight text-slate-900">
            {Config.STORE_NAME}
          </div>
          <div className="flex items-center gap-6">
            {console.log('Navbar rendering. userRole:', userRole)}
            <a href="#how-it-works" className="text-sm font-medium text-slate-600 hover:text-indigo-600 transition-colors hidden sm:block">
              How COD Works
            </a>
            {user ? (
              <div className="flex items-center gap-4">
                {userRole === 'admin' ? (
                  <button 
                    onClick={() => setView('admin')}
                    className="text-sm font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 px-4 py-2 rounded-full"
                  >
                    Dashboard
                  </button>
                ) : canBootstrap ? (
                  <button 
                    onClick={bootstrapAdmin}
                    disabled={isBootstrapping}
                    className="text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 px-4 py-2 rounded-full flex items-center gap-2 border border-amber-200 animate-pulse"
                  >
                    <Shield size={14} />
                    {isBootstrapping ? 'Setting up...' : 'Setup Admin Access'}
                  </button>
                ) : null}
                <span className="text-sm text-slate-500 hidden sm:block">{user.email}</span>
                <button 
                  onClick={handleLogout}
                  className="flex items-center gap-2 bg-rose-50 text-rose-600 px-4 py-2 rounded-full text-sm font-bold hover:bg-rose-100 transition-all active:scale-95 border border-rose-100"
                >
                  <LogOut size={16} />
                  <span>Logout</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => {
                    setAuthMode('login');
                    setShowAuthModal(true);
                  }}
                  className="text-sm font-bold text-slate-600 hover:text-indigo-600 transition-colors"
                >
                  Login
                </button>
                <button 
                  onClick={() => {
                    setAuthMode('signup');
                    setShowAuthModal(true);
                  }}
                  className="text-sm font-bold text-indigo-600 hover:text-indigo-700"
                >
                  Register
                </button>
              </div>
            )}
            <button 
              onClick={scrollToCheckout}
              className="bg-slate-900 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:bg-slate-800 transition-all shadow-sm active:scale-95"
            >
              Order Now
            </button>
          </div>
        </div>
      </nav>

      <main className="relative z-10">
        {/* Hero Section */}
        <section className="pt-16 pb-24 px-6">
          <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold uppercase tracking-wider mb-6">
                <Zap size={14} /> New Arrival
              </div>
              <h1 className="text-5xl sm:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1] mb-6">
                {Config.PRODUCT_NAME}
              </h1>
              <p className="text-lg text-slate-600 leading-relaxed mb-10 max-w-lg">
                {Config.PRODUCT_DESCRIPTION}
              </p>
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={scrollToCheckout}
                  className="bg-indigo-600 text-white px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 flex items-center gap-2"
                >
                  <ShoppingBag size={20} /> Get Yours Now
                </button>
                <a 
                  href="#how-it-works"
                  className="bg-white text-slate-700 border border-slate-200 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-slate-50 transition-all active:scale-95"
                >
                  Learn More
                </a>
              </div>
            </motion.div>
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              className="relative"
            >
              <div className="aspect-square rounded-[2.5rem] overflow-hidden shadow-2xl shadow-slate-200 border-8 border-white">
                <img 
                  src={Config.PRODUCT_IMAGE_URL} 
                  alt={Config.PRODUCT_NAME}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
              {/* Floating Badge */}
              <div className="absolute -bottom-6 -left-6 bg-white p-6 rounded-3xl shadow-xl border border-slate-100 flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                  <ShieldCheck size={24} />
                </div>
                <div>
                  <div className="text-sm font-bold text-slate-900">1 Year Warranty</div>
                  <div className="text-xs text-slate-500">Full coverage included</div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Value Proposition */}
        <section className="py-24 bg-white border-y border-slate-200/60">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Why Choose Us?</h2>
              <p className="text-slate-500">Premium quality meets exceptional service.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-8">
              {[
                { icon: <Truck />, title: "Free Express Shipping", desc: "Get your order delivered to your doorstep at no extra cost." },
                { icon: <ShieldCheck />, title: "Premium Quality", desc: "Every product is rigorously tested for the highest standards." },
                { icon: <CreditCard />, title: "Pay on Delivery", desc: "No upfront payment required. Pay only when you receive your item." }
              ].map((item, i) => (
                <motion.div 
                  key={i}
                  whileHover={{ y: -5 }}
                  className="p-8 rounded-3xl bg-[#FAFAFA] border border-slate-100 hover:border-indigo-100 transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-white shadow-sm flex items-center justify-center text-indigo-600 mb-6">
                    {item.icon}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{item.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* How COD Works */}
        <section id="how-it-works" className="py-24 px-6">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">How Cash on Delivery Works</h2>
              <p className="text-slate-500">Simple, secure, and hassle-free ordering process.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-12 relative">
              {/* Connector Lines (Desktop) */}
              <div className="hidden md:block absolute top-1/2 left-1/4 right-1/4 h-px bg-slate-200 -translate-y-1/2 z-0" />
              
              {[
                { step: "01", title: "Place Your Order", desc: "Fill out the simple form below with your shipping details." },
                { step: "02", title: "Order Confirmation", desc: "We'll process your order and ship it via our express courier." },
                { step: "03", title: "Pay at Doorstep", desc: "Inspect your package and pay the courier in cash upon arrival." }
              ].map((item, i) => (
                <div key={i} className="relative z-10 text-center">
                  <div className="w-16 h-16 rounded-full bg-indigo-600 text-white text-xl font-bold flex items-center justify-center mx-auto mb-6 shadow-lg shadow-indigo-200">
                    {item.step}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{item.title}</h3>
                  <p className="text-slate-600 max-w-xs mx-auto">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Checkout Section */}
        <section id="checkout" className="py-24 bg-indigo-900 text-white overflow-hidden relative">
          {/* Decorative background elements */}
          <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 blur-[120px] rounded-full -mr-48 -mt-48" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-rose-500/10 blur-[120px] rounded-full -ml-48 -mb-48" />

          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid lg:grid-cols-5 gap-16">
              {/* Order Form */}
              <div className="lg:col-span-3">
                <h2 className="text-4xl font-bold mb-4">Complete Your Order</h2>
                <p className="text-indigo-200 mb-12">No payment needed now. Pay in cash when you receive your package.</p>

                {!user ? (
                  <div className="bg-white/10 border border-white/20 rounded-[2rem] p-12 text-center backdrop-blur-md">
                    <ShieldCheck size={48} className="mx-auto mb-6 text-indigo-300" />
                    <h3 className="text-2xl font-bold mb-4">Account Required</h3>
                    <p className="text-indigo-200 mb-8">Please login or create an account to place your order securely.</p>
                    <button 
                      onClick={() => setShowAuthModal(true)}
                      className="bg-white text-indigo-900 px-8 py-4 rounded-2xl font-bold text-lg hover:bg-indigo-50 transition-all active:scale-95"
                    >
                      Login to Continue
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                        <User size={16} /> Full Name
                      </label>
                      <input 
                        type="text" 
                        name="customer_name"
                        value={formData.customer_name}
                        onChange={handleInputChange}
                        placeholder="John Doe"
                        className={`w-full bg-white/10 border ${errors.customer_name ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                      />
                      {errors.customer_name && <p className="text-rose-400 text-xs mt-1">{errors.customer_name}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                        <Phone size={16} /> Phone Number
                      </label>
                      <input 
                        type="tel" 
                        name="phone"
                        value={formData.phone}
                        onChange={handleInputChange}
                        placeholder="+1 (555) 000-0000"
                        className={`w-full bg-white/10 border ${errors.phone ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                      />
                      {errors.phone && <p className="text-rose-400 text-xs mt-1">{errors.phone}</p>}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                      <Mail size={16} /> Email Address
                    </label>
                    <input 
                      type="email" 
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      placeholder="john@example.com"
                      className={`w-full bg-white/10 border ${errors.email ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                    />
                    {errors.email && <p className="text-rose-400 text-xs mt-1">{errors.email}</p>}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                        <MapPin size={16} /> City
                      </label>
                      <input 
                        type="text" 
                        name="city"
                        value={formData.city}
                        onChange={handleInputChange}
                        placeholder="New York"
                        className={`w-full bg-white/10 border ${errors.city ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all`}
                      />
                      {errors.city && <p className="text-rose-400 text-xs mt-1">{errors.city}</p>}
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                        <MapPin size={16} /> Country
                      </label>
                      <select 
                        name="country"
                        value={formData.country}
                        onChange={handleInputChange}
                        className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all appearance-none"
                      >
                        <option value="United States" className="text-slate-900">United States</option>
                        <option value="Canada" className="text-slate-900">Canada</option>
                        <option value="United Kingdom" className="text-slate-900">United Kingdom</option>
                        <option value="Australia" className="text-slate-900">Australia</option>
                      </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-indigo-100 flex items-center gap-2">
                      <MapPin size={16} /> Shipping Address
                    </label>
                    <textarea 
                      name="address"
                      value={formData.address}
                      onChange={handleInputChange}
                      rows={3}
                      placeholder="Street address, apartment, suite, etc."
                      className={`w-full bg-white/10 border ${errors.address ? 'border-rose-400' : 'border-white/20'} rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all resize-none`}
                    />
                    {errors.address && <p className="text-rose-400 text-xs mt-1">{errors.address}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-indigo-100">Additional Notes (Optional)</label>
                    <textarea 
                      name="notes"
                      value={formData.notes}
                      onChange={handleInputChange}
                      rows={2}
                      placeholder="Special instructions for delivery..."
                      className="w-full bg-white/10 border border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 transition-all resize-none"
                    />
                  </div>

                  <button 
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-white text-indigo-900 py-5 rounded-2xl font-bold text-xl hover:bg-indigo-50 transition-all shadow-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-6 h-6 border-3 border-indigo-900/30 border-t-indigo-900 rounded-full animate-spin" />
                        Processing...
                      </>
                    ) : (
                      <>Confirm Order & Pay on Delivery</>
                    )}
                  </button>

                  <AnimatePresence>
                    {orderStatus === 'success' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-200 flex items-center gap-3"
                      >
                        <CheckCircle2 className="shrink-0" />
                        <div>
                          <p className="font-bold">Order Placed Successfully!</p>
                          <p className="text-sm opacity-80">We'll contact you shortly to confirm delivery.</p>
                        </div>
                      </motion.div>
                    )}
                    {orderStatus === 'error' && (
                      <motion.div 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="p-4 rounded-xl bg-rose-500/20 border border-rose-500/50 text-rose-200 flex items-center gap-3"
                      >
                        <AlertCircle className="shrink-0" />
                        <div>
                          <p className="font-bold">Something went wrong.</p>
                          <p className="text-sm opacity-80">Please try again or contact support.</p>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </form>
                )}
              </div>

              {/* Order Summary */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-[2rem] p-8 text-slate-900 shadow-2xl sticky top-32">
                  <h3 className="text-2xl font-bold mb-8 flex items-center gap-2">
                    <ShoppingBag className="text-indigo-600" /> Order Summary
                  </h3>
                  
                  <div className="flex gap-4 mb-8">
                    <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 border border-slate-100">
                      <img src={Config.PRODUCT_IMAGE_URL} alt={Config.PRODUCT_NAME} className="w-full h-full object-cover" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900">{Config.PRODUCT_NAME}</h4>
                      <p className="text-sm text-slate-500 mb-2">Premium Edition</p>
                      <div className="flex items-center gap-2">
                        <span className="text-indigo-600 font-bold">{Config.CURRENCY} {Config.PRICE_PER_UNIT}</span>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6 mb-8">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">Select Variant</label>
                      <div className="grid grid-cols-1 gap-2">
                        {Config.VARIANTS.map((v) => (
                          <button 
                            key={v}
                            onClick={() => setVariant(v)}
                            className={`px-4 py-3 rounded-xl text-sm font-medium border transition-all text-left flex items-center justify-between ${variant === v ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}
                          >
                            {v}
                            {variant === v && <CheckCircle2 size={16} />}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 block">Quantity</label>
                      <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-xl border border-slate-100">
                        <button 
                          onClick={() => setQuantity(Math.max(1, quantity - 1))}
                          className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                          -
                        </button>
                        <span className="flex-1 text-center font-bold text-lg">{quantity}</span>
                        <button 
                          onClick={() => setQuantity(quantity + 1)}
                          className="w-10 h-10 rounded-lg bg-white shadow-sm flex items-center justify-center text-slate-600 hover:text-indigo-600 transition-colors"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-slate-100 pt-6 space-y-3">
                    <div className="flex justify-between text-slate-500">
                      <span>Subtotal</span>
                      <span>{Config.CURRENCY} {totalPrice}</span>
                    </div>
                    <div className="flex justify-between text-slate-500">
                      <span>Shipping</span>
                      <span className="text-emerald-600 font-medium uppercase text-xs">Free</span>
                    </div>
                    <div className="flex justify-between text-xl font-extrabold text-slate-900 pt-3 border-t border-slate-100">
                      <span>Total</span>
                      <span>{Config.CURRENCY} {totalPrice}</span>
                    </div>
                  </div>

                  <div className="mt-8 p-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-start gap-3">
                    <Truck className="text-indigo-600 shrink-0" size={20} />
                    <p className="text-xs text-indigo-900 leading-relaxed">
                      Estimated delivery: <span className="font-bold">3-5 business days</span>. You will receive a tracking number via email once shipped.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-24 px-6 bg-white">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
              <p className="text-slate-500">Everything you need to know about our service.</p>
            </div>
            <div className="space-y-4">
              {[
                { q: "How do I pay for my order?", a: "We exclusively offer Cash on Delivery. You pay the courier in cash only after you have received and inspected your package." },
                { q: "Can I return the product if I'm not satisfied?", a: "Yes, we offer a 14-day hassle-free return policy. If you're not happy with your purchase, contact our support team for a full refund." },
                { q: "How long does shipping take?", a: "Shipping typically takes 3-5 business days depending on your location. We'll send you a confirmation email with tracking details." }
              ].map((item, i) => (
                <details key={i} className="group p-6 rounded-2xl bg-[#FAFAFA] border border-slate-100 cursor-pointer transition-all hover:border-indigo-100">
                  <summary className="flex items-center justify-between font-bold text-slate-900 list-none">
                    {item.q}
                    <ChevronDown className="text-slate-400 group-open:rotate-180 transition-transform" />
                  </summary>
                  <p className="mt-4 text-slate-600 leading-relaxed">
                    {item.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="bg-slate-50 border-t border-slate-200 py-16 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="grid md:grid-cols-4 gap-12 mb-12">
            <div className="col-span-2">
              <div className="text-xl font-bold text-slate-900 mb-6">{Config.STORE_NAME}</div>
              <p className="text-slate-500 max-w-sm leading-relaxed">
                Providing premium quality essentials delivered directly to your doorstep with the security of Cash on Delivery.
              </p>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Quick Links</h4>
              <ul className="space-y-4 text-sm text-slate-500">
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Privacy Policy</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Terms of Service</a></li>
                <li><a href="#" className="hover:text-indigo-600 transition-colors">Refund Policy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-slate-900 mb-6">Support</h4>
              <ul className="space-y-4 text-sm text-slate-500">
                <li className="flex items-center gap-2"><Mail size={16} /> support@lumina.com</li>
                <li className="flex items-center gap-2"><Phone size={16} /> +1 (800) 123-4567</li>
              </ul>
            </div>
          </div>
          <div className="pt-8 border-t border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-slate-400 font-medium uppercase tracking-widest">
            <div>© 2026 {Config.STORE_NAME}. All rights reserved.</div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2"><ShieldCheck size={14} className="text-emerald-500" /> Secure Checkout</div>
              <div className="flex items-center gap-2"><Truck size={14} className="text-indigo-500" /> Fast Delivery</div>
            </div>
          </div>
        </div>
      </footer>
      {/* Debug Panel (Only visible in development or via console) */}
      {debugInfo && (
        <div className="fixed bottom-4 right-4 z-[9999] opacity-10 hover:opacity-100 transition-opacity max-w-xs">
          <div className="bg-black/90 text-white p-4 rounded-2xl text-[10px] font-mono overflow-auto max-h-60 shadow-2xl border border-white/20">
            <div className="font-bold text-indigo-400 mb-2 border-b border-white/10 pb-1 flex justify-between items-center">
              <span>SUPABASE DEBUG</span>
              <div className="flex gap-2">
                <button 
                  onClick={() => {
                    const supabase = getSupabase();
                    if (!supabase || !user) return;
                    fetchUserProfile(supabase, user);
                  }} 
                  className="hover:text-white underline"
                >
                  REFRESH
                </button>
                <button onClick={() => console.log('Full Debug Info:', debugInfo)} className="hover:text-white underline">LOG</button>
              </div>
            </div>
            <div className="space-y-1">
              <div>UID: {debugInfo.userId.slice(0, 8)}...</div>
              <div>Role: <span className={userRole === 'admin' ? 'text-emerald-400' : 'text-amber-400'}>{userRole}</span></div>
              <div>Profile: {debugInfo.profile ? 'Found' : 'Not Found'}</div>
              {debugInfo.profileError && <div className="text-rose-400">Error: {debugInfo.profileError.message}</div>}
              {debugInfo.profile && (
                <div className="mt-2 pt-2 border-t border-white/10 text-slate-400">
                  <div>DB UID: {debugInfo.profile.user_id?.slice(0, 8) || debugInfo.profile.id?.slice(0, 8)}...</div>
                  <div>DB Role: {debugInfo.profile.role}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
