"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

type StringOperatorValue = { type: "string"; value: string };
type EnumOperatorValue = { type: "enum"; value: string };

export type PowerSearchFilter = {
  field: string;
  operator?: string;
  value: StringOperatorValue | EnumOperatorValue;
};

export type PowerSearchConfig = {
  name: string;
  contentSearchFieldKey?: string;
  fields: Array<{
    key: string;
    label: string;
    defaultOperator?: string;
    operators?: Array<{
      key: string;
      label: string;
      value?: {
        type: string;
        values?: Array<{ value: string; label: string }>;
      };
    }>;
  }>;
};

export interface PowerSearchProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "onChange"> {
  config: PowerSearchConfig;
  filters: PowerSearchFilter[];
  onChange: (filters: PowerSearchFilter[]) => void;
  placeholder?: string;
}

export function PowerSearch({ config, filters, onChange, placeholder, className, ...props }: PowerSearchProps) {
  const contentKey = config.contentSearchFieldKey ?? config.fields[0]?.key ?? "content";
  const contentFilter = filters.find((filter) => filter.field === contentKey && filter.value.type === "string");
  const enumFields = config.fields.filter((field) =>
    field.operators?.some((operator) => operator.value?.type === "enum" && operator.value.values?.length)
  );

  function setFilter(next: PowerSearchFilter) {
    onChange([...filters.filter((filter) => filter.field !== next.field), next]);
  }

  function removeFilter(field: string) {
    onChange(filters.filter((filter) => filter.field !== field));
  }

  return (
    <div className={cn("vf-ui-power-search", className)} {...props}>
      <input
        type="search"
        placeholder={placeholder ?? "Search"}
        value={contentFilter?.value.value ?? ""}
        onChange={(event) => {
          const value = event.target.value;
          if (!value) {
            removeFilter(contentKey);
            return;
          }

          setFilter({ field: contentKey, operator: "contains", value: { type: "string", value } });
        }}
      />
      {enumFields.map((field) => {
        const operator = field.operators?.find((item) => item.value?.type === "enum" && item.value.values?.length);
        const current = filters.find((filter) => filter.field === field.key && filter.value.type === "enum");

        return (
          <select
            key={field.key}
            aria-label={field.label}
            value={current?.value.value ?? ""}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) {
                removeFilter(field.key);
                return;
              }

              setFilter({ field: field.key, operator: operator?.key ?? "is", value: { type: "enum", value } });
            }}
          >
            <option value="">{field.label}</option>
            {operator?.value?.values?.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        );
      })}
    </div>
  );
}
