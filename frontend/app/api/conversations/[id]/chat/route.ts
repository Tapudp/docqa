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

  // Use node:http directly to bypass Next.js's patched global fetch
  // (Next.js patches fetch for caching/dedup which can consume the SSE body)
  return new Promise<Response>((resolve) => {
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();

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
        resolve(
          new Response(readable, {
            status: res.statusCode ?? 200,
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache, no-transform",
              "X-Accel-Buffering": "no",
              "Content-Encoding": "identity",
              "Connection": "keep-alive",
            },
          }),
        );

        res.on("data", (chunk: Buffer) => {
          writer.write(chunk).catch(() => {});
        });

        res.on("end", () => {
          writer.close().catch(() => {});
        });

        res.on("error", (err) => {
          writer.abort(err).catch(() => {});
        });
      },
    );

    req.on("error", (err) => {
      writer.abort(err).catch(() => {});
      resolve(new Response("upstream error", { status: 502 }));
    });

    req.write(body);
    req.end();
  });
}
