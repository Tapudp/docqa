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

  const stream = new ReadableStream({
    start(controller) {
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
            controller.close();
          });
          res.on("error", (err) => {
            controller.error(err);
          });
        },
      );

      req.on("error", (err) => {
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
