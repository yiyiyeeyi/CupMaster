import { toNextJsHandler } from "better-auth/next-js";
import { getServerServices } from "@/lib/auth";

async function handle(request: Request) {
  const services = getServerServices();
  if (!services) return Response.json({ code: "CLOUD_UNAVAILABLE" }, { status: 503 });
  const handlers = toNextJsHandler(services.auth);
  return request.method === "GET" ? handlers.GET(request) : handlers.POST(request);
}

export { handle as GET, handle as POST };
