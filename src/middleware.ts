import { NextResponse, type NextRequest } from "next/server";

export function middleware(req: NextRequest) {
  // Never expose uploaded internal assets (e.g., env snapshots or source archives) over HTTP
  if (req.nextUrl.pathname.startsWith("/assets/aistudio/")) {
    return new NextResponse("Not Found", { status: 404 });
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/assets/aistudio/:path*"]
};
