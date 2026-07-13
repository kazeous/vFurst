import { getConventionOrg } from "@/lib/convention";
import { prisma } from "@vfurst/db";
import { ArrowRight, BedDouble, ShoppingBag, TicketCheck, Users } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

const experiences = [
  { suffix: "/register", label: "Tickets", description: "Choose your admission tier and convention add-ons.", icon: TicketCheck },
  { suffix: "/hotel", label: "Hotel", description: "Reserve a room from the official event block.", icon: BedDouble },
  { suffix: "/store", label: "Convention shop", description: "Browse official merchandise and event extras.", icon: ShoppingBag },
  { suffix: "/volunteer", label: "Join the crew", description: "Apply to volunteer and share your availability.", icon: Users }
];

export default async function ConventionHomePage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const org = await getConventionOrg(orgSlug);
  if (!org) notFound();
  const event = await prisma.event.findFirst({ where: { orgId: org.id, status: "PUBLISHED" }, orderBy: { startDate: "asc" } });

  return (
    <main className="vf-public-page vf-portal-home">
      <section className="vf-portal-intro">
        <div><p className="vf-label">Plan your weekend</p><h2>{event ? `Everything you need for ${event.name}` : `Welcome to ${org.name}`}</h2><p>{event?.description ?? "Tickets, rooms, merchandise, volunteering, and vendor applications—all in one official portal."}</p></div>
        <Link className="vf-portal-primary-action" href={`/${org.subdomain}/register`}>Start registration <ArrowRight size={17} /></Link>
      </section>
      <section className="vf-portal-experience-grid" aria-label="Convention services">
        {experiences.map(({ suffix, label, description, icon: Icon }) => <Link key={suffix} href={`/${org.subdomain}${suffix}`}><Icon size={22} /><span><strong>{label}</strong><small>{description}</small></span><ArrowRight size={17} /></Link>)}
      </section>
      <section className="vf-portal-trust"><span>Secure checkout</span><span>Official event inventory</span><span>Accessible on every device</span></section>
    </main>
  );
}
