"use client";

import { Badge } from "@/components/ui/badge";
import { PowerSearch } from "@/components/ui/power-search";
import type { PowerSearchConfig, PowerSearchFilter } from "@/components/ui/power-search";
import { Table } from "@/components/ui/table";
import { proportional, type TableColumn } from "@/components/ui/table";
import { useMemo, useState } from "react";

type EventRow = {
  id: string;
  name: string;
  orgName: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  startDate: string;
  registrationCount: number;
  revenue: string;
};

const searchConfig: PowerSearchConfig = {
  name: "events",
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
              { value: "DRAFT", label: "Draft" },
              { value: "PUBLISHED", label: "Published" },
              { value: "ARCHIVED", label: "Archived" }
            ]
          }
        }
      ]
    }
  ]
};

function statusVariant(status: EventRow["status"]) {
  if (status === "PUBLISHED") {
    return "success";
  }

  if (status === "ARCHIVED") {
    return "neutral";
  }

  return "warning";
}

export function EventsTable({ events }: { events: EventRow[] }) {
  const [filters, setFilters] = useState<PowerSearchFilter[]>([]);
  const filtered = useMemo(() => {
    return events.filter((event) =>
      filters.every((filter) => {
        if (filter.field === "content" && filter.value.type === "string") {
          const query = filter.value.value.toLowerCase();
          return `${event.name} ${event.orgName}`.toLowerCase().includes(query);
        }

        if (filter.field === "status" && filter.value.type === "enum") {
          return event.status === filter.value.value;
        }

        return true;
      })
    );
  }, [events, filters]);

  const columns = useMemo<TableColumn<EventRow>[]>(
    () => [
      {
        key: "name",
        header: "Event",
        width: proportional(2),
        renderCell: (event) => <a href={`/dashboard/events/${event.id}`}>{event.name}</a>
      },
      { key: "orgName", header: "Organization", width: proportional(1) },
      {
        key: "status",
        header: "Status",
        width: proportional(1),
        renderCell: (event) => <Badge label={event.status} variant={statusVariant(event.status)} />
      },
      { key: "startDate", header: "Start", width: proportional(1) },
      { key: "registrationCount", header: "Registrations", width: proportional(1) },
      { key: "revenue", header: "Revenue", width: proportional(1) }
    ],
    []
  );

  return (
    <div className="vf-stack">
      <PowerSearch config={searchConfig} filters={filters} onChange={(nextFilters) => setFilters([...nextFilters])} placeholder="Search events" />
      <Table data={filtered} columns={columns} idKey="id" density="compact" dividers="grid" hasHover textOverflow="truncate" />
    </div>
  );
}
