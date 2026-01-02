"""
User and Invitation models for authentication.

This module provides Pydantic models for:
- User: Authenticated users with roles
- Invitation: Pending user invitations
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class User(BaseModel):
    """Authenticated user model."""

    id: str = Field(..., description="Firebase UID")
    email: EmailStr = Field(..., description="User email address")
    name: str = Field(..., description="Display name")
    picture: str | None = Field(None, description="Profile picture URL")
    role: Literal["user", "admin"] = Field("user", description="User role")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Account creation timestamp",
    )
    last_login: datetime | None = Field(None, description="Last login timestamp")

    class Config:
        """Pydantic config."""

        from_attributes = True


class UserCreate(BaseModel):
    """Model for creating a new user from Firebase token claims."""

    id: str = Field(..., description="Firebase UID")
    email: EmailStr = Field(..., description="User email address")
    name: str = Field(..., description="Display name")
    picture: str | None = Field(None, description="Profile picture URL")


class Invitation(BaseModel):
    """Pending invitation model."""

    id: str = Field(..., description="Invitation ID (UUID)")
    email: EmailStr = Field(..., description="Invited email address")
    invited_by: str = Field(..., description="User ID who created the invitation")
    created_at: datetime = Field(
        default_factory=datetime.utcnow,
        description="Invitation creation timestamp",
    )
    accepted_at: datetime | None = Field(None, description="Acceptance timestamp")

    class Config:
        """Pydantic config."""

        from_attributes = True


class InvitationCreate(BaseModel):
    """Model for creating a new invitation."""

    email: EmailStr = Field(..., description="Email address to invite")


class InvitationResponse(BaseModel):
    """Response model for invitation endpoints."""

    id: str
    email: str
    invited_by: str
    created_at: datetime
    accepted_at: datetime | None = None
    invited_by_name: str | None = None


class UserResponse(BaseModel):
    """Response model for user endpoints."""

    id: str
    email: str
    name: str
    picture: str | None = None
    role: str
    created_at: datetime
    last_login: datetime | None = None
