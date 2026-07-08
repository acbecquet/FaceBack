// Global error boundary for every Pages Function under /api. Without it, any
// unhandled exception in a handler surfaces as an opaque Cloudflare 1101/500
// with no detail, which made a production-only crypto failure very hard to
// diagnose. This catches the exception, logs it (visible via `wrangler pages
// deployment tail`), and returns a JSON body carrying the error name and
// message so failures are visible to the caller instead of a blank 500.
export const onRequest = async (context: { next: () => Promise<Response> }): Promise<Response> => {
  try {
    return await context.next();
  } catch (e) {
    const detail = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    console.error("Unhandled function error:", detail);
    return new Response(JSON.stringify({ error: { code: "internal_error", message: detail } }), {
      status: 500,
      headers: { "content-type": "application/json" },
    });
  }
};
