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

      // Send SSE keep-alive comments every 3s so Next.js doesn't close the connection
      // during the ~40s gap while Ollama generates the response
      const heartbeat = setInterval(() => {
        if (!done) {
          try {
            controller.enqueue(encoder.encode(": keep-alive\n\n"));
          } catch {
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
          res.on("data", (chunk: Buffer) => {
            controller.enqueue(chunk);
          });

          res.on("end", () => {
            done = true;
            clearInterval(heartbeat);
            controller.close();
          });

          res.on("error", (err) => {
            done = true;
            clearInterval(heartbeat);
            controller.error(err);
          });
        },
      );

      req.on("error", (err) => {
        done = true;
        clearInterval(heartbeat);
        controller.error(err);
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
