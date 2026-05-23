export const VOLUNTEER_APPLICATION_STATUSES = ["SUBMITTED", "UNDER_REVIEW", "ACCEPTED", "DECLINED", "WAITLISTED"] as const;
export type VolunteerApplicationStatusValue = (typeof VOLUNTEER_APPLICATION_STATUSES)[number];

export const VOLUNTEER_CONTACT_METHODS = ["EMAIL", "PHONE", "SMS", "DISCORD", "OTHER"] as const;
export type VolunteerContactMethodValue = (typeof VOLUNTEER_CONTACT_METHODS)[number];

export const VOLUNTEER_ASSIGNMENT_STATES = [
  "INTERESTED",
  "PREVIOUS_EXPERIENCE",
  "AVOID",
  "REQUESTED_BY_LEAD",
  "ASSIGNED"
] as const;
export type VolunteerAssignmentStateValue = (typeof VOLUNTEER_ASSIGNMENT_STATES)[number];
