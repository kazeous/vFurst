export const defaultLocale = "en" as const;

export const messages = {
  navigation: {
    dashboard: "Dashboard",
    organizations: "Organizations",
    events: "Events",
    settings: "Settings",
    search: "Search navigation",
    openMenu: "Open navigation",
    closeMenu: "Close navigation"
  },
  actions: {
    save: "Save changes",
    cancel: "Cancel",
    continue: "Continue",
    back: "Back"
  }
} as const;

export function formatDate(value: Date | string, options?: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(defaultLocale, options ?? { dateStyle: "medium" }).format(new Date(value));
}

export function formatDateRange(start: Date | string, end: Date | string) {
  const formatter = new Intl.DateTimeFormat(defaultLocale, { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
}
