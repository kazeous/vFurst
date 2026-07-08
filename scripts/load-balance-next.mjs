import http from "node:http";
import process from "node:process";

const [host, port, ...targetValues] = process.argv.slice(2);
const targets = targetValues.map((value) => new URL(value));

if (!host || !port || targets.length === 0) {
  console.error("Usage: node scripts/load-balance-next.mjs <host> <port> <target-url>...");
  process.exit(1);
}

let nextTarget = 0;

function pickTarget() {
  const target = targets[nextTarget % targets.length];
  nextTarget += 1;
  return target;
}

const server = http.createServer((request, response) => {
  const target = pickTarget();
  const proxyRequest = http.request(
    {
      protocol: target.protocol,
      hostname: target.hostname,
      port: target.port,
      method: request.method,
      path: request.url,
      headers: {
        ...request.headers,
        host: target.host
      }
    },
    (proxyResponse) => {
      response.writeHead(proxyResponse.statusCode ?? 502, proxyResponse.headers);
      proxyResponse.pipe(response);
    }
  );

  proxyRequest.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(502, { "content-type": "text/plain; charset=utf-8" });
    }

    response.end(`Bad gateway: ${error.message}`);
  });

  request.pipe(proxyRequest);
});

server.listen(Number(port), host, () => {
  console.log(`Load proxy listening on ${host}:${port} for ${targets.length} target(s).`);
});
