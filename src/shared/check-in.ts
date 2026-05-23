export const BADGE_STATUSES = ["NOT_PRINTED", "PRINT_READY", "PRINTED", "VOID"] as const;
export type BadgeStatusValue = (typeof BADGE_STATUSES)[number];
