export class AiRequestError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message); this.status = status; this.code = code;
  }
}

export function aiErrorResponse(error: AiRequestError, retryAfter?: number) {
  return Response.json({ code: error.code, message: error.message }, { status: error.status, headers: {
    'Cache-Control': 'no-store', ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
  } });
}

/** Enforce the real streamed byte count, not a caller-controlled length header. */
export async function readAiJson(request: Request, maxBytes: number, timeoutMs = 10_000): Promise<unknown> {
  if (!request.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new AiRequestError(415, 'invalid_content_type', 'Send this request as JSON.');
  }
  const tooLarge = () => new AiRequestError(413, 'request_too_large', 'This AI request is too large. Use a smaller image or fewer items.');
  if (Number(request.headers.get('content-length')) > maxBytes) throw tooLarge();
  const reader = request.body?.getReader();
  if (!reader) throw new AiRequestError(400, 'invalid_json', 'The request body is empty.');
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; void reader.cancel().catch(() => {}); }, timeoutMs);
  try {
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { value, done } = await reader.read();
      if (timedOut) throw new AiRequestError(408, 'request_timeout', 'The upload took too long. Please retry.');
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw tooLarge(); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new AiRequestError(400, 'invalid_json', 'The AI request is not valid JSON.'); }
  } finally { clearTimeout(timer); reader.releaseLock(); }
}
