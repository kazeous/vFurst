"use client";

import { useEffect, useState } from "react";

export function useServiceWorker() {
  const [online, setOnline] = useState(true);
  const [registrationState, setRegistrationState] = useState<"idle" | "registered" | "unavailable" | "failed">("idle");

  useEffect(() => {
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => setRegistrationState("registered"))
        .catch(() => setRegistrationState("failed"));
    } else {
      setRegistrationState("unavailable");
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return {
    online,
    registrationState
  };
}
