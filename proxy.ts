import { NextResponse, type NextRequest } from "next/server";
import { accessToken, constantTimeEqual } from "@/lib/access";

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/api/access") return NextResponse.next();

  const code = process.env.NAMI_ACCESS_CODE;
  if (!code) {
    return process.env.NODE_ENV !== "production"
      ? NextResponse.next()
      : NextResponse.json({ error: "Access is not configured." }, { status: 503 });
  }

  const expected = await accessToken(code);
  const actual = request.cookies.get("nami_access")?.value ?? "";
  if (constantTimeEqual(actual, expected)) return NextResponse.next();
  return NextResponse.json({ error: "Access code required. Open /access." }, { status: 401 });
}

export const config = {
  matcher: "/api/:path*",
};
