# Section: SERVICES — AUTHENTICATION (sign in / sign up, no admin role)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  SERVICES — AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════
# Every account is a normal user account created through /auth/register. There
# is no admin table, admin role, or admin login anywhere in this backend. All
# API endpoints (except /auth/register and /auth/login) require a valid signed
# in user before the request is allowed to proceed — enforced globally in
# app_factory.py via a before_request hook.

# Paths that must stay reachable without a token so a brand-new user can
# create an account and sign in in the first place.
AUTH_PUBLIC_PATHS = {
    "/auth/login",
    "/auth/register",
    "/api/auth/login",
    "/api/auth/register",
}

def hash_password(password: str) -> str:
    return generate_password_hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return check_password_hash(password_hash, password)
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    if pyjwt is None:
        raise RuntimeError("PyJWT is required for authentication. Run: pip install PyJWT")
    now = datetime.datetime.utcnow()
    payload = {
        "sub": user_id,
        "email": email,
        "iat": now,
        "exp": now + datetime.timedelta(hours=JWT_EXPIRES_HOURS),
    }
    token = pyjwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)
    # PyJWT 2.x returns a str; PyJWT 1.x returns bytes.
    if isinstance(token, bytes):
        token = token.decode("utf-8")
    return token


def decode_access_token(token: str):
    if pyjwt is None or not token:
        return None
    try:
        return pyjwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
    except Exception:
        return None


def _extract_bearer_token():
    auth_header = request.headers.get("Authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    # EventSource (used for the /predictions SSE stream) cannot set custom
    # request headers, so also accept the token as a query parameter there.
    query_token = request.args.get("token") or request.args.get("access_token")
    if query_token:
        return query_token.strip()
    return None


def load_current_user_into_g():
    """Populate g.user_id / g.user_email from the request's Authorization header.

    Safe to call even when no token is present — g.user_id simply stays None.
    """
    g.user_id = None
    g.user_email = None
    token = _extract_bearer_token()
    if not token:
        return
    payload = decode_access_token(token)
    if not payload:
        return
    g.user_id = payload.get("sub")
    g.user_email = payload.get("email")


def require_auth(view_func):
    """Route decorator that rejects requests without a valid signed-in user.

    The global before_request guard in app_factory.py already blocks
    unauthenticated requests to every non-auth endpoint, so this decorator is
    a defense-in-depth helper for routes that want to be explicit about it.
    """
    @wraps(view_func)
    def wrapper(*args, **kwargs):
        if not getattr(g, "user_id", None):
            return _json_error("Sign in is required to use this feature.", status=401, code="AUTH_REQUIRED")
        return view_func(*args, **kwargs)
    return wrapper
