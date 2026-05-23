export const ORGANIZATION_ROLES = ["OWNER", "ADMIN", "MEMBER"] as const;
export type OrganizationRoleValue = (typeof ORGANIZATION_ROLES)[number];

export const EVENT_ROLES = ["EVENT_ADMIN", "STAFF", "VIEWER"] as const;
export type EventRoleValue = (typeof EVENT_ROLES)[number];

export const EVENT_STATUSES = ["DRAFT", "REGISTRATION_OPEN", "LIVE", "CLOSED", "ARCHIVED"] as const;
export type EventStatusValue = (typeof EVENT_STATUSES)[number];

export const INVITE_STATUSES = ["PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const;
export type InviteStatusValue = (typeof INVITE_STATUSES)[number];
