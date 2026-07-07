export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function errorResponse(code: string, message: string, status: number): Response {
  return json({ error: { code, message } }, status);
}
