import http from "node:http";

const mode = process.env.WEB_CLUSTER_FIXTURE_MODE ?? "serve";
if (mode === "crash") process.exit(3);

const server = http.createServer((request, response) => {
  const answer = () => {
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ pid: process.pid }));
  };
  if (request.url === "/slow") setTimeout(answer, 1_000);
  else answer();
});

process.on("SIGTERM", () => {
  if (mode === "ignore-sigterm") return;
  console.log("fixture SIGTERM");
  server.close(() => process.exit(0));
});
server.listen(Number(process.env.PORT), process.env.HOSTNAME ?? "127.0.0.1", () => {
  console.log(`fixture listening ${process.pid}`);
});
