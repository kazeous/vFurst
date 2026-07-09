import * as React from "react";
import { cn } from "@/lib/utils";

export type ProportionalWidth = { type: "proportional"; value: number };
export type PixelWidth = { type: "pixel"; value: number };
export type ColumnWidth = ProportionalWidth | PixelWidth;

export function proportional(value: number): ProportionalWidth {
  return { type: "proportional", value };
}

export function pixel(value: number): PixelWidth {
  return { type: "pixel", value };
}

export type TableColumn<T extends Record<string, unknown>> = {
  key: keyof T | string;
  header: React.ReactNode;
  width?: ColumnWidth;
  align?: "start" | "center" | "end";
  renderCell?: (row: T) => React.ReactNode;
};

export interface TableProps<T extends Record<string, unknown>> extends React.TableHTMLAttributes<HTMLTableElement> {
  data: T[];
  columns: TableColumn<T>[];
  idKey: keyof T;
  tableProps?: React.TableHTMLAttributes<HTMLTableElement>;
  density?: "compact" | "balanced" | "spacious";
  dividers?: "rows" | "columns" | "grid" | "none";
  hasHover?: boolean;
  textOverflow?: "wrap" | "truncate";
}

function columnStyle(width?: ColumnWidth): React.CSSProperties | undefined {
  if (!width) {
    return undefined;
  }

  if (width.type === "pixel") {
    return { width: width.value };
  }

  return { width: `${Math.max(width.value, 0.1)}fr` };
}

function formatCellValue(value: unknown) {
  if (value == null) {
    return "";
  }

  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}

export function Table<T extends Record<string, unknown>>({
  data,
  columns,
  idKey,
  tableProps,
  density = "balanced",
  dividers = "rows",
  hasHover,
  textOverflow = "wrap",
  className,
  ...props
}: TableProps<T>) {
  return (
    <div className="vf-ui-table-wrap">
      <table
        className={cn(
          "vf-ui-table",
          `vf-ui-table-${density}`,
          `vf-ui-table-dividers-${dividers}`,
          hasHover ? "vf-ui-table-hover" : undefined,
          textOverflow === "truncate" ? "vf-ui-table-truncate" : undefined,
          className
        )}
        {...tableProps}
        {...props}
      >
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={String(column.key)} style={columnStyle(column.width)} data-align={column.align ?? "start"}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr key={String(row[idKey])}>
              {columns.map((column) => {
                const content = column.renderCell ? column.renderCell(row) : formatCellValue(row[column.key as keyof T]);

                return (
                  <td key={String(column.key)} data-align={column.align ?? "start"}>
                    {content}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
