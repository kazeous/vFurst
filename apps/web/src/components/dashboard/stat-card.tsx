import { Card } from "@astryxdesign/core/Card";
import { Heading } from "@astryxdesign/core/Heading";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Text } from "@astryxdesign/core/Text";

type StatCardProps = {
  label: string;
  value: string;
  detail: string;
  progress?: number;
};

export function StatCard({ label, value, detail, progress }: StatCardProps) {
  return (
    <Card className="vf-stat-card" padding={4}>
      <Text type="label" color="secondary" display="block">
        {label}
      </Text>
      <Heading level={2} type="display-3">
        {value}
      </Heading>
      <Text type="supporting" color="secondary" display="block">
        {detail}
      </Text>
      {typeof progress === "number" ? (
        <ProgressBar value={Math.min(Math.max(progress, 0), 100)} label={`${label} progress`} isLabelHidden />
      ) : null}
    </Card>
  );
}
