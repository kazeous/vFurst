import { createServer } from "node:http";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const docsDir = path.join(root, "docs");
const outDir = path.join(root, "dist");
const args = new Set(process.argv.slice(2));

const pages = [
  { file: "intro.md", route: "", label: "Getting Started" },
  { file: "api.md", route: "api", label: "REST API" },
  { file: "webhooks.md", route: "webhooks", label: "Webhooks" },
  { file: "onboarding.md", route: "onboarding", label: "Onboarding" }
];

const style = `
:root {
  color-scheme: light;
  --background: #f8fafc;
  --surface: #ffffff;
  --text: #111827;
  --muted: #4b5563;
  --line: #d8dee8;
  --primary: #1d4ed8;
  --primary-dark: #1e3a8a;
  --accent: #0f766e;
  --code-bg: #111827;
  --code-text: #e5e7eb;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  background: var(--background);
  color: var(--text);
  font-family:
    Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI",
    sans-serif;
  line-height: 1.65;
}

a {
  color: var(--primary);
}

.shell {
  display: grid;
  grid-template-columns: minmax(220px, 280px) minmax(0, 1fr);
  min-height: 100vh;
}

.sidebar {
  border-right: 1px solid var(--line);
  background: var(--surface);
  padding: 32px 24px;
  position: sticky;
  top: 0;
  height: 100vh;
}

.brand {
  display: block;
  color: var(--text);
  font-size: 1.125rem;
  font-weight: 800;
  margin-bottom: 4px;
  text-decoration: none;
}

.tagline {
  color: var(--muted);
  font-size: 0.875rem;
  margin: 0 0 28px;
}

.nav {
  display: grid;
  gap: 4px;
}

.nav a {
  border-radius: 8px;
  color: var(--muted);
  padding: 8px 10px;
  text-decoration: none;
}

.nav a:hover,
.nav a[aria-current="page"] {
  background: #eff6ff;
  color: var(--primary-dark);
}

.content {
  max-width: 900px;
  padding: 48px clamp(24px, 6vw, 80px);
}

.content h1 {
  font-size: clamp(2rem, 4vw, 3.5rem);
  letter-spacing: 0;
  line-height: 1;
  margin: 0 0 24px;
}

.content h2 {
  border-top: 1px solid var(--line);
  font-size: 1.35rem;
  letter-spacing: 0;
  margin: 36px 0 12px;
  padding-top: 28px;
}

.content p,
.content li {
  color: var(--muted);
}

.content code {
  background: #e0f2fe;
  border-radius: 4px;
  color: #0f172a;
  font-size: 0.925em;
  padding: 0.12rem 0.3rem;
}

.content pre {
  background: var(--code-bg);
  border-radius: 8px;
  color: var(--code-text);
  overflow-x: auto;
  padding: 18px;
}

.content pre code {
  background: transparent;
  color: inherit;
  padding: 0;
}

.content ul,
.content ol {
  padding-left: 1.4rem;
}

.pill {
  color: var(--accent);
  font-size: 0.75rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
  text-transform: uppercase;
}

@media (max-width: 760px) {
  .shell {
    grid-template-columns: 1fr;
  }

  .sidebar {
    height: auto;
    position: static;
  }

  .content {
    padding-top: 32px;
  }
}
`;

async function build() {
  const renderedPages = await Promise.all(pages.map(loadPage));

  await rm(outDir, { recursive: true, force: true });
  await mkdir(path.join(outDir, "assets"), { recursive: true });
  await writeFile(path.join(outDir, "assets", "styles.css"), style.trim() + "\n");

  await Promise.all(
    renderedPages.map(async (page) => {
      const targetDir = page.route ? path.join(outDir, page.route) : outDir;
      await mkdir(targetDir, { recursive: true });
      await writeFile(path.join(targetDir, "index.html"), renderLayout(page, renderedPages));
    })
  );

  await writeFile(path.join(outDir, "404.html"), renderLayout(renderedPages[0], renderedPages));
  console.log(`Built docs to ${path.relative(process.cwd(), outDir)}`);
}

async function loadPage(page) {
  const raw = await readFile(path.join(docsDir, page.file), "utf8");
  const { meta, body } = parseFrontMatter(raw);

  return {
    ...page,
    title: meta.title ?? page.label,
    body: renderMarkdown(body)
  };
}

function parseFrontMatter(raw) {
  if (!raw.startsWith("---")) {
    return { meta: {}, body: raw };
  }

  const end = raw.indexOf("\n---", 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }

  const meta = {};
  const frontMatter = raw.slice(3, end).trim();
  for (const line of frontMatter.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (match) {
      meta[match[1]] = match[2].trim();
    }
  }

  return { meta, body: raw.slice(end + 4).trim() };
}

function renderLayout(page, allPages) {
  const nav = allPages
    .map((item) => {
      const href = item.route ? `/${item.route}/` : "/";
      const current = item.route === page.route ? ' aria-current="page"' : "";
      return `<a href="${href}"${current}>${escapeHtml(item.label)}</a>`;
    })
    .join("\n");

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(page.title)} | vFurst Docs</title>
    <meta name="description" content="Convention API and integration docs for vFurst.">
    <link rel="stylesheet" href="/assets/styles.css">
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <a class="brand" href="/">vFurst Docs</a>
        <p class="tagline">Convention API and integration docs.</p>
        <nav class="nav" aria-label="Documentation">
${nav}
        </nav>
      </aside>
      <main class="content">
        <div class="pill">Documentation</div>
${page.body}
      </main>
    </div>
  </body>
</html>
`;
}

function renderMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const blocks = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const code = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        `<pre><code${language ? ` class="language-${escapeAttribute(language)}"` : ""}>${escapeHtml(
          code.join("\n")
        )}</code></pre>`
      );
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
      index += 1;
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\d+\.\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(`<li>${renderInline(item[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ol>\n${items.join("\n")}\n</ol>`);
      continue;
    }

    const unordered = line.match(/^-\s+(.+)$/);
    if (unordered) {
      const items = [];
      while (index < lines.length) {
        const item = lines[index].match(/^-\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(`<li>${renderInline(item[1])}</li>`);
        index += 1;
      }
      blocks.push(`<ul>\n${items.join("\n")}\n</ul>`);
      continue;
    }

    const paragraph = [line.trim()];
    index += 1;
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push(`<p>${renderInline(paragraph.join(" "))}</p>`);
  }

  return blocks.join("\n");
}

function isBlockStart(line) {
  return /^(#{1,3})\s+/.test(line) || /^(```)/.test(line) || /^\d+\.\s+/.test(line) || /^-\s+/.test(line);
}

function renderInline(value) {
  const escaped = escapeHtml(value);
  return escaped
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label, href) => {
      return `<a href="${escapeAttribute(href)}">${label}</a>`;
    });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

async function serve() {
  await build();

  if (args.has("--watch")) {
    let timer;
    watch(docsDir, { recursive: true }, () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        build().catch((error) => {
          console.error(error);
        });
      }, 100);
    });
  }

  const port = Number(process.env.PORT ?? 3001);
  const server = createServer(async (request, response) => {
    try {
      const target = await resolveRequestPath(request.url ?? "/");
      const body = await readFile(target);
      response.writeHead(200, { "content-type": contentType(target) });
      response.end(body);
    } catch (error) {
      response.writeHead(error.code === "ENOENT" ? 404 : 500, {
        "content-type": "text/html; charset=utf-8"
      });
      response.end(await readFile(path.join(outDir, "404.html"), "utf8"));
    }
  });

  server.listen(port, () => {
    console.log(`vFurst docs listening on http://127.0.0.1:${port}`);
  });
}

async function resolveRequestPath(url) {
  const pathname = decodeURIComponent(new URL(url, "http://localhost").pathname);
  const normalized = path.normalize(pathname).replace(/^([/\\])+/, "");
  const candidate = path.join(outDir, normalized);

  if (!candidate.startsWith(outDir)) {
    return path.join(outDir, "404.html");
  }

  const details = await stat(candidate).catch(() => null);
  if (details?.isDirectory()) {
    return path.join(candidate, "index.html");
  }

  if (details?.isFile()) {
    return candidate;
  }

  return path.join(candidate, "index.html");
}

function contentType(filePath) {
  switch (path.extname(filePath)) {
    case ".css":
      return "text/css; charset=utf-8";
    case ".html":
      return "text/html; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

if (args.has("--serve")) {
  serve().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
} else {
  build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
