import { describe, expect, it } from "vitest";
import { SENSITIVE_QUERY_KEYS, scrubSensitiveUrl, scrubSentryEventUrls } from "./sentry-url-scrub";

describe("Sentry URL scrubbing", () => {
  it("filters token, code, state, id_token_hint, and logout_token values in absolute and relative URLs", () => {
    expect(SENSITIVE_QUERY_KEYS).toEqual(["token", "code", "state", "id_token_hint", "logout_token"]);
    expect(scrubSensitiveUrl("https://acme.vfurst.reyuugames.com/set-password?token=abc&returnTo=%2F")).toBe(
      "https://acme.vfurst.reyuugames.com/set-password?token=%5BFiltered%5D&returnTo=%2F"
    );
    expect(scrubSensitiveUrl("/api/auth/callback/authentik?code=c1&state=s1")).toBe(
      "/api/auth/callback/authentik?code=%5BFiltered%5D&state=%5BFiltered%5D"
    );
    expect(scrubSensitiveUrl("/endsession?id_token_hint=eyJ.x.y&client_id=vfurst")).toBe(
      "/endsession?id_token_hint=%5BFiltered%5D&client_id=vfurst"
    );
    expect(scrubSensitiveUrl("logout_token=eyJ.a.b")).toBe("logout_token=%5BFiltered%5D");
    expect(scrubSensitiveUrl("?token=abc")).toBe("?token=%5BFiltered%5D");
  });

  it("filters the invitation token path segment", () => {
    expect(scrubSensitiveUrl("/invitations/AbC_123-xyz")).toBe("/invitations/[Filtered]");
    expect(scrubSensitiveUrl("https://vfurst.reyuugames.com/invitations/AbC_123-xyz?error=EXPIRED")).toBe(
      "https://vfurst.reyuugames.com/invitations/[Filtered]?error=EXPIRED"
    );
  });

  it("filters string, tuple, and object query strings", () => {
    expect(scrubSentryEventUrls({ request: { query_string: "token=abc&x=1" } }).request.query_string).toBe(
      "token=%5BFiltered%5D&x=1"
    );
    expect(
      scrubSentryEventUrls({ request: { query_string: [["token", "abc"], ["x", "1"]] } }).request.query_string
    ).toEqual([["token", "[Filtered]"], ["x", "1"]]);
    expect(scrubSentryEventUrls({ request: { query_string: { code: "c1", page: "2" } } }).request.query_string).toEqual({
      code: "[Filtered]",
      page: "2"
    });
  });

  it("filters the request URL, referer headers, and breadcrumb URLs", () => {
    const event = scrubSentryEventUrls({
      request: {
        url: "https://acme.vfurst.reyuugames.com/account/transfers/r1?token=t1",
        headers: { referer: "https://acme.vfurst.reyuugames.com/set-password?token=t2", Referer: "/invitations/inv-1" }
      },
      breadcrumbs: [
        { data: { url: "/checkout/o1?token=t3", from: "/invitations/inv-2", to: "/login?state=s1" } },
        { message: "no data" }
      ]
    });

    expect(event.request.url).toBe("https://acme.vfurst.reyuugames.com/account/transfers/r1?token=%5BFiltered%5D");
    expect(event.request.headers).toEqual({
      referer: "https://acme.vfurst.reyuugames.com/set-password?token=%5BFiltered%5D",
      Referer: "/invitations/[Filtered]"
    });
    expect(event.breadcrumbs[0]?.data).toEqual({
      url: "/checkout/o1?token=%5BFiltered%5D",
      from: "/invitations/[Filtered]",
      to: "/login?state=%5BFiltered%5D"
    });
    expect(event.breadcrumbs[1]).toEqual({ message: "no data" });
  });

  it("filters URL attributes and descriptions in transaction trace and span data", () => {
    const event = scrubSentryEventUrls({
      transaction: "GET /invitations/AbC_123",
      contexts: {
        trace: {
          data: {
            "http.target": "/set-password?token=t1",
            "http.url": "https://acme.vfurst.reyuugames.com/set-password?token=t1",
            "url.query": "?token=t1",
            "http.query": "code=c1&state=s1",
            "http.method": "GET"
          }
        }
      },
      spans: [
        {
          description: "GET /invitations/inv-3",
          data: {
            "url.full": "https://vfurst.reyuugames.com/api/auth/callback/authentik?code=c2&state=s2",
            "db.statement": "select * from tokens where token = $1"
          }
        },
        { description: "middleware GET" }
      ]
    });

    expect(event.transaction).toBe("GET /invitations/[Filtered]");
    expect(event.contexts.trace.data).toEqual({
      "http.target": "/set-password?token=%5BFiltered%5D",
      "http.url": "https://acme.vfurst.reyuugames.com/set-password?token=%5BFiltered%5D",
      "url.query": "?token=%5BFiltered%5D",
      "http.query": "code=%5BFiltered%5D&state=%5BFiltered%5D",
      "http.method": "GET"
    });
    expect(event.spans[0]).toEqual({
      description: "GET /invitations/[Filtered]",
      data: {
        "url.full": "https://vfurst.reyuugames.com/api/auth/callback/authentik?code=%5BFiltered%5D&state=%5BFiltered%5D",
        "db.statement": "select * from tokens where token = $1"
      }
    });
    expect(event.spans[1]).toEqual({ description: "middleware GET" });
  });

  it("leaves URLs without sensitive values unchanged", () => {
    for (const value of [
      "https://vfurst.reyuugames.com/dashboard?tab=events",
      "/register?success=r1&cancelled=1",
      "/invitations",
      "not a url at all"
    ]) {
      expect(scrubSensitiveUrl(value)).toBe(value);
    }
    expect(scrubSentryEventUrls({ message: "plain" })).toEqual({ message: "plain" });
  });
});
