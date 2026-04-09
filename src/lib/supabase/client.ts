import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing Supabase environment variables. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

if (typeof window !== "undefined") {
  const authLoggerKey = "__journi_supabase_auth_logger__";
  const authLoggerWindow = window as typeof window & {
    [authLoggerKey]?: boolean;
  };

  if (!authLoggerWindow[authLoggerKey]) {
    authLoggerWindow[authLoggerKey] = true;

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("[Journi Auth] Unable to read current session", error.message);
        return;
      }

      const user = data.session?.user;
      console.log("[Journi Auth] Current session", {
        authenticated: Boolean(user),
        email: user?.email ?? null,
        userId: user?.id ?? null,
        plan: user?.user_metadata?.plan ?? null,
        role: user?.user_metadata?.role ?? null,
      });
    });

    supabase.auth.onAuthStateChange((event, session) => {
      const user = session?.user;

      console.log("[Journi Auth] Auth state changed", {
        event,
        authenticated: Boolean(user),
        email: user?.email ?? null,
        userId: user?.id ?? null,
        plan: user?.user_metadata?.plan ?? null,
        role: user?.user_metadata?.role ?? null,
      });
    });
  }
}
