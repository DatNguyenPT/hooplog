/**
 * The logic of the delete-account function, kept free of Deno and of the Supabase library so it
 * can be tested like the rest of the app. `index.ts` wires it to the real thing.
 *
 * The caller proves who they are with their own access token. The account removed is always the
 * one that token belongs to, never one named in the request.
 */

/** The part of Supabase's `auth` client this function uses; the real one fits it. */
export interface AdminAuth {
  getUser(jwt: string): Promise<{ data: { user: { id: string } | null }; error: unknown }>;
  admin: {
    signOut(jwt: string): Promise<{ error: unknown }>;
    deleteUser(id: string): Promise<{ error: unknown }>;
  };
}

export interface Reply {
  status: number;
  body: { deleted: true } | { error: 'unauthorized' | 'delete_failed' };
}

export type Stage = 'getUser' | 'signOut' | 'deleteUser';

/** Enough of a failure to find it in the logs, and nothing that could carry a token or a key. */
export interface ErrorDetails {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

export type Report = (stage: Stage, details: ErrorDetails) => void;

const UNAUTHORIZED: Reply = { status: 401, body: { error: 'unauthorized' } };
const FAILED: Reply = { status: 500, body: { error: 'delete_failed' } };

/** Statuses that mean "this token is not good" (as opposed to "the server had a problem"). */
const BAD_TOKEN_STATUSES = new Set([400, 401, 403, 404]);

const BEARER = /^Bearer\s+(\S+)$/i;

/** The token from an `Authorization: Bearer <token>` header, or null when there is none. */
export function bearerToken(header: string | null): string | null {
  const match = header ? BEARER.exec(header.trim()) : null;
  return match?.[1] ?? null;
}

export function describeError(error: unknown): ErrorDetails {
  if (typeof error !== 'object' || error === null) return {};
  const { name, code, status, message } = error as Record<string, unknown>;
  return {
    name: typeof name === 'string' ? name : undefined,
    code: typeof code === 'string' ? code : undefined,
    status: typeof status === 'number' ? status : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

function isBadToken(error: unknown): boolean {
  const { status } = describeError(error);
  return status !== undefined && BAD_TOKEN_STATUSES.has(status);
}

/**
 * The secret key this function acts with. Supabase provides the keys as a JSON object keyed by
 * name; older projects only have the single legacy key.
 */
export function secretKeyFrom(
  keysJson: string | undefined,
  legacyKey: string | undefined,
): string | null {
  const named = parseKeys(keysJson)?.default;
  if (typeof named === 'string' && named !== '') return named;
  return legacyKey ? legacyKey : null;
}

function parseKeys(json: string | undefined): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const parsed: unknown = JSON.parse(json);
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export async function deleteAccount(
  authorization: string | null,
  auth: AdminAuth,
  report: Report = () => undefined,
): Promise<Reply> {
  const jwt = bearerToken(authorization);
  if (!jwt) return UNAUTHORIZED;

  let stage: Stage = 'getUser';
  try {
    const { data, error } = await auth.getUser(jwt);
    if (error && !isBadToken(error)) {
      report(stage, describeError(error));
      return FAILED;
    }
    if (error || !data.user) return UNAUTHORIZED;
    const { id } = data.user;

    // Deleting a user does not cancel the access tokens already issued to them, so end every
    // session first. If that fails, nothing has been deleted and the player can simply retry.
    stage = 'signOut';
    const revoked = await auth.admin.signOut(jwt);
    if (revoked.error) {
      report(stage, describeError(revoked.error));
      return FAILED;
    }

    stage = 'deleteUser';
    const deleted = await auth.admin.deleteUser(id);
    if (deleted.error) {
      report(stage, describeError(deleted.error));
      return FAILED;
    }
    return { status: 200, body: { deleted: true } };
  } catch (error) {
    report(stage, describeError(error));
    return FAILED;
  }
}
