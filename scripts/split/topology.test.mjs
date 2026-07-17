import assert from "node:assert/strict";
import http from "node:http";
import { after, before, describe, it } from "node:test";
import { classifySplitHostname, readSplitHostConfig } from "./host-routing.mjs";
import { createSplitProxy } from "./proxy.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function request(port, hostHeader) {
  return new Promise((resolve, reject) => {
    const outgoing = http.get(
      {
        hostname: "127.0.0.1",
        port,
        path: "/probe?source=test",
        headers: { host: hostHeader }
      },
      (response) => {
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => resolve({ body, headers: response.headers, status: response.statusCode }));
      }
    );
    outgoing.on("error", reject);
  });
}

describe("local split topology", () => {
  const manager = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ runtime: "platform-manager", host: request.headers.host, url: request.url }));
  });
  const tenant = http.createServer((request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ runtime: "tenant-web", host: request.headers.host, url: request.url }));
  });
  let proxy;
  let proxyPort;
  let config;

  before(async () => {
    const managerPort = await listen(manager);
    const tenantPort = await listen(tenant);
    config = {
      ...readSplitHostConfig({
        NEXT_PUBLIC_ROOT_DOMAIN: "vfurst.example",
        VFURST_SPLIT_MANAGER_HOSTS: "localhost,vfurst.example,app.vfurst.example,manager.vfurst.example",
        VFURST_SPLIT_TENANT_HOSTS: "console.vfurst.example",
        VFURST_SPLIT_MANAGED_ROOT_DOMAINS: "vfurst.example",
        VFURST_SPLIT_CUSTOM_TENANT_HOSTS: "events.customer.example"
      }),
      managerPort,
      tenantPort,
      proxyPort: 0
    };
    proxy = createSplitProxy(config);
    proxyPort = await listen(proxy);
  });

  after(async () => {
    await Promise.all([close(proxy), close(manager), close(tenant)]);
  });

  it("classifies root, console, managed subdomain, and allowlisted custom hosts", () => {
    assert.equal(classifySplitHostname("vfurst.example:3100", config), "platform-manager");
    assert.equal(classifySplitHostname("manager.vfurst.example:3100", config), "platform-manager");
    assert.equal(classifySplitHostname("console.vfurst.example:3100", config), "tenant-web");
    assert.equal(classifySplitHostname("sample-con.vfurst.example:3100", config), "tenant-web");
    assert.equal(classifySplitHostname("events.customer.example:3100", config), "tenant-web");
    assert.equal(classifySplitHostname("attacker.example:3100", config), null);
  });

  it("preserves the original Host header for manager traffic", async () => {
    const response = await request(proxyPort, "vfurst.example:3100");
    const body = JSON.parse(response.body);

    assert.equal(response.status, 200);
    assert.equal(response.headers["x-vfurst-local-runtime"], "platform-manager");
    assert.equal(body.runtime, "platform-manager");
    assert.equal(body.host, "vfurst.example:3100");
    assert.equal(body.url, "/probe?source=test");
  });

  it("preserves managed and custom tenant hosts", async () => {
    for (const host of ["sample-con.vfurst.example:3100", "events.customer.example:3100"]) {
      const response = await request(proxyPort, host);
      const body = JSON.parse(response.body);

      assert.equal(response.status, 200);
      assert.equal(body.runtime, "tenant-web");
      assert.equal(body.host, host);
    }
  });

  it("fails closed for unknown hosts", async () => {
    const response = await request(proxyPort, "attacker.example:3100");

    assert.equal(response.status, 421);
    assert.equal(JSON.parse(response.body).error, "unrecognized_host");
  });
});
