"use client";

import React, { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

type MePayload = {
  authenticated: boolean;
  user?: {
    username: string;
    displayName: string;
    role: string;
  };
};

export function SecurityStatusBar() {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<MePayload["user"] | null>(null);

  useEffect(() => {
    if (pathname === "/login") return;
    let cancelled = false;
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = (await res.json()) as MePayload;
      if (!cancelled && data.user) setUser(data.user);
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  if (pathname === "/login" || !user) return null;

  const signOut = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="security-status-bar">
      <span>
        Signed in: {user.displayName} ({user.role})
      </span>
      <button onClick={() => void signOut()}>Sign out</button>
    </div>
  );
}
