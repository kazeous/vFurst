import { afterEach, describe, expect, it, vi } from "vitest";
import { isPlatformHostname } from "./platform-hosts";

function useLocalHostPolicy() {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "localhost");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("AUTH_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_MANAGER_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_CONSOLE_URL", "http://localhost:3000");
  vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3000/api");
}

afterEach(() => vi.unstubAllEnvs());

describe("isPlatformHostname", () => {
  it.each([
    "vfurst.reyuugames.com",
    "www.vfurst.reyuugames.com",
    "console.vfurst.reyuugames.com",
    "manager.vfurst.reyuugames.com",
    "app.vfurst.reyuugames.com",
    "api.vfurst.reyuugames.com"
  ])("recognizes the canonical platform host %s while local policy is active", (hostname) => {
    useLocalHostPolicy();
    expect(isPlatformHostname(hostname)).toBe(true);
  });

  it.each(["localhost", "www.localhost", "console.localhost", "manager.localhost", "app.localhost", "api.localhost"])(
    "recognizes the configured platform host %s",
    (hostname) => {
      useLocalHostPolicy();
      expect(isPlatformHostname(hostname)).toBe(true);
    }
  );

  it("keeps genuine tenant subdomains out of the platform surface", () => {
    useLocalHostPolicy();
    expect(isPlatformHostname("sample-con.localhost")).toBe(false);
    expect(isPlatformHostname("sample-con.vfurst.reyuugames.com")).toBe(false);
  });

  it.each(["::1", "0.0.0.0", "10.0.0.8", "172.16.4.20", "172.31.255.254", "192.168.1.20"])(
    "recognizes the development host %s outside production",
    (hostname) => {
      vi.stubEnv("NODE_ENV", "development");
      expect(isPlatformHostname(hostname)).toBe(true);
    }
  );

  it("recognizes the current machine hostname outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("COMPUTERNAME", "VFURST-DEVBOX");
    expect(isPlatformHostname("vfurst-devbox")).toBe(true);
  });

  it.each(["10.0.0.8", "172.20.1.2", "192.168.1.20", "vfurst-devbox"])(
    "does not classify development alias %s as a platform host in production",
    (hostname) => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("COMPUTERNAME", "VFURST-DEVBOX");
      expect(isPlatformHostname(hostname)).toBe(false);
    }
  );
});
