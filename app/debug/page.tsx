"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

export default function DebugPage() {
  const [session, setSession] = useState<any>(null);

  useEffect(() => {
    async function load() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
    }
    load();
  }, []);

  return (
    <pre style={{ padding: 20, background: "#eee" }}>
      {JSON.stringify(session, null, 2)}
    </pre>
  );
}