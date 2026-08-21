import { type NextRequest } from "next/server";
import http from "node:http";

const INTERNAL_API_HOST = process.env.INTERNAL_API_HOST ?? "api";
const INTERNAL_API_PORT = parseInt(process.env.INTERNAL_API_PORT ?? "8000", 10);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// NOTE: This route handler is a fallback for non-prod environments (localhost dev).
// In production K8s the browser calls the API NodePort (30800) directly to avoid
// Next.js response buffering which prevents SSE chunks from flushing mid-stream.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get("Authorization");
  const body = await request.text();

  const stream = new ReadableStream({
    start(controller) {
      let done = false;

      const req = http.request(
        {
          hostname: INTERNAL_API_HOST,
          port: INTERNAL_API_PORT,
          path: `/api/conversations/${params.id}/chat`,
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authHeader ? { Authorization: authHeader } : {}),
          },
        },
        (res) => {
          res.on("data", (chunk: Buffer) => {
            if (!done) try { controller.enqueue(chunk); } catch {}
          });
          res.on("end", () => {
            done = true;
            try { controller.close(); } catch {}
          });
          res.on("error", (err) => {
            done = true;
            try { controller.error(err); } catch {}
          });
        },
      );

      req.on("error", (err) => {
        done = true;
        try { controller.error(err); } catch {}
      });

      req.write(body);
      req.end();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
      "Content-Encoding": "identity",
      "Connection": "keep-alive",
    },
  });
}
