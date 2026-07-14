import type { OrganizationStatus } from "@vfurst/db";

export const organizationStatusLabels: Record<OrganizationStatus, string> = {
  PROVISIONING: "Provisioning",
  ACTIVE: "Active",
  SUSPENDED: "Suspended",
  RETIRED: "Retired"
};

const allowedTransitions: Record<OrganizationStatus, readonly OrganizationStatus[]> = {
  PROVISIONING: ["ACTIVE", "RETIRED"],
  ACTIVE: ["SUSPENDED", "RETIRED"],
  SUSPENDED: ["ACTIVE", "RETIRED"],
  RETIRED: []
};

export class OrganizationLifecycleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OrganizationLifecycleError";
  }
}

export function getAllowedOrganizationTransitions(status: OrganizationStatus) {
  return allowedTransitions[status];
}

export function assertOrganizationActive(status: OrganizationStatus) {
  if (status !== "ACTIVE") {
    throw new OrganizationLifecycleError("This organization is not active. New activity is temporarily unavailable.");
  }
}

export function assertOrganizationTransition(input: {
  currentStatus: OrganizationStatus;
  targetStatus: OrganizationStatus;
  ownerCount: number;
}) {
  if (!allowedTransitions[input.currentStatus].includes(input.targetStatus)) {
    throw new OrganizationLifecycleError(
      `Organization cannot move from ${organizationStatusLabels[input.currentStatus]} to ${organizationStatusLabels[input.targetStatus]}.`
    );
  }

  if (input.targetStatus === "ACTIVE" && input.ownerCount < 1) {
    throw new OrganizationLifecycleError("An organization needs at least one owner before it can be activated.");
  }
}
