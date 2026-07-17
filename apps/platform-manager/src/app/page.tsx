import { AUTH_COOKIE_NAMES } from "@vfurst/auth/core";
import { AUTHORIZATION_CODE_AUDIENCES } from "@vfurst/contracts";

export default function PlatformManagerShellPage() {
  const sharedBoundaryReady =
    AUTH_COOKIE_NAMES.managerSession.startsWith("__Host-") &&
    AUTHORIZATION_CODE_AUDIENCES.includes("platform-manager");

  return (
    <main>
      <section className="shell-card" aria-labelledby="platform-manager-title">
        <p className="eyebrow">Control-plane runtime</p>
        <h1 id="platform-manager-title">Platform Manager shell</h1>
        <p>
          This independently deployable Next.js application will own central identity, public accounts, and vFurst
          platform administration after route-family cutover.
        </p>
        <div className="notice" role="status">
          <strong>No tenant operations are served here.</strong>
          <p>
            This is a non-cutover runtime shell. Existing writable routes remain in <code>apps/web</code> until their
            complete authorization and compatibility gates pass.
          </p>
        </div>
        <p>Shared identity boundary: {sharedBoundaryReady ? "ready" : "unavailable"}</p>
      </section>
    </main>
  );
}
