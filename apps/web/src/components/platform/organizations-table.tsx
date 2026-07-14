"use client";

import { Badge } from "@/components/ui/badge";
import { Table, pixel, proportional } from "@/components/ui/table";
import type { OrganizationStatus } from "@vfurst/db";
import Link from "next/link";

type OrganizationTableRow = {
  id: string;
  name: string;
  subdomain: string;
  status: OrganizationStatus;
  events: number;
  members: number;
  href: string;
};

function statusVariant(status: OrganizationStatus) {
  if (status === "ACTIVE") return "success" as const;
  if (status === "SUSPENDED" || status === "PROVISIONING") return "warning" as const;
  return "neutral" as const;
}

export function PlatformOrganizationsTable({ rows }: { rows: OrganizationTableRow[] }) {
  return (
    <Table
      data={rows}
      idKey="id"
      tableProps={{ "aria-label": "Platform organizations" }}
      density="balanced"
      hasHover
      columns={[
        {
          key: "name",
          header: "Name",
          width: proportional(2),
          renderCell: (org) => <Link href={org.href}>{org.name}</Link>
        },
        {
          key: "status",
          header: "Lifecycle",
          width: pixel(150),
          renderCell: (org) => <Badge label={org.status.toLowerCase()} variant={statusVariant(org.status)} />
        },
        { key: "subdomain", header: "Subdomain", width: proportional(2) },
        { key: "events", header: "Events", width: pixel(120), align: "end" },
        { key: "members", header: "Members", width: pixel(120), align: "end" }
      ]}
    />
  );
}
