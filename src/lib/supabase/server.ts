import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const missingSupabaseServerVariables = [
  !supabaseUrl ? "NEXT_PUBLIC_SUPABASE_URL" : null,
  !supabaseAnonKey ? "NEXT_PUBLIC_SUPABASE_ANON_KEY" : null,
  !supabaseServiceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null,
].filter((value): value is string => Boolean(value));

export const hasSupabaseServerConfig = missingSupabaseServerVariables.length === 0;

const resolvedSupabaseUrl = supabaseUrl || "http://127.0.0.1:54321";
const resolvedSupabaseAnonKey = supabaseAnonKey || "missing-supabase-anon-key";
const resolvedSupabaseServiceRoleKey = supabaseServiceRoleKey || "missing-supabase-service-role-key";

export const supabaseAdmin = createClient(resolvedSupabaseUrl, resolvedSupabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseServerPublic = createClient(resolvedSupabaseUrl, resolvedSupabaseAnonKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
