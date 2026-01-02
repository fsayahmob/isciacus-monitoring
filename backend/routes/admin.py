"""
Admin Routes - User and Invitation Management.

Provides endpoints for:
- GET /api/admin/users - List all users
- DELETE /api/admin/users/{user_id} - Delete a user
- GET /api/admin/invitations - List all invitations
- POST /api/admin/invitations - Create an invitation
- DELETE /api/admin/invitations/{invitation_id} - Revoke an invitation
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from middleware.auth_middleware import require_admin
from models.user import (
    InvitationCreate,
    InvitationResponse,
    User,
    UserResponse,
)
from services.secure_store import get_secure_store


router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/users", response_model=list[UserResponse])
async def list_users(
    _admin: User = Depends(require_admin),  # noqa: B008
) -> list[UserResponse]:
    """List all registered users. Admin only."""
    store = get_secure_store()
    users_data = store.list_users()
    return [
        UserResponse(
            id=u["id"],
            email=u["email"],
            name=u["name"],
            picture=u.get("picture"),
            role=u["role"],
            created_at=u["created_at"],
            last_login=u.get("last_login"),
        )
        for u in users_data
    ]


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    admin: User = Depends(require_admin),  # noqa: B008
) -> dict[str, str]:
    """Delete a user. Admin only. Cannot delete yourself."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself.")

    store = get_secure_store()
    deleted = store.delete_user(user_id)

    if not deleted:
        raise HTTPException(status_code=404, detail="User not found.")

    return {"message": "User deleted successfully."}


@router.get("/invitations", response_model=list[InvitationResponse])
async def list_invitations(
    _admin: User = Depends(require_admin),  # noqa: B008
) -> list[InvitationResponse]:
    """List all invitations. Admin only."""
    store = get_secure_store()
    invitations_data = store.list_invitations()
    return [
        InvitationResponse(
            id=i["id"],
            email=i["email"],
            invited_by=i["invited_by"],
            created_at=i["created_at"],
            accepted_at=i.get("accepted_at"),
            invited_by_name=i.get("invited_by_name"),
        )
        for i in invitations_data
    ]


@router.post("/invitations", response_model=InvitationResponse, status_code=201)
async def create_invitation(
    invitation: InvitationCreate,
    admin: User = Depends(require_admin),  # noqa: B008
) -> InvitationResponse:
    """Create a new invitation. Admin only."""
    store = get_secure_store()

    # Check if email is already invited
    existing = store.get_invitation_by_email(invitation.email)
    if existing:
        raise HTTPException(
            status_code=400,
            detail=f"Email {invitation.email} is already invited.",
        )

    # Check if email is already a user
    existing_user = store.get_user_by_email(invitation.email)
    if existing_user:
        raise HTTPException(
            status_code=400,
            detail=f"Email {invitation.email} is already a registered user.",
        )

    # Create invitation
    invitation_id = str(uuid.uuid4())
    created = store.create_invitation(
        invitation_id=invitation_id,
        email=invitation.email,
        invited_by=admin.id,
    )

    return InvitationResponse(
        id=created["id"],
        email=created["email"],
        invited_by=created["invited_by"],
        created_at=created["created_at"],
        accepted_at=created.get("accepted_at"),
        invited_by_name=admin.name,
    )


@router.delete("/invitations/{invitation_id}")
async def revoke_invitation(
    invitation_id: str,
    _admin: User = Depends(require_admin),  # noqa: B008
) -> dict[str, str]:
    """Revoke an invitation. Admin only."""
    store = get_secure_store()

    # Check if invitation exists
    existing = store.get_invitation_by_id(invitation_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Invitation not found.")

    # Check if already accepted
    if existing.get("accepted_at"):
        raise HTTPException(
            status_code=400,
            detail="Cannot revoke an already accepted invitation.",
        )

    store.delete_invitation(invitation_id)
    return {"message": "Invitation revoked successfully."}
