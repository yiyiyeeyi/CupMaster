import { z } from "zod";
import { getServerServices } from "@/lib/auth";
import { cloudOperations } from "@/infrastructure/cloud/cloud-operations";
import { OwnerStore } from "@/infrastructure/cloud/owner-store";
import { handleNickname } from "@/infrastructure/cloud/nickname";
import { remoteFailure } from "@/infrastructure/cloud/repository-errors";
import type { RemoteResult } from "@/infrastructure/cloud/remote-repository-contracts";

const inputSchema = z.object({ action: z.string(), args: z.array(z.unknown()) });
const token = z.uuid();
type Operation = (args: unknown) => Promise<RemoteResult<unknown>>;

function reply(result: RemoteResult<unknown>) {
  const status = result.ok ? 200 : {
    unauthenticated: 401,
    permission_denied: 403,
    not_found: 404,
    revision_conflict: 409,
    invalid_data: 400,
    persistence_failed: 503,
  }[result.code];
  return Response.json(result, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request, context: { params: Promise<{ resource: string }> }) {
  try {
    const services = getServerServices();
    if (!services) return reply(remoteFailure("persistence_failed", "Cloud persistence is temporarily unavailable."));
    const session = await services.auth.api.getSession({ headers: request.headers });
    const owner = token.safeParse(session?.user.id);
    if (!session || !owner.success) return reply(remoteFailure("unauthenticated", "Sign in is required for cloud persistence."));
    if (request.headers.get("x-cupmaster-account") !== owner.data) {
      return reply(remoteFailure("permission_denied", "The active account changed before this request completed."));
    }
    if (!request.headers.get("content-type")?.startsWith("application/json")) {
      return reply(remoteFailure("invalid_data", "The request must contain JSON."));
    }
    const input = inputSchema.safeParse(await request.json().catch(() => null));
    if (!input.success) return reply(remoteFailure("invalid_data", "Invalid cloud request."));

    const { resource } = await context.params;
    const store = new OwnerStore(services.database, owner.data);
    if (resource === "nickname") return reply(await handleNickname(store, session.user, input.data.action, input.data.args));

    const groups: Record<string, Record<string, Operation>> = cloudOperations(store);
    const group = Object.hasOwn(groups, resource) ? groups[resource] : undefined;
    if (!group || !Object.hasOwn(group, input.data.action)) return reply(remoteFailure("not_found", "Cloud operation was not found."));
    return reply(await group[input.data.action](input.data.args));
  } catch (error) {
    if (error instanceof z.ZodError) return reply(remoteFailure("invalid_data", "Cloud data does not match the current domain contract."));
    return reply(remoteFailure("persistence_failed", "Cloud persistence is temporarily unavailable."));
  }
}
