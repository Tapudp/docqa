import { type NextRequest } from "next/server";
import http from "node:http";

const INTERNAL_API_HOST = process.env.INTERNAL_API_HOST ?? "api";
const INTERNAL_API_PORT = parseInt(process.env.INTERNAL_API_PORT ?? "8000", 10);

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get("Authorization");
  const body = await request.text();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let done = false;
      let chunkCount = 0;

      const heartbeat = setInterval(() => {
        if (!done) {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch (e) {
            console.error("[SSE] heartbeat enqueue failed:", e);
            clearInterval(heartbeat);
          }
        }
      }, 3000);

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
          console.log("[SSE] upstream connected, status:", res.statusCode);

          res.on("data", (chunk: Buffer) => {
            chunkCount++;
            console.log(`[SSE] chunk #${chunkCount}, size=${chunk.length}`);
            try {
              controller.enqueue(chunk);
            } catch (e) {
              console.error("[SSE] enqueue failed:", e);
            }
          });

          res.on("end", () => {
            console.log(`[SSE] upstream ended after ${chunkCount} chunks`);
            done = true;
            clearInterval(heartbeat);
            try { controller.close(); } catch {}
          });

          res.on("error", (err) => {
            console.error("[SSE] upstream error:", err.message);
            done = true;
            clearInterval(heartbeat);
            try { controller.error(err); } catch {}
          });
        },
      );

      req.on("error", (err) => {
        console.error("[SSE] request error:", err.message);
        done = true;
        clearInterval(heartbeat);
        try { controller.error(err); } catch {}
      });

      req.write(body);
      req.end();
      console.log("[SSE] request sent to upstream");
    },
    cancel(reason) {
      console.log("[SSE] stream cancelled by consumer:", reason);
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
