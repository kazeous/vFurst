export type BadgeOutputStatus = "printed" | "ready" | "failed" | "queued";
export type BadgeOutputFields = {
  generatedAt: Date | string | null;
  printedAt: Date | string | null;
  renderIssue: string | null;
};

export function badgeOutputStatus(badge: BadgeOutputFields): BadgeOutputStatus {
  if (badge.printedAt) return "printed";
  if (badge.generatedAt) return "ready";
  if (badge.renderIssue) return "failed";
  return "queued";
}

export function badgeOutputMessage(badge: BadgeOutputFields): string {
  if (badge.generatedAt) return badge.renderIssue ? `Badge output is ready. ${badge.renderIssue}` : "Badge output is ready.";
  if (badge.renderIssue) return `Badge could not be rendered: ${badge.renderIssue}`;
  return "Badge output is waiting for the render worker.";
}
