import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

const HUB_HOST = "hub.getjourni.co";
const ADMIN_HOST = "admin.getjourni.co";

function getRequestHostname(request: NextRequest) {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const host = forwardedHost?.split(",")[0]?.trim() || request.headers.get("host") || "";

  return host.toLowerCase().split(":")[0];
}

export function proxy(request: NextRequest) {
  if (request.nextUrl.pathname !== "/") {
    return NextResponse.next();
  }

  const hostname = getRequestHostname(request);
  const destination =
    hostname === HUB_HOST
      ? "/signin"
      : hostname === ADMIN_HOST
        ? "/backoffice"
        : null;

  if (!destination) {
    return NextResponse.next();
  }

  const url = request.nextUrl.clone();
  url.pathname = destination;

  return NextResponse.rewrite(url);
}

export const config = {
  matcher: "/",
};
