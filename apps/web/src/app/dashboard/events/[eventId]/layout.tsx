import { prisma } from "@vfurst/db";
import { Button } from "@astryxdesign/core/Button";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

const sections = [
  { href: "", label: "Overview" },
  { href: "/registrations", label: "All Registrations" },
  { href: "/registrations/types", label: "Registration Types" },
  { href: "/registrations/transfers", label: "Transfers" },
  { href: "/check-in", label: "Check-In" },
  { href: "/badges", label: "Badges" },
  { href: "/staff", label: "Staff" },
  { href: "/vendors", label: "Vendors" },
  { href: "/store", label: "Store" },
  { href: "/hotel", label: "Hotel" },
  { href: "/vouchers", label: "Vouchers" },
  { href: "/raffle", label: "Raffle" },
  { href: "/analytics", label: "Analytics" },
  { href: "/settings", label: "Settings" }
];

export default async function EventLayout({ children, params }: { children: ReactNode; params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await prisma.event.findUnique({
    where: {
      id: eventId
    },
    include: {
      org: true
    }
  });

  if (!event) {
    notFound();
  }

  return (
    <div className="vf-event-shell">
      <aside className="vf-event-nav">
        <p className="vf-label">{event.org.name}</p>
        <h2>{event.name}</h2>
        <nav>
          {sections.map((section) => (
            <a key={section.href || "overview"} href={`/dashboard/events/${event.id}${section.href}`}>
              {section.label}
            </a>
          ))}
        </nav>
        <Button label="Events" href="/dashboard/events" size="sm" />
      </aside>
      <div className="vf-event-content">{children}</div>
    </div>
  );
}

