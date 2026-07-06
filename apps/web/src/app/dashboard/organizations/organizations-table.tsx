"use client";

import { Table, pixel, proportional } from "@astryxdesign/core/Table";
import Link from "next/link";

export type OrganizationTableRow = {
  id: string;
  name: string;
  subdomain: string;
  events: number;
  members: number;
  href: string;
};

export function OrganizationsTable({ rows }: { rows: OrganizationTableRow[] }) {
  return (
    <Table
      data={rows}
      idKey="id"
      tableProps={{ "aria-label": "Organizations" }}
      density="balanced"
      hasHover
      columns={[
        {
          key: "name",
          header: "Name",
          width: proportional(2),
          renderCell: (org) => <Link href={org.href}>{org.name}</Link>
        },
        { key: "subdomain", header: "Subdomain", width: proportional(2) },
        { key: "events", header: "Events", width: pixel(120), align: "end" },
        { key: "members", header: "Members", width: pixel(120), align: "end" }
      ]}
    />
  );
}
