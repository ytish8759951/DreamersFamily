export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (!url.pathname.startsWith('/assets/')) {
    return context.next();
  }

  const response = await context.next();
  const contentType = response.headers.get('content-type') || '';
  if (response.status !== 404 && !contentType.toLowerCase().includes('text/html')) {
    return response;
  }

  const headers = new Headers({
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'X-Dreamers-Asset-Missing': '1'
  });
  if (url.pathname.endsWith('.css')) {
    headers.set('Content-Type', 'text/css; charset=utf-8');
    return new Response('/* DreamersFamily stale stylesheet chunk is no longer available. */\n', {
      status: 404,
      headers
    });
  }
  if (url.pathname.endsWith('.js')) {
    headers.set('Content-Type', 'application/javascript; charset=utf-8');
    return new Response("throw new Error('DreamersFamily stale JavaScript chunk is no longer available. Reload the latest build.');\n", {
      status: 404,
      headers
    });
  }

  headers.set('Content-Type', 'text/plain; charset=utf-8');
  return new Response('DreamersFamily asset is no longer available. Reload the latest build.\n', {
    status: 404,
    headers
  });
}
