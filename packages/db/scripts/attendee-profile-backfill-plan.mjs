export function planAttendeeProfileBackfill({ accounts, registrations, existingSelfProfiles, newId }) {
  const profiles = [];
  const assignments = [];
  const selfProfiles = new Map(existingSelfProfiles.map((profile) => [profile.portalAccountId, profile.id]));
  const activeStatuses = new Set(["PENDING", "CONFIRMED", "CHECKED_IN"]);
  const byAccount = new Map();
  for (const registration of registrations) {
    const ownedRegistrations = byAccount.get(registration.portalAccountId) ?? [];
    ownedRegistrations.push(registration);
    byAccount.set(registration.portalAccountId, ownedRegistrations);
  }

  for (const account of accounts) {
    const ownedRegistrations = byAccount.get(account.id) ?? [];
    if (ownedRegistrations.length === 0) continue;

    const base = (account.name?.normalize("NFC").trim().replace(/\s+/g, " ") || account.email).slice(0, 120);
    const profileIds = new Map();
    const profileForRank = (rank) => {
      if (profileIds.has(rank)) return profileIds.get(rank);
      let id = rank === 1 ? selfProfiles.get(account.id) : undefined;
      if (!id) {
        id = newId();
        const suffix = rank === 1 ? "" : ` (${rank})`;
        profiles.push({
          id,
          orgId: account.orgId,
          portalAccountId: account.id,
          accountHolderOf: rank === 1 ? account.id : null,
          fullName: `${base.slice(0, 120 - suffix.length)}${suffix}`
        });
      }
      profileIds.set(rank, id);
      return id;
    };

    profileForRank(1);
    const events = new Map();
    for (const registration of ownedRegistrations) {
      if (!activeStatuses.has(registration.status)) continue;
      const eventRegistrations = events.get(registration.eventId) ?? [];
      eventRegistrations.push(registration);
      events.set(registration.eventId, eventRegistrations);
    }
    const ranks = new Map();
    for (const eventRegistrations of events.values()) {
      eventRegistrations.sort((left, right) =>
        new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime()
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0)
      );
      eventRegistrations.forEach((registration, index) => ranks.set(registration.id, index + 1));
    }
    for (const registration of ownedRegistrations) {
      assignments.push({ registrationId: registration.id, attendeeProfileId: profileForRank(ranks.get(registration.id) ?? 1) });
    }
  }
  return { profiles, assignments };
}
