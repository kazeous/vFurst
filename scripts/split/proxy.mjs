import { Buffer } from "node:buffer";
import http from "node:http";
import net from "node:net";
import { splitTargetForHost } from "./host-routing.mjs";

function rejectUnknownHost(response, hostHeader) {
  response.writeHead(421, {
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8"
  });
  response.end(
    JSON.stringify({
      error: "unrecognized_host",
      message: `The local split proxy has no route for ${hostHeader || "an empty Host header"}.`
    })
  );
}

function rejectUnknownUpgrade(socket, hostHeader) {
  const message = `The local split proxy has no route for ${hostHeader || "an empty Host header"}.`;
  const body = JSON.stringify({ error: "unrecognized_host", message });
  socket.end(
    [
      "HTTP/1.1 421 Misdirected Request",
      "Connection: close",
      "Content-Type: application/json; charset=utf-8",
      `Content-Length: ${Buffer.byteLength(body)}`,
      "",
      body
    ].join("\r\n")
  );
}

function forwardedHeaders(request, runtime) {
  const hostHeader = request.headers.host ?? "";

  return {
    ...request.headers,
    host: hostHeader,
    "x-forwarded-host": hostHeader,
    "x-forwarded-proto": "http",
    "x-vfurst-local-runtime": runtime
  };
}

export function createSplitProxy(config) {
  const sockets = new Set();
  const server = http.createServer((request, response) => {
    const target = splitTargetForHost(request.headers.host, config);

    if (!target) {
      rejectUnknownHost(response, request.headers.host);
      return;
    }

    const proxyRequest = http.request(
      {
        hostname: target.hostname,
        port: target.port,
        method: request.method,
        path: request.url,
        headers: forwardedHeaders(request, target.runtime)
      },
      (proxyResponse) => {
        response.writeHead(proxyResponse.statusCode ?? 502, {
          ...proxyResponse.headers,
          "x-vfurst-local-runtime": target.runtime
        });
        proxyResponse.pipe(response);
      }
    );

    proxyRequest.on("error", (error) => {
      if (!response.headersSent) {
        response.writeHead(502, {
          "cache-control": "no-store",
          "content-type": "application/json; charset=utf-8"
        });
      }

      response.end(JSON.stringify({ error: "upstream_unavailable", message: error.message }));
    });

    request.pipe(proxyRequest);
  });

  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  server.on("upgrade", (request, socket, head) => {
    const target = splitTargetForHost(request.headers.host, config);

    if (!target) {
      rejectUnknownUpgrade(socket, request.headers.host);
      return;
    }

    const upstream = net.connect(target.port, target.hostname);

    upstream.once("connect", () => {
      const headers = forwardedHeaders(request, target.runtime);
      const headerLines = Object.entries(headers).flatMap(([name, value]) => {
        if (value == null) {
          return [];
        }

        return Array.isArray(value) ? value.map((entry) => `${name}: ${entry}`) : [`${name}: ${value}`];
      });
      upstream.write([`${request.method} ${request.url} HTTP/${request.httpVersion}`, ...headerLines, "", ""].join("\r\n"));

      if (head.length > 0) {
        upstream.write(head);
      }

      socket.pipe(upstream).pipe(socket);
    });

    upstream.on("error", () => {
      if (!socket.destroyed) {
        socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
      }
    });
    socket.on("error", () => upstream.destroy());
  });

  server.closeSplitConnections = () => {
    for (const socket of sockets) {
      socket.destroy();
    }
  };

  return server;
}

export function listenForSplitTraffic(config) {
  const server = createSplitProxy(config);

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.proxyPort, config.bindHost, () => {
      server.off("error", reject);
      resolve(server);
    });
  });
}
