"use client";

import { useEffect, useState } from "react";
import { YbugProvider, useYbugApi } from "ybug-react";
import { supabase } from "@/lib/supabase/client";

const YBUG_ID = "1ywzs101jzvn0q6f8042";

type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
};

function YbugIdentitySync() {
  const ybugContext = useYbugApi();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadUser() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!mounted) {
        return;
      }

      if (!user?.email) {
        setCurrentUser(null);
        return;
      }

      setCurrentUser({
        id: user.id,
        email: user.email,
        fullName:
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      });
    }

    void loadUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user;

      if (!user?.email) {
        setCurrentUser(null);
        return;
      }

      setCurrentUser({
        id: user.id,
        email: user.email,
        fullName:
          typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name : "",
      });
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!ybugContext?.init) {
      return;
    }

    if (!currentUser) {
      ybugContext.init({
        feedback: {
          email: "",
          name: "",
        },
      });
      return;
    }

    ybugContext.init({
      feedback: {
        email: currentUser.email,
        name: currentUser.fullName,
      },
      user: {
        id: currentUser.id,
        email: currentUser.email,
        name: currentUser.fullName || currentUser.email,
      },
    });
  }, [currentUser, ybugContext]);

  return null;
}

export function JourniYbugProvider({ children }: { children: React.ReactNode }) {
  return (
    <YbugProvider
      ybugId={YBUG_ID}
      settings={{
        launcher_position: "bottom-right",
        widget_position: "right",
      }}
    >
      <YbugIdentitySync />
      {children}
    </YbugProvider>
  );
}
