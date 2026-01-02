"""
Authentication Routes - User Auth Endpoints.

Provides endpoints for:
- GET /api/auth/me - Get current authenticated user
- POST /api/auth/logout - Logout (for audit logging)
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

from middleware.auth_middleware import get_current_user
from models.user import User, UserResponse


router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)) -> UserResponse:  # noqa: B008
    """Get the current authenticated user."""
    return UserResponse(
        id=user.id,
        email=user.email,
        name=user.name,
        picture=user.picture,
        role=user.role,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@router.post("/logout")
async def logout(
    user: User = Depends(get_current_user),  # noqa: B008
) -> dict[str, str]:
    """
    Logout endpoint.

    Note: Actual token invalidation happens client-side (Firebase).
    This endpoint is for audit logging purposes.
    """
    # Could log the logout event here if needed
    return {"message": f"User {user.email} logged out successfully"}
