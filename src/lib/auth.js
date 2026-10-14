import cookieSignature from "cookie-signature";
import {
  authRepository,
  permissionRepository,
  authorizationService,
  hashApiToken,
  decryptSessionId,
  createSessionAuthContext,
  createTokenAuthContext,
  createAnonymousContext,
  attachSessionPermissions,
} from "mbkauthe";
import { Permissions } from "../permissions.js";

const SESSION_SECRET =
  process.env.SESSION_SECRET_KEY || process.env.SESSION_SECRET || "default-session-secret";

/**
 * Extracts and verifies the authenticated user from a Web/Next.js Request.
 * Supports:
 * 1. Test header: x-test-user (in non-production or test environment)
 * 2. Bearer API tokens: Authorization: Bearer mbk_...
 * 3. Session cookies: mbkauthe.sid or session_id
 */
export async function getAuthContext(req) {
  // 1. Test override for testing
  if (process.env.NODE_ENV !== "production" || process.env.VITEST) {
    const testHeader = req.headers.get("x-test-user");
    if (testHeader) {
      try {
        const u = JSON.parse(testHeader);
        if (u.permissions && Array.isArray(u.permissions.allows)) {
          u.perms = u.perms || {};
          for (const key of u.permissions.allows) {
            const parts = key.split(":");
            const resource = parts.length === 3 ? parts[1] : parts[0];
            const action = parts.length === 3 ? parts[2] : parts[1];
            const def = Permissions[resource]?.[action];
            const mask = def?.mask || 1;
            u.perms[resource] = (u.perms[resource] || 0) | mask;
          }
        }
        return {
          user: u,
          authContext: createSessionAuthContext(u, { id: "test-session", appKey: "chatapi" }),
          isAuthenticated: true,
        };
      } catch (e) {
        console.warn("[getAuthContext] Invalid x-test-user header:", e.message);
      }
    }
  }

  // 2. Bearer API Token
  const authHeader = req.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token.startsWith("mbk_")) {
      const hashed = hashApiToken(token);
      const tokenRecord = await authRepository.getApiTokenByHash(hashed);
      if (tokenRecord && tokenRecord.is_active !== false) {
        if (!tokenRecord.expires_at || new Date(tokenRecord.expires_at) > new Date()) {
          const { masks, roles } = await permissionRepository.computeEffectiveForUser(
            tokenRecord.username,
            tokenRecord.role
          );
          const user = {
            username: tokenRecord.username,
            role: tokenRecord.role,
            roles: roles || [tokenRecord.role],
            perms: masks || {},
            user_id: tokenRecord.user_id,
            is_superadmin: tokenRecord.role === "superadmin",
          };
          const authContext = createTokenAuthContext(user, {
            id: tokenRecord.id,
            scopes: tokenRecord.permissions,
          });
          return { user, authContext, isAuthenticated: true };
        }
      }
    }
  }

  // 3. Cookies
  const cookieHeader = req.headers.get("cookie") || "";
  let sessionId = null;

  // Check for session_id cookie (encrypted)
  const sessionCookieMatch = cookieHeader.match(/(?:^|;\s*)session_id=([^;]+)/);
  if (sessionCookieMatch) {
    try {
      const decrypted = decryptSessionId(decodeURIComponent(sessionCookieMatch[1]));
      if (decrypted) sessionId = decrypted;
    } catch (e) {}
  }

  // Check for mbkauthe.sid cookie (signed: s:<sid>.<sig>)
  if (!sessionId) {
    const sidMatch = cookieHeader.match(/(?:^|;\s*)mbkauthe\.sid=([^;]+)/);
    if (sidMatch) {
      let rawVal = decodeURIComponent(sidMatch[1]);
      if (rawVal.startsWith("s:")) {
        const unsigned = cookieSignature.unsign(rawVal.slice(2), SESSION_SECRET);
        if (unsigned) sessionId = unsigned;
      } else {
        sessionId = rawVal;
      }
    }
  }

  if (sessionId) {
    const sessionData = await authRepository.getSessionAuthData(sessionId, "nextjs-auth");
    if (sessionData && sessionData.is_active !== false) {
      if (!sessionData.expires_at || new Date(sessionData.expires_at) > new Date()) {
        const isSuper = sessionData.role === "superadmin";
        const user = {
          session_id: String(sessionId),
          user_id: sessionData.user_id,
          username: sessionData.username,
          full_name: sessionData.full_name || sessionData.username,
          role: sessionData.role,
          roles: [sessionData.role],
          allowed_apps: sessionData.allowed_apps,
          is_superadmin: isSuper,
          perms: {},
          permissions: {},
        };

        if (isSuper) {
          user.perms = {};
          user.permissions = {};
        } else {
          try {
            await attachSessionPermissions(user, user.username, user.role);
          } catch (e) {}
        }

        const authContext = createSessionAuthContext(user, {
          id: sessionId,
          expiresAt: sessionData.expires_at,
          appKey: "chatapi",
        });

        return { user, authContext, isAuthenticated: true };
      }
    }
  }

  return {
    user: null,
    authContext: createAnonymousContext("chatapi"),
    isAuthenticated: false,
  };
}

/**
 * Validates session and checks permission.
 * Returns { user, authContext } or NextResponse with 401/403.
 *
 * @param {Request} req
 * @param {object|string} [permission]
 * @returns {Promise<{ user?: object, authContext?: object, errorResponse?: Response }>}
 */
export async function requirePermission(req, permission) {
  const auth = await getAuthContext(req);
  if (!auth.isAuthenticated || !auth.user) {
    return {
      errorResponse: Response.json(
        { error: "Not Logged In", message: "You are not logged in. Please log in to continue." },
        { status: 401 }
      ),
    };
  }

  if (auth.user.is_superadmin || auth.user.role === "superadmin") {
    return { user: auth.user, authContext: auth.authContext };
  }

  if (permission && !authorizationService.hasPermission(auth.authContext, permission)) {
    return {
      errorResponse: Response.json(
        {
          error: "Access Denied",
          message: "You do not have permission to access this resource.",
        },
        { status: 403 }
      ),
    };
  }

  return { user: auth.user, authContext: auth.authContext };
}
