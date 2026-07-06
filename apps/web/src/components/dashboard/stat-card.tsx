import { Card } from "@astryxdesign/core/Card";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  progress?: number;
};

export function StatCard({ label, value, detail, progress }: StatCardProps) {
  return (
    <Card className="vf-stat-card" padding={4}>
      <p className="vf-label">{label}</p>
      <strong>{value}</strong>
      <span>{detail}</span>
      {typeof progress === "number" ? (
        <div className="vf-progress" aria-label={`${label} progress`}>
          <span style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
        </div>
      ) : null}
    </Card>
  );
}

