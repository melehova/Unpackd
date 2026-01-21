import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../supabase/Supabase API';

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient<Database>(url, key);
