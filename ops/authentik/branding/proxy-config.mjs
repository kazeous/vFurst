// Public browser documents get a branded 5xx page. API, static assets and
// non-HTML clients retain the original upstream responses and status codes.
export const routerRule = 'Host(`account.reyuugames.com`) && HeaderRegexp(`Accept`, `(?i)text/html`) && !PathPrefix(`/api/`) && !PathPrefix(`/static/`)';
export const errorPath = '/static/dist/assets/reyuugames/unavailable.html';

export const proxyLabels = {
  'traefik.http.routers.reyuu-account-html.rule': routerRule,
  'traefik.http.routers.reyuu-account-html.entrypoints': 'https',
  'traefik.http.routers.reyuu-account-html.priority': '200',
  'traefik.http.routers.reyuu-account-html.service': 'reyuu-account-html',
  'traefik.http.routers.reyuu-account-html.tls': 'true',
  'traefik.http.routers.reyuu-account-html.tls.certresolver': 'letsencrypt',
  'traefik.http.routers.reyuu-account-html.middlewares': 'reyuu-account-html-headers,reyuu-account-html-errors,gzip',
  'traefik.http.services.reyuu-account-html.loadbalancer.server.port': '9000',
  'traefik.http.middlewares.reyuu-account-html-errors.errors.status': '500-599',
  'traefik.http.middlewares.reyuu-account-html-errors.errors.service': 'reyuu-account-html',
  'traefik.http.middlewares.reyuu-account-html-errors.errors.query': errorPath,
  'traefik.http.middlewares.reyuu-account-html-headers.headers.customresponseheaders.Cache-Control': 'no-store',
  'traefik.http.middlewares.reyuu-account-html-headers.headers.customresponseheaders.X-Powered-By': '',
};

export function testProxyConfig(backend) {
  return { http: {
    routers: {
      branded: { rule: routerRule, priority: 200, service: 'backend',
        middlewares: ['headers', 'errors', 'gzip'] },
      original: { rule: 'Host(`account.reyuugames.com`)', priority: 1, service: 'backend' },
    },
    services: { backend: { loadBalancer: { servers: [{ url: backend }] } } },
    middlewares: {
      gzip: { compress: {} },
      headers: { headers: { customResponseHeaders: { 'Cache-Control': 'no-store', 'X-Powered-By': '' } } },
      errors: { errors: { status: ['500-599'], service: 'backend', query: errorPath } },
    },
  } };
}
