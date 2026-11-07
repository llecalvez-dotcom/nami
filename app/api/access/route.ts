import { NextResponse } from "next/server";
import { accessToken, constantTimeEqual } from "@/lib/access";
import { API_LIMITS, guard, readJsonLimited } from "@/lib/api-guard";

export async function POST(request: Request) {
  const lease = guard(request, "access");
  if (lease instanceof Response) return lease;
  try {
    return await checkCode(request);
  } finally {
    lease.release();
  }
}

async function checkCode(request: Request) {
  const configuredCode = process.env.NAMI_ACCESS_CODE;
  const read = await readJsonLimited(request, API_LIMITS.access);
  if (read instanceof Response) return read;
  const body = read.value as { code?: unknown } | null;
  if (!configuredCode || typeof body?.code !== "string" || !constantTimeEqual(body.code, configuredCode)) {
    return NextResponse.json({ error: "Invalid access code." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set("nami_access", await accessToken(configuredCode), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 12 * 60 * 60,
  });
  return response;
}
