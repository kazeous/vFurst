import { getOpenApiSpec } from "@/lib/api/openapi";

export default function ApiDocsPage() {
  const spec = getOpenApiSpec();

  return (
    <main className="vf-docs-shell">
      <header className="vf-docs-hero">
        <p className="vf-label">API reference</p>
        <h1>{spec.info.title}</h1>
        <p>{spec.info.description}</p>
      </header>
      <section className="vf-section">
        <h2>Authentication</h2>
        <p>
          Send an organization API key as a Bearer token. Keys are scoped and rate limited to 100 requests per minute by default. The raw key is shown only once; store it in a secret manager.
        </p>
        <pre className="vf-code-block">Authorization: Bearer vf_test_...</pre>
      </section>
      <section className="vf-section">
        <h2>Endpoints</h2>
        <div className="vf-list">
          {Object.entries(spec.paths).map(([path, value]) => (
            <div key={path} className="vf-list-row">
              <span>
                <strong>GET {path}</strong>
                <small>{value.get.summary}</small>
              </span>
              <code>{value.get.tags[0]}</code>
            </div>
          ))}
        </div>
      </section>
      <section className="vf-section">
        <h2>OpenAPI</h2>
        <p>The live JSON document is generated from the app route configuration.</p>
        <a href="/api/v1/openapi.json">/api/v1/openapi.json</a>
      </section>
    </main>
  );
}
