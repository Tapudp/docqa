import { type NextRequest } from "next/server";

const INTERNAL_API = process.env.INTERNAL_API_URL ?? "http://api:8000";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const authHeader = request.headers.get("Authorization");
  const body = await request.text();

  const upstream = await fetch(
    `${INTERNAL_API}/api/conversations/${params.id}/chat`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(authHeader ? { Authorization: authHeader } : {}),
      },
      body,
    },
  );

  // Pass the upstream ReadableStream directly — no buffering
  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
