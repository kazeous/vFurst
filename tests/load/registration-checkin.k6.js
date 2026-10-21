import http from "k6/http";
import { check, sleep } from "k6";
import { Trend } from "k6/metrics";

const defaultBaseUrl = __ENV.VFURST_K6_RUNTIME === "docker" ? "http://host.docker.internal:3000" : "http://127.0.0.1:3000";
const baseUrl = __ENV.VFURST_BASE_URL || defaultBaseUrl;
const eventId = __ENV.VFURST_LOAD_EVENT_ID || "00000000-0000-0000-0000-000000000000";
const staffCookie = __ENV.VFURST_STAFF_COOKIE || "";
const portalHost = __ENV.VFURST_PORTAL_HOST || "";
const portalSessionCookie = __ENV.VFURST_PORTAL_SESSION_COOKIE || "";
const hostHeader = __ENV.VFURST_HOST_HEADER || (__ENV.VFURST_K6_RUNTIME === "docker" ? "localhost:3000" : "");
const loadProfile = __ENV.VFURST_LOAD_PROFILE || "full";
const registrationVus = Number(__ENV.VFURST_REGISTRATION_VUS || (loadProfile === "smoke" ? 2 : 500));
const checkInVus = Number(__ENV.VFURST_CHECKIN_VUS || (loadProfile === "smoke" ? 1 : 50));
const durationThreshold = loadProfile === "smoke" ? "p(95)<10000" : "p(95)<1500";
const registrationDuration = new Trend("registration_flow_duration", true);
const checkInDuration = new Trend("checkin_flow_duration", true);

function stagesFor(target) {
  if (loadProfile === "smoke") {
    return [
      { duration: "10s", target },
      { duration: "20s", target },
      { duration: "5s", target: 0 }
    ];
  }

  return [
    { duration: "2m", target },
    { duration: "5m", target },
    { duration: "1m", target: 0 }
  ];
}

export const options = {
  discardResponseBodies: false,
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  scenarios: {
    registration: {
      executor: "ramping-vus",
      exec: "registrationFlow",
      startVUs: 0,
      stages: stagesFor(registrationVus),
      gracefulRampDown: "30s"
    },
    checkIn: {
      executor: "ramping-vus",
      exec: "checkInFlow",
      startVUs: 0,
      stages: stagesFor(checkInVus),
      gracefulRampDown: "30s"
    }
  },
  thresholds: {
    checks: ["rate>0.99"],
    http_req_failed: ["rate<0.01"],
    http_req_duration: [durationThreshold]
  }
};

function headers(extra = {}) {
  return hostHeader ? { Host: hostHeader, ...extra } : extra;
}

function bodyIncludes(response, text) {
  return typeof response.body === "string" && response.body.includes(text);
}

function portalAccountEmail(response) {
  try {
    return response.json("account.email");
  } catch {
    return null;
  }
}

export function setup() {
  if (!staffCookie) {
    throw new Error("VFURST_STAFF_COOKIE is required");
  }

  if (!portalHost || !portalSessionCookie) {
    throw new Error("VFURST_PORTAL_HOST and VFURST_PORTAL_SESSION_COOKIE are required");
  }

  return {
    cookieHeader: staffCookie
  };
}

export function registrationFlow() {
  const page = http.get(`${baseUrl}/register`, {
    headers: { Host: portalHost },
    tags: { flow: "registration", name: "portal registration" }
  });
  registrationDuration.add(page.timings.duration);

  check(page, {
    "registration page returned 200": (result) => result.status === 200,
    "registration page rendered form": (result) => bodyIncludes(result, "Registration")
  });

  const attendees = http.get(`${baseUrl}/api/portal/attendees?eventId=${eventId}`, {
    headers: { Host: portalHost, Cookie: portalSessionCookie },
    tags: { flow: "registration", name: "portal attendees" }
  });
  registrationDuration.add(attendees.timings.duration);

  check(attendees, {
    "portal attendees returned 200": (result) => result.status === 200,
    "portal attendees resolved the account": (result) => Boolean(portalAccountEmail(result)),
    "portal attendees listed the account": (result) => {
      try {
        const listed = result.json("attendees");
        return Array.isArray(listed) && listed.length >= 1;
      } catch {
        return false;
      }
    }
  });

  sleep(1);
}

export function checkInFlow(data) {
  const response = http.get(`${baseUrl}/dashboard/events/${eventId}/check-in`, {
    headers: headers(data.cookieHeader ? { Cookie: data.cookieHeader } : {}),
    tags: { flow: "check-in", name: "staff check-in" }
  });
  checkInDuration.add(response.timings.duration);

  check(response, {
    "check-in page returned 200": (result) => result.status === 200,
    "check-in page rendered staff flow": (result) => bodyIncludes(result, "Staff check-in")
  });

  sleep(1);
}
