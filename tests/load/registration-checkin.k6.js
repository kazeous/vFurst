import http from "k6/http";
import { check, sleep } from "k6";

const baseUrl = __ENV.VFURST_BASE_URL || "http://127.0.0.1:3000";
const orgSlug = __ENV.VFURST_LOAD_ORG_SLUG || "demo";
const eventId = __ENV.VFURST_LOAD_EVENT_ID || "00000000-0000-0000-0000-000000000000";
const staffCookie = __ENV.VFURST_STAFF_COOKIE || "";
const registrationVus = Number(__ENV.VFURST_REGISTRATION_VUS || 1000);
const checkInVus = Number(__ENV.VFURST_CHECKIN_VUS || 500);

export const options = {
  discardResponseBodies: false,
  scenarios: {
    registration: {
      executor: "ramping-vus",
      exec: "registrationFlow",
      startVUs: 0,
      stages: [
        { duration: "2m", target: registrationVus },
        { duration: "5m", target: registrationVus },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s"
    },
    checkIn: {
      executor: "ramping-vus",
      exec: "checkInFlow",
      startVUs: 0,
      stages: [
        { duration: "2m", target: checkInVus },
        { duration: "5m", target: checkInVus },
        { duration: "1m", target: 0 }
      ],
      gracefulRampDown: "30s"
    }
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<1500"]
  }
};

export function registrationFlow() {
  const response = http.get(`${baseUrl}/${orgSlug}/register`, {
    tags: { flow: "registration" }
  });

  check(response, {
    "registration page returned 200": (result) => result.status === 200,
    "registration page rendered form": (result) => result.body.includes("Register")
  });

  sleep(1);
}

export function checkInFlow() {
  const response = http.get(`${baseUrl}/dashboard/events/${eventId}/check-in`, {
    headers: staffCookie ? { Cookie: staffCookie } : {},
    tags: { flow: "check-in" }
  });

  check(response, {
    "check-in page returned 200": (result) => result.status === 200,
    "check-in page rendered staff flow": (result) => result.body.includes("Staff check-in")
  });

  sleep(1);
}
