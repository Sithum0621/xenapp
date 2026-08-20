/**
 * Browser CORS allowlist for Edge Functions.
 * Native apps typically send no Origin (CORS does not apply).
 * Unknown browser origins get no Access-Control-Allow-Origin (request is blocked).
 */
const EXTRA_ORIGINS =
  Deno.env.get('CORS_ALLOWED_ORIGINS')?.split(',').map((s) => s.trim()).filter(Boolean) ?? [];

const EXACT_ORIGINS = new Set([
  'https://mytuition.wovello.com',
  'https://www.mytuition.wovello.com',
  ...EXTRA_ORIGINS,
]);

function isAllowedOrigin(origin: string): boolean {
  if (EXACT_ORIGINS.has(origin)) return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  if (host === 'localhost' || host === '127.0.0.1') {
    return url.protocol === 'http:' || url.protocol === 'https:';
  }
  if (url.protocol !== 'https:') return false;
  return host === 'wovello.com' || host.endsWith('.wovello.com');
}

const BASE_ALLOW_HEADERS = 'authorization, x-client-info, apikey, content-type';

export function corsHeadersFor(req: Request, extraAllowHeaders: string[] = []): Headers {
  const origin = req.headers.get('Origin')?.trim() ?? '';
  const headers = new Headers();
  const allowHeaders = extraAllowHeaders.length
    ? `${BASE_ALLOW_HEADERS}, ${extraAllowHeaders.join(', ')}`
    : BASE_ALLOW_HEADERS;
  headers.set('Access-Control-Allow-Headers', allowHeaders);
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  headers.set('Access-Control-Max-Age', '86400');
  if (origin && isAllowedOrigin(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Vary', 'Origin');
  }
  return headers;
}

export function jsonResponse(
  req: Request,
  body: Record<string, unknown>,
  status = 200,
  extraAllowHeaders: string[] = [],
): Response {
  const headers = corsHeadersFor(req, extraAllowHeaders);
  headers.set('Content-Type', 'application/json');
  return new Response(JSON.stringify(body), { status, headers });
}

export function optionsResponse(req: Request, extraAllowHeaders: string[] = []): Response {
  return new Response(null, { status: 204, headers: corsHeadersFor(req, extraAllowHeaders) });
}
