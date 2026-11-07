import { NextResponse } from "next/server";
import { accessToken, constantTimeEqual } from "@/lib/access";

export async function POST(request: Request) {
  const configuredCode = process.env.NAMI_ACCESS_CODE;
  const body = (await request.json().catch(() => null)) as { code?: unknown } | null;
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
