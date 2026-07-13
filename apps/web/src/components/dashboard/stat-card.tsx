import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";
import type { LucideIcon } from "lucide-react";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  progress?: number;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "info";
};

export function StatCard({ label, value, detail, progress, icon: Icon, tone = "default" }: StatCardProps) {
  return (
    <Card className="vf-stat-card" padding={4} data-tone={tone}>
      <div className="vf-stat-card-head">
        <span className="vf-stat-label">{label}</span>
        {Icon ? <span className="vf-stat-icon"><Icon size={17} aria-hidden="true" /></span> : null}
      </div>
      <strong>{value}</strong>
      <span>{detail}</span>
      {typeof progress === "number" ? (
        <ProgressBar value={Math.min(Math.max(progress, 0), 100)} label={`${label} progress`} isLabelHidden />
      ) : null}
    </Card>
  );
}
