"""
Authentication Middleware - FastAPI Dependencies.

Provides dependency injection for authentication:
- get_current_user: Requires authenticated user
- get_optional_user: Optional authentication
- require_admin: Requires admin role
"""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from models.user import User
from services.auth_service import AuthError, get_auth_service


# HTTP status codes
HTTP_UNAUTHORIZED = 401
HTTP_FORBIDDEN = 403

# Bearer token security scheme
bearer_scheme = HTTPBearer(auto_error=False)

# Type alias for credentials dependency
CredentialsDep = Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)]


def _extract_token(request: Request) -> str | None:
    """Extract Bearer token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if auth_header.startswith("Bearer "):
        return auth_header[7:]
    return None


async def get_current_user(request: Request, credentials: CredentialsDep) -> User:
    """
    FastAPI dependency to get the current authenticated user.

    Raises:
        HTTPException: 401 if not authenticated, 403 if not authorized
    """
    token = credentials.credentials if credentials else _extract_token(request)

    if not token:
        raise HTTPException(
            status_code=HTTP_UNAUTHORIZED,
            detail="Not authenticated. Please provide a valid token.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    auth_service = get_auth_service()

    try:
        claims = auth_service.verify_token(token)
        return auth_service.get_or_create_user(claims)
    except AuthError as e:
        headers = (
            {"WWW-Authenticate": "Bearer"} if e.status_code == HTTP_UNAUTHORIZED else None
        )
        raise HTTPException(
            status_code=e.status_code,
            detail=e.message,
            headers=headers,
        ) from e


async def get_optional_user(request: Request, credentials: CredentialsDep) -> User | None:
    """
    FastAPI dependency for optional authentication.

    Returns User if authenticated, None otherwise.
    """
    token = credentials.credentials if credentials else _extract_token(request)

    if not token:
        return None

    auth_service = get_auth_service()

    try:
        claims = auth_service.verify_token(token)
        return auth_service.get_or_create_user(claims)
    except AuthError:
        return None


# Type alias for user dependency
CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def require_admin(user: CurrentUserDep) -> User:
    """
    FastAPI dependency requiring admin role.

    Raises:
        HTTPException: 403 if user is not admin
    """
    if user.role != "admin":
        raise HTTPException(
            status_code=HTTP_FORBIDDEN,
            detail="Admin access required.",
        )
    return user


# Type alias for admin dependency
AdminUserDep = Annotated[User, Depends(require_admin)]
