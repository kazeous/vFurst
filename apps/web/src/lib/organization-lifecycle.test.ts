import { describe, expect, it } from "vitest";
import {
  assertOrganizationActive,
  assertOrganizationTransition,
  getAllowedOrganizationTransitions,
  OrganizationLifecycleError
} from "./organization-lifecycle";

describe("organization lifecycle", () => {
  it("allows only the supported lifecycle transitions", () => {
    expect(getAllowedOrganizationTransitions("PROVISIONING")).toEqual(["ACTIVE", "RETIRED"]);
    expect(getAllowedOrganizationTransitions("ACTIVE")).toEqual(["SUSPENDED", "RETIRED"]);
    expect(getAllowedOrganizationTransitions("SUSPENDED")).toEqual(["ACTIVE", "RETIRED"]);
    expect(getAllowedOrganizationTransitions("RETIRED")).toEqual([]);
  });

  it("requires an accepted owner before activation", () => {
    expect(() =>
      assertOrganizationTransition({ currentStatus: "PROVISIONING", targetStatus: "ACTIVE", ownerCount: 0 })
    ).toThrow("at least one owner");

    expect(() =>
      assertOrganizationTransition({ currentStatus: "PROVISIONING", targetStatus: "ACTIVE", ownerCount: 1 })
    ).not.toThrow();
  });

  it("keeps retirement terminal and treats only ACTIVE as open for new activity", () => {
    expect(() =>
      assertOrganizationTransition({ currentStatus: "RETIRED", targetStatus: "ACTIVE", ownerCount: 1 })
    ).toThrow(OrganizationLifecycleError);
    expect(() => assertOrganizationActive("ACTIVE")).not.toThrow();
    expect(() => assertOrganizationActive("SUSPENDED")).toThrow(OrganizationLifecycleError);
  });
});
