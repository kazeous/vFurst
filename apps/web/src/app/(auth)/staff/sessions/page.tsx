import { auth } from "@/lib/auth";
import { prisma } from "@vfurst/db";
import { redirect } from "next/navigation";
import { staffSignOut, staffSignOutEverywhere, revokeOtherStaffSession } from "@/actions/staff-auth-actions";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from "@/components/ui/card";
import { ActionStateForm } from "@/components/action-state-form";

export default async function StaffSessionsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?returnTo=%2Fstaff%2Fsessions");
  const now = new Date();
  const sessions = await prisma.session.findMany({
    where: { userId: session.user.id, revokedAt: null, expires: { gt: now }, idleExpiresAt: { gt: now } },
    select: { id: true, createdAt: true, lastUsedAt: true, expires: true }, orderBy: { createdAt: "desc" }, take: 100
  });
  return <Card maxWidth={600}>
    <CardHeader><CardTitle>Your vFurst staff sessions</CardTitle><CardDescription>{session.user.email}</CardDescription></CardHeader>
    <CardContent className="vf-stack">
      <p>Staff sessions expire after 30 minutes of inactivity and at most 12 hours.</p>
      <ul className="vf-stack">
        {sessions.map((item) => <li key={item.id}>
          <p>{item.id === session.identitySessionId ? "This session" : "Another session"} · Started <time dateTime={item.createdAt.toISOString()}>{item.createdAt.toLocaleString("en-GB", { timeZone: "UTC" })} UTC</time></p>
          {item.id !== session.identitySessionId ? <ActionStateForm action={revokeOtherStaffSession}>
            <input type="hidden" name="sessionId" value={item.id} />
            <Button type="submit" variant="outline" label="End session" />
          </ActionStateForm> : null}
        </li>)}
      </ul>
      <form action={staffSignOut}><Button type="submit" label="Log out" /></form>
      <form action={staffSignOutEverywhere}><Button type="submit" variant="destructive" label="Log out of all vFurst sessions" /></form>
      <Button href="/dashboard" label="Back to workspace" />
    </CardContent>
  </Card>;
}
