"use client";

import { bulkUpdateRegistrations } from "@/actions/registration-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PowerSearch } from "@/components/ui/power-search";
import type { PowerSearchConfig, PowerSearchFilter } from "@/components/ui/power-search";
import { Table } from "@/components/ui/table";
import { proportional, type TableColumn } from "@/components/ui/table";
import { useMemo, useState } from "react";

type RegistrationRow = {
  id: string;
  eventId: string;
  attendee: string;
  email: string;
  type: string;
  status: "PENDING" | "CONFIRMED" | "CANCELLED" | "TRANSFERRED" | "CHECKED_IN";
  approvalStatus: "APPROVED" | "PENDING" | "REJECTED";
  createdAt: string;
};

const config: PowerSearchConfig = {
  name: "registrations",
  contentSearchFieldKey: "content",
  fields: [
    {
      key: "content",
      label: "Search",
      defaultOperator: "contains",
      operators: [{ key: "contains", label: "contains", value: { type: "string" } }]
    },
    {
      key: "status",
      label: "Status",
      defaultOperator: "is",
      operators: [
        {
          key: "is",
          label: "is",
          value: {
            type: "enum",
            values: [
              { value: "PENDING", label: "Pending" },
              { value: "CONFIRMED", label: "Confirmed" },
              { value: "CANCELLED", label: "Cancelled" },
              { value: "TRANSFERRED", label: "Transferred" },
              { value: "CHECKED_IN", label: "Checked in" }
            ]
          }
        }
      ]
    }
  ]
};

function badgeVariant(status: RegistrationRow["status"]) {
  if (status === "CONFIRMED" || status === "CHECKED_IN") {
    return "success";
  }

  if (status === "CANCELLED") {
    return "error";
  }

  if (status === "TRANSFERRED") {
    return "info";
  }

  return "warning";
}

export function RegistrationsTable({ rows, eventId }: { rows: RegistrationRow[]; eventId: string }) {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const selectedIds = selected.join(",");

  const filtered = useMemo(() => {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.field === "content" && filter.value.type === "string") {
          const query = filter.value.value.toLowerCase();
          return `${row.attendee} ${row.email} ${row.type}`.toLowerCase().includes(query);
        }

        if (filter.field === "status" && filter.value.type === "enum") {
          return row.status === filter.value.value;
        }

        return true;
      })
    );
  }, [filters, rows]);

  const columns = useMemo<TableColumn<RegistrationRow>[]>(
    () => [
      {
        key: "id",
        header: "",
        width: proportional(0.4),
        renderCell: (row) => (
          <input
            type="checkbox"
            aria-label={`Select ${row.attendee}`}
            checked={selected.includes(row.id)}
            onChange={(event) =>
              setSelected((current) =>
                event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)
              )
            }
          />
        )
      },
      {
        key: "attendee",
        header: "Attendee",
        width: proportional(2),
        renderCell: (row) => <a href={`/dashboard/events/${row.eventId}/registrations/${row.id}`}>{row.attendee}</a>
      },
      { key: "email", header: "Email", width: proportional(2) },
      { key: "type", header: "Type", width: proportional(1) },
      {
        key: "status",
        header: "Status",
        width: proportional(1),
        renderCell: (row) => <Badge label={row.status} variant={badgeVariant(row.status)} />
      },
      {
        key: "approvalStatus",
        header: "Approval",
        width: proportional(1),
        renderCell: (row) => <Badge label={row.approvalStatus} variant={row.approvalStatus === "APPROVED" ? "success" : row.approvalStatus === "REJECTED" ? "error" : "warning"} />
      },
      { key: "createdAt", header: "Created", width: proportional(1) }
    ],
    [selected]
  );

  return (
    <div className="vf-stack">
      <PowerSearch config={config} filters={filters} onChange={(nextFilters) => setFilters([...nextFilters])} placeholder="Search registrations" />
      <div className="vf-actions">
        <form action={bulkUpdateRegistrations}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="registrationIds" value={selectedIds} />
          <input type="hidden" name="action" value="APPROVED" />
          <Button label="Approve selected" type="submit" size="sm" />
        </form>
        <form action={bulkUpdateRegistrations}>
          <input type="hidden" name="eventId" value={eventId} />
          <input type="hidden" name="registrationIds" value={selectedIds} />
          <input type="hidden" name="action" value="CANCELLED" />
          <Button label="Cancel selected" type="submit" size="sm" variant="destructive" />
        </form>
        <Button label="Export CSV" href={`/dashboard/events/${eventId}/registrations/export`} size="sm" />
      </div>
      <Table data={filtered} columns={columns} idKey="id" density="compact" dividers="grid" hasHover textOverflow="truncate" />
    </div>
  );
}
