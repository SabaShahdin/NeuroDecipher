# Section: ROUTES — AUTHENTICATION (sign up / sign in, no admin login)
# NOTE: Loaded by neurodecipher_backend.runtime into a shared runtime namespace.

# ══════════════════════════════════════════════════════════════════════════════
#  ROUTES — AUTHENTICATION
# ══════════════════════════════════════════════════════════════════════════════
auth_bp = Blueprint("auth", __name__, url_prefix="/auth")

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _valid_email(email: str) -> bool:
    return bool(email) and bool(_EMAIL_RE.match(email))


@auth_bp.route("/register", methods=["POST"])
def auth_register():
    """Create a normal user account. There is no admin signup path."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip() or None

    if not _valid_email(email):
        return _json_error("Please enter a valid email address.", status=400, code="INVALID_EMAIL")
    if len(password) < MIN_PASSWORD_LENGTH:
        return _json_error(
            f"Password must be at least {MIN_PASSWORD_LENGTH} characters.",
            status=400,
            code="WEAK_PASSWORD",
        )

    try:
        if db_get_user_by_email(email):
            return _json_error("An account with this email already exists.", status=409, code="EMAIL_TAKEN")
        user = db_create_user(email=email, password_hash=hash_password(password), name=name)
    except Exception as exc:
        log.error(f"[auth] register failed for {email}: {exc}")
        return _json_error("Could not create account. Please try again.", status=500, code="REGISTER_FAILED")

    db_insert_audit(None, email, "user_registered", {"userId": user["id"]})
    token = create_access_token(user["id"], email)
    log.info(f"[auth] new user registered: {email}")
    return jsonify({"ok": True, "token": token, "user": db_public_user({**user, "email": email})}), 201


@auth_bp.route("/login", methods=["POST"])
def auth_login():
    """Sign in an existing user and issue an access token."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return _json_error("Email and password are required.", status=400, code="MISSING_CREDENTIALS")

    try:
        user = db_get_user_by_email(email)
    except Exception as exc:
        log.error(f"[auth] login lookup failed for {email}: {exc}")
        return _json_error("Could not sign in right now. Please try again.", status=500, code="LOGIN_FAILED")

    if not user or not verify_password(password, user.get("password_hash") or ""):
        return _json_error("Incorrect email or password.", status=401, code="INVALID_CREDENTIALS")

    db_touch_user_login(user["id"])
    token = create_access_token(user["id"], email)
    db_insert_audit(None, email, "user_login", {"userId": user["id"]})
    return jsonify({"ok": True, "token": token, "user": db_public_user(user)})


@auth_bp.route("/me", methods=["GET"])
def auth_me():
    """Return the signed-in user's profile, used by the frontend on app load."""
    if not getattr(g, "user_id", None):
        return _json_error("Sign in is required.", status=401, code="AUTH_REQUIRED")
    user = db_get_user_by_id(g.user_id)
    if not user:
        return _json_error("User not found.", status=404, code="USER_NOT_FOUND")
    return jsonify({"ok": True, "user": db_public_user(user)})


@auth_bp.route("/logout", methods=["POST"])
def auth_logout():
    """Stateless JWT logout: the frontend discards its token. Kept for audit logging."""
    if getattr(g, "user_id", None):
        db_insert_audit(None, g.user_id, "user_logout", {})
    return jsonify({"ok": True})
