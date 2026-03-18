import React, { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Package, 
  Users, 
  Settings, 
  Search, 
  Filter, 
  MoreHorizontal, 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle,
  LogOut,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCcw,
  Store,
  Shield,
  ShieldCheck
} from 'lucide-react';
import { createClient } from '@supabase/supabase-js';
import * as Config from './constants';
import { motion, AnimatePresence } from 'motion/react';
import { getSupabase } from './lib/supabase';

const supabase = getSupabase();

type Order = {
  id: string;
  customer_name: string;
  email: string;
  phone: string;
  city: string;
  address: string;
  product_variant: string;
  quantity: number;
  status: string;
  created_at: string;
};

export default function AdminDashboard({ onExit, onLogout }: { onExit: () => void, onLogout: () => Promise<void> }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [appName, setAppName] = useState(localStorage.getItem('admin_app_name') || Config.STORE_NAME);
  const [activeTab, setActiveTab] = useState<'orders' | 'settings'>('orders');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [syncingProfile, setSyncingProfile] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setError('Supabase is not configured properly.');
      setLoading(false);
      return;
    }
    
    // Get current user and role
    supabase.auth.getUser().then(async ({ data }) => {
      const user = data.user;
      setCurrentUser(user);
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('user_id', user.id)
          .single();
        setUserRole(profile?.role || 'user');
        // Fetch orders only after we have the user
        fetchOrders();
      } else {
        setLoading(false);
        setError('You must be logged in to view this page.');
      }
    });

    // Real-time subscription
    const subscription = supabase
      .channel('admin_orders')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchOrders();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const fetchOrders = async () => {
    if (!supabase) return;
    setLoading(true);
    setError(null);
    console.log('AdminDashboard: Fetching orders...');
    
    let isTimedOut = false;
    const timeoutId = setTimeout(() => {
      isTimedOut = true;
      setLoading(currentLoading => {
        if (currentLoading) {
          setError('The request is taking too long. This usually means your RLS policies are blocking access or the "profiles" table check failed.');
          return false;
        }
        return currentLoading;
      });
    }, 8000);

    try {
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      if (isTimedOut) return;
      clearTimeout(timeoutId);

      if (fetchError) {
        console.error('Supabase Fetch Error:', fetchError);
        // Check for specific RLS errors
        if (fetchError.code === '42501') {
          throw new Error(`Permission Denied (RLS). Error Code: ${fetchError.code}. Your database profile might not be set to "admin" or RLS is blocking the subquery.`);
        }
        throw fetchError;
      }
      
      console.log('AdminDashboard: Orders fetched successfully:', data?.length || 0);
      setOrders(data || []);
    } catch (err: any) {
      if (isTimedOut) return;
      clearTimeout(timeoutId);
      console.error('Error fetching orders:', err);
      setError(err.message || 'Failed to fetch orders.');
    } finally {
      setLoading(false);
    }
  };

  const updateOrderStatus = async (id: string, newStatus: string) => {
    setUpdatingId(id);
    try {
      const { error } = await supabase
        .from('orders')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      // Optimistic update
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status: newStatus } : o));
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Failed to update status');
    } finally {
      setUpdatingId(null);
    }
  };

  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter(o => o.status === 'pending').length;
    const confirmed = orders.filter(o => o.status === 'confirmed').length;
    const delivered = orders.filter(o => o.status === 'delivered').length;
    const revenue = orders.reduce((acc, o) => acc + (o.quantity * Config.PRICE_PER_UNIT), 0);

    return { total, pending, confirmed, delivered, revenue };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      const matchesSearch = 
        order.customer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.phone.includes(searchQuery);
      
      const matchesStatus = statusFilter === 'all' || order.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [orders, searchQuery, statusFilter]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-50 text-amber-600 border-amber-100';
      case 'confirmed': return 'bg-blue-50 text-blue-600 border-blue-100';
      case 'shipped': return 'bg-indigo-50 text-indigo-600 border-indigo-100';
      case 'delivered': return 'bg-emerald-50 text-emerald-600 border-emerald-100';
      case 'cancelled': return 'bg-rose-50 text-rose-600 border-rose-100';
      default: return 'bg-slate-50 text-slate-600 border-slate-100';
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F7] text-slate-900 font-sans flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-3 border-b border-slate-100">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white">
            <LayoutDashboard size={18} />
          </div>
          <span className="font-bold tracking-tight">{appName}</span>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          <button 
            onClick={() => setActiveTab('orders')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'orders' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Package size={18} /> Orders
          </button>
          <button 
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === 'settings' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Settings size={18} /> Settings
          </button>
        </nav>

        <div className="p-4 border-t border-slate-100 space-y-2">
          <button 
            onClick={onExit}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 transition-all"
          >
            <Store size={18} /> View Store
          </button>
          <button 
            onClick={onLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-rose-600 hover:bg-rose-50 transition-all"
          >
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8 overflow-y-auto">
        <header className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">
              {activeTab === 'orders' ? 'Order Management' : 'System Settings'}
            </h1>
            <p className="text-sm text-slate-500">
              {activeTab === 'orders' ? `Manage your ${orders.length} orders and tracking` : 'Customize your dashboard experience'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={onLogout}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-100 text-sm font-bold hover:bg-rose-100 transition-all shadow-sm"
            >
              <LogOut size={16} /> Sign Out
            </button>
            <button 
              onClick={fetchOrders}
              className="p-2.5 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-indigo-600 transition-all shadow-sm"
            >
              <RefreshCcw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold border border-indigo-200">
              A
            </div>
          </div>
        </header>

        {activeTab === 'orders' ? (
          <div className="space-y-8">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {[
                { label: 'Total Revenue', value: `${Config.CURRENCY} ${stats.revenue.toLocaleString()}`, icon: <TrendingUp />, color: 'text-indigo-600', bg: 'bg-indigo-50' },
                { label: 'Pending Orders', value: stats.pending, icon: <Clock />, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Confirmed', value: stats.confirmed, icon: <CheckCircle2 />, color: 'text-blue-600', bg: 'bg-blue-50' },
                { label: 'Delivered', value: stats.delivered, icon: <Package />, color: 'text-emerald-600', bg: 'bg-emerald-50' },
              ].map((stat, i) => (
                <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl ${stat.bg} ${stat.color} flex items-center justify-center`}>
                      {stat.icon}
                    </div>
                    <span className="text-xs font-bold text-emerald-500 flex items-center gap-1">
                      <ArrowUpRight size={14} /> +12%
                    </span>
                  </div>
                  <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
                  <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-4 items-center">
              <div className="relative flex-1 w-full">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input 
                  type="text" 
                  placeholder="Search by name, email or phone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 w-full md:w-auto">
                <Filter size={18} className="text-slate-400" />
                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="shipped">Shipped</option>
                  <option value="delivered">Delivered</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200">
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Order Details</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Location</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                      <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {loading ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          <div className="flex flex-col items-center gap-3">
                            <RefreshCcw className="animate-spin" size={24} />
                            <span>Loading orders...</span>
                          </div>
                        </td>
                      </tr>
                    ) : error ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-rose-500 bg-rose-50/50">
                          <div className="flex flex-col items-center gap-2">
                            <XCircle size={24} />
                            <span className="font-bold">Error loading orders</span>
                            <span className="text-xs">{error}</span>
                            <button 
                              onClick={fetchOrders}
                              className="mt-2 text-xs bg-white border border-rose-200 px-3 py-1 rounded-lg hover:bg-rose-100 transition-all"
                            >
                              Try Again
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : filteredOrders.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400">
                          No orders found matching your criteria.
                        </td>
                      </tr>
                    ) : (
                      filteredOrders.map((order) => (
                        <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-bold text-slate-900">{order.customer_name}</div>
                            <div className="text-xs text-slate-500">{order.email}</div>
                            <div className="text-xs text-slate-500">{order.phone}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-slate-900">{order.product_variant}</div>
                            <div className="text-xs text-slate-500">Qty: {order.quantity} • {Config.CURRENCY} {order.quantity * Config.PRICE_PER_UNIT}</div>
                          </td>
                          <td className="px-6 py-4">
                            <div className="text-sm text-slate-900">{order.city}</div>
                            <div className="text-xs text-slate-500 truncate max-w-[150px]">{order.address}</div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(order.status)}`}>
                              {order.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="relative inline-block text-left group">
                              <button className="p-2 hover:bg-slate-100 rounded-lg transition-all">
                                <MoreHorizontal size={18} className="text-slate-400" />
                              </button>
                              <div className="absolute right-0 mt-2 w-40 bg-white border border-slate-200 rounded-xl shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-20">
                                <div className="p-1">
                                  {['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'].map((s) => (
                                    <button 
                                      key={s}
                                      onClick={() => updateOrderStatus(order.id, s)}
                                      disabled={updatingId === order.id}
                                      className="w-full text-left px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-lg capitalize disabled:opacity-50"
                                    >
                                      Mark as {s}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-sm p-8">
            <h2 className="text-xl font-bold mb-6">Dashboard Settings</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700">Application Name</label>
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={appName}
                    onChange={(e) => setAppName(e.target.value)}
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                  />
                  <button 
                    onClick={() => {
                      localStorage.setItem('admin_app_name', appName);
                      alert('Settings saved!');
                    }}
                    className="bg-indigo-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-sm"
                  >
                    Save
                  </button>
                </div>
                <p className="text-xs text-slate-400">This name will appear in the sidebar and dashboard header.</p>
              </div>

              <div className="pt-6 border-t border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 mb-4">Admin Profile</h3>
                <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 font-bold">
                    A
                  </div>
                  <div>
                    <div className="text-sm font-bold">System Administrator</div>
                    <div className="text-xs text-slate-500">{currentUser?.email || 'admin@store.com'}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
