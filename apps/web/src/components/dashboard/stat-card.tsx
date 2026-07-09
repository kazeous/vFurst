import { Card } from "@/components/ui/card";
import { ProgressBar } from "@/components/ui/progress";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  progress?: number;
};

export function StatCard({ label, value, detail, progress }: StatCardProps) {
  return (
    <Card className="vf-stat-card" padding={4}>
      <span className="vf-stat-label">{label}</span>
      <strong>{value}</strong>
      <span>{detail}</span>
      {typeof progress === "number" ? (
        <ProgressBar value={Math.min(Math.max(progress, 0), 100)} label={`${label} progress`} isLabelHidden />
      ) : null}
    </Card>
  );
}
