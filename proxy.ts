import { NextResponse, type NextRequest } from "next/server";
import { accessToken, constantTimeEqual } from "@/lib/access";
import { documentsEnabled } from "@/lib/documents";

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (["/api/documents/find", "/api/documents/preview", "/api/documents/extract-found", "/api/documents/upload"].includes(pathname.replace(/\/$/, "")) && !documentsEnabled()) {
    return NextResponse.json({ error: "Not found." }, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  if (pathname === "/api/access" || pathname === "/access" || pathname === "/access/") return NextResponse.next();
  const isApi = pathname === "/api" || pathname.startsWith("/api/");

  const code = process.env.NAMI_ACCESS_CODE;
  if (!code) {
    if (!isApi || process.env.NODE_ENV !== "production") return NextResponse.next();
    return NextResponse.json({ error: "Access is not configured." }, { status: 503 });
  }

  const expected = await accessToken(code);
  const actual = request.cookies.get("nami_access")?.value ?? "";
  if (constantTimeEqual(actual, expected)) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: "Access code required. Open /access." }, { status: 401 });

  const destination = new URL("/access", request.url);
  destination.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(destination);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico$|access/?$|.*\\.[^/]+$).*)"],
};
