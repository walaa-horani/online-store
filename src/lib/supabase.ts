import { createClient } from '@supabase/supabase-js';
import * as Config from '../constants';

const isSupabaseConfigured = () => {
  return Config.SUPABASE_URL && 
         Config.SUPABASE_URL.startsWith('http') && 
         Config.SUPABASE_PUBLISHABLE_KEY && 
         !Config.SUPABASE_PUBLISHABLE_KEY.includes('{{');
};

let supabaseClient: any = null;

export const getSupabase = () => {
  if (!supabaseClient && isSupabaseConfigured()) {
    console.log('Initializing Supabase client with URL:', Config.SUPABASE_URL);
    supabaseClient = createClient(Config.SUPABASE_URL, Config.SUPABASE_PUBLISHABLE_KEY);
  }
  return supabaseClient;
};
