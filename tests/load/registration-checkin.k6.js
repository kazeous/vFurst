import http from "k6/http";
import { check, sleep } from "k6";

const defaultBaseUrl = __ENV.VFURST_K6_RUNTIME === "docker" ? "http://host.docker.internal:3000" : "http://127.0.0.1:3000";
const baseUrl = __ENV.VFURST_BASE_URL || defaultBaseUrl;
const orgSlug = __ENV.VFURST_LOAD_ORG_SLUG || "demo";
const eventId = __ENV.VFURST_LOAD_EVENT_ID || "00000000-0000-0000-0000-000000000000";
const staffCookie = __ENV.VFURST_STAFF_COOKIE || "";
const staffEmail = __ENV.VFURST_STAFF_EMAIL || "";
const staffPassword = __ENV.VFURST_STAFF_PASSWORD || "";
const hostHeader = __ENV.VFURST_HOST_HEADER || (__ENV.VFURST_K6_RUNTIME === "docker" ? "localhost:3000" : "");
const loadProfile = __ENV.VFURST_LOAD_PROFILE || "full";
const registrationVus = Number(__ENV.VFURST_REGISTRATION_VUS || (loadProfile === "smoke" ? 2 : 500));
const checkInVus = Number(__ENV.VFURST_CHECKIN_VUS || (loadProfile === "smoke" ? 1 : 50));
const durationThreshold = loadProfile === "smoke" ? "p(95)<10000" : "p(95)<1500";

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

function cookieHeaderFromResponse(response) {
  return Object.entries(response.cookies)
    .flatMap(([name, values]) => values.map((cookie) => `${name}=${cookie.value}`))
    .join("; ");
}

function headers(extra = {}) {
  return hostHeader ? { Host: hostHeader, ...extra } : extra;
}

function bodyIncludes(response, text) {
  return typeof response.body === "string" && response.body.includes(text);
}

function loginStaff() {
  if (staffCookie || !staffEmail || !staffPassword) {
    return staffCookie;
  }

  const csrfResponse = http.get(`${baseUrl}/api/auth/csrf`, {
    headers: headers(),
    tags: { flow: "auth" }
  });
  const csrfToken = csrfResponse.json("csrfToken");

  const loginResponse = http.post(
    `${baseUrl}/api/auth/callback/credentials`,
    {
      csrfToken,
      email: staffEmail,
      password: staffPassword,
      callbackUrl: `${baseUrl}/dashboard`,
      json: "true"
    },
    {
      headers: headers(),
      redirects: 0,
      tags: { flow: "auth" }
    }
  );

  check(loginResponse, {
    "staff login returned auth cookie": (result) => cookieHeaderFromResponse(result).includes("authjs.session-token")
  });

  return cookieHeaderFromResponse(loginResponse);
}

export function setup() {
  return {
    cookieHeader: loginStaff()
  };
}

export function registrationFlow() {
  const response = http.get(`${baseUrl}/${orgSlug}/register`, {
    headers: headers(),
    tags: { flow: "registration", name: "public registration" }
  });

  check(response, {
    "registration page returned 200": (result) => result.status === 200,
    "registration page rendered form": (result) => bodyIncludes(result, "Registration")
  });

  sleep(1);
}

export function checkInFlow(data) {
  const response = http.get(`${baseUrl}/dashboard/events/${eventId}/check-in`, {
    headers: headers(data.cookieHeader ? { Cookie: data.cookieHeader } : {}),
    tags: { flow: "check-in", name: "staff check-in" }
  });

  check(response, {
    "check-in page returned 200": (result) => result.status === 200,
    "check-in page rendered staff flow": (result) => bodyIncludes(result, "Staff check-in")
  });

  sleep(1);
}
