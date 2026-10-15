"use client";

import { useSession } from "next-auth/react";

export function AccessDeniedIdentity() {
  const email = useSession().data?.user?.email;

  if (!email) {
    return null;
  }

  return (
    <p className="vf-access-denied-identity">
      Signed in as <strong>{email}</strong>
    </p>
  );
}
