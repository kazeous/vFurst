import assert from "node:assert/strict";
import console from "node:console";
import { createRequire } from "node:module";
import path from "node:path";
import process from "node:process";
import { build } from "esbuild";
import { chromium } from "@playwright/test";

/* global window, history, location */

const require = createRequire(import.meta.url);
const sdkClientEntry = path.join(path.dirname(require.resolve("@sentry/nextjs/package.json")), "build/esm/index.client.js");

// Exercise the production entry point, with the installed SDK. Only sampling,
// compression and the final network transport change; no app/telemetry server.
const bundle = await build({
  stdin: {
    contents: `import * as instrumentation from './apps/web/src/instrumentation-client.ts';
      import * as Sentry from '@sentry/nextjs';
      window.telemetryTest = { instrumentation, Sentry: {
        getReplay: Sentry.getReplay, getClient: Sentry.getClient,
        captureException: Sentry.captureException, captureMessage: Sentry.captureMessage,
        startInactiveSpan: Sentry.startInactiveSpan, flush: Sentry.flush
      } };`,
    resolveDir: process.cwd()
  },
  bundle: true,
  write: false,
  platform: "browser",
  conditions: ["browser"],
  format: "iife",
  define: {
    "process.env": "{}",
    "process.env.NODE_ENV": '"production"',
    "process.env.NEXT_RUNTIME": '"browser"',
    "process.env.NEXT_PUBLIC_SENTRY_DSN": '"https://public@example.invalid/1"',
    "process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE": '"1"',
    "process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE": '"1"',
    "process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE": '"1"'
  },
  banner: { js: "window.telemetryEnvelopes = [];" },
  plugins: [{
    name: "isolated-sentry-transport",
    setup(plugin) {
      plugin.onResolve({ filter: /^@sentry\/nextjs$/ }, (args) => {
        if (args.namespace === "telemetry-test") {
          return { path: sdkClientEntry };
        }
        return { path: args.path, namespace: "telemetry-test" };
      });
      plugin.onLoad({ filter: /.*/, namespace: "telemetry-test" }, () => ({
        contents: `import * as actual from '@sentry/nextjs';
          export * from '@sentry/nextjs';
          export const makeFetchTransport = () => ({
            send(envelope) { window.telemetryEnvelopes.push(envelope); return Promise.resolve({ statusCode: 200 }); },
            flush() { return Promise.resolve(true); }
          });
          export const replayIntegration = options => actual.replayIntegration({ ...options, useCompression: false });
          export const init = options => actual.init({ ...options, transport: options.transport ?? makeFetchTransport });`,
        resolveDir: process.cwd(), loader: "js"
      }));
    }
  }]
});

const marker = "TELEMETRY_FAKE_TOKEN_ONLY";
const browser = await chromium.launch({ headless: true });
const results = [];
try {
  const cases = [
    { name: "non-token control", path: "/login" },
    { name: "non-token navigation control", path: "/account", safeNavigation: true },
    ...["/set-password", "/test-org/set-password"].flatMap((path) => [
      { name: `direct ${path}`, path, mode: "direct" },
      { name: `router ${path}`, path, mode: "router" },
      { name: `pushState ${path}`, path, mode: "pushState" },
      { name: `replaceState ${path}`, path, mode: "replaceState" },
      { name: `popstate ${path}`, path, mode: "popstate" }
    ])
  ];
  await Promise.all(cases.map(async ({ name, path, mode, safeNavigation }) => {
    const context = await browser.newContext({ serviceWorkers: "block" });
    try {
      const page = await context.newPage();
      await page.route("**/*", (route) => {
        if (route.request().resourceType() !== "document") return route.abort();
        return route.fulfill({
          status: 200, contentType: "text/html", headers: { "Referrer-Policy": "no-referrer" },
          body: '<html><head><meta name="referrer" content="no-referrer"></head><body><p>Telemetry boundary fixture</p><input type="password"></body></html>'
        });
      });
      const target = `${path}?token=${marker}&returnTo=%2F`;
      await page.goto(`https://portal.example.invalid${mode === "direct" ? target : "/login"}`);
      // A pre-existing history entry lets a real back traversal enter the token
      // page without calling the now-guarded history methods after SDK init.
      if (mode === "popstate") await page.evaluate((url) => {
        history.replaceState({}, "", url);
        history.pushState({}, "", "/login");
      }, target);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      if (safeNavigation) {
        await page.waitForFunction(() => Boolean(window.telemetryTest.Sentry.getReplay()?.getReplayId()));
        const state = await page.evaluate(() => {
          window.telemetryTest.instrumentation.onRouterTransitionStart("/account?view=history", "push");
          history.pushState({ compatibility: "push" }, "", "/account?view=history");
          const pushed = { state: history.state, url: location.href };
          history.replaceState({ compatibility: "replace" }, "", "/account?view=replaced");
          return { pushed, replaced: { state: history.state, url: location.href } };
        });
        assert.deepEqual(state, {
          pushed: { state: { compatibility: "push" }, url: "https://portal.example.invalid/account?view=history" },
          replaced: { state: { compatibility: "replace" }, url: "https://portal.example.invalid/account?view=replaced" }
        }, "non-token history methods must preserve URL/state and normal delegation");
      }
      if (mode && mode !== "direct") {
        await page.waitForFunction(() => Boolean(window.telemetryTest.Sentry.getReplay()?.getReplayId()));
        // Replay is already recording when the route changes.
        const stoppedBeforeHistory = await page.evaluate(({ url, navigation }) => {
          if (navigation === "router") {
            window.telemetryTest.instrumentation.onRouterTransitionStart(url, "push");
            const stopped = !window.telemetryTest.Sentry.getReplay()?.getReplayId()
              && !window.telemetryTest.Sentry.getClient()?.getOptions().enabled;
            history.pushState({}, "", url);
            return stopped;
          } else if (navigation === "popstate") {
            history.back();
          } else {
            history[navigation]({}, "", url);
          }
        }, { url: target, navigation: mode });
        if (mode === "router") assert.equal(stoppedBeforeHistory, true, `${name}: hook must exclude before URL changes`);
        await page.waitForURL(`**${target}`);
      }
      // SDK's minimum Replay duration is 5s. Waiting beyond it is necessary to
      // distinguish a real exclusion from an empty premature flush.
      await page.waitForTimeout(5300);
      const result = await page.evaluate(async ({ token, navigation }) => {
        const { Sentry } = window.telemetryTest;
        if (Sentry.getClient()) {
          Sentry.captureException(new Error(`fake token page error at ${location.href}`));
          Sentry.startInactiveSpan({ name: location.href, forceTransaction: true }).end();
          if (Sentry.getReplay()?.getReplayId()) await Sentry.getReplay().flush();
          await Sentry.flush(2000);
        }
        if (navigation && navigation !== "direct") {
          history.replaceState({}, "", "/login");
          // Prove a deferred payload cannot escape after return-away.
          Sentry.captureMessage(`deferred fake token: ${token}`);
          if (Sentry.getReplay()?.getReplayId()) await Sentry.getReplay().flush();
          await Sentry.flush(2000);
        }
        const items = window.telemetryEnvelopes.flatMap((envelope) => envelope[1]);
        return {
          envelopes: window.telemetryEnvelopes.length,
          replayEvents: items.filter(([header]) => header.type === "replay_event").length,
          replayUrls: items.filter(([header]) => header.type === "replay_event").map(([, event]) => event.urls),
          tokenPresentInEnvelope: JSON.stringify(window.telemetryEnvelopes).includes(token),
          replayRunning: Boolean(Sentry.getReplay()?.getReplayId())
        };
      }, { token: marker, navigation: mode });
      results.push({ name, ...result });
    } finally {
      await context.close();
    }
  }));
} finally {
  await browser.close();
}
results.sort((left, right) => left.name.localeCompare(right.name));
console.log(JSON.stringify(results, null, 2));
const controls = results.filter((result) => result.name.startsWith("non-token"));
for (const control of controls) {
  assert.ok(control.replayEvents > 0, `${control.name}: positive control must actually emit Replay`);
  assert.equal(control.replayRunning, true, `${control.name}: Replay must stay enabled`);
}
for (const result of results.filter((entry) => !controls.includes(entry))) {
  assert.equal(result.tokenPresentInEnvelope, false, `${result.name}: raw token reached transport`);
  assert.equal(result.replayRunning, false, `${result.name}: Replay still recording`);
}
console.log(`PASS: ${results.length} production-instrumentation SDK/Chromium scenarios`);
