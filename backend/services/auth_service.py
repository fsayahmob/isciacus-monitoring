"""
Authentication Service - Firebase ID Token Verification.

This module provides:
- Firebase ID token verification using Google Auth library
- User management (create, get, authorize)
- Invitation validation
"""

from __future__ import annotations

import os
from typing import Any

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from models.user import User, UserCreate
from services.secure_store import get_secure_store


class AuthError(Exception):
    """Authentication error with status code."""

    def __init__(self, message: str, status_code: int = 401) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class AuthService:
    """Service for Firebase authentication and user management."""

    def __init__(self) -> None:
        self._store = get_secure_store()
        self._project_id = os.getenv("FIREBASE_PROJECT_ID", "")
        self._admin_email = os.getenv("ADMIN_EMAIL", "")

    def verify_token(self, token: str) -> dict[str, Any]:
        """
        Verify a Firebase ID token.

        Args:
            token: The Firebase ID token to verify

        Returns:
            The decoded token claims

        Raises:
            AuthError: If token is invalid or expired
        """
        if not token:
            raise AuthError("No token provided", 401)

        try:
            # Verify the token using Google's library
            return id_token.verify_firebase_token(
                token,
                google_requests.Request(),
                audience=self._project_id,
            )
        except ValueError as e:
            raise AuthError(f"Invalid token: {e}", 401) from e

    def get_or_create_user(self, claims: dict[str, Any]) -> User:
        """
        Get existing user or create new one from token claims.

        Args:
            claims: Decoded Firebase token claims

        Returns:
            User object

        Raises:
            AuthError: If user is not authorized (no invitation)
        """
        email = claims.get("email", "")
        if not email:
            raise AuthError("Token missing email claim", 401)

        # Check if user already exists
        existing_user = self._store.get_user_by_email(email)
        if existing_user:
            # Update last login
            self._store.update_user_last_login(existing_user["id"])
            return User(**existing_user)

        # Check if user is invited or is the admin email
        is_admin = self._admin_email and email.lower() == self._admin_email.lower()
        is_invited = self._store.is_email_invited(email)

        if not is_admin and not is_invited:
            raise AuthError(
                "You are not authorized. Please request an invitation.", 403
            )

        # Create new user
        user_data = UserCreate(
            id=claims.get("sub", ""),
            email=email,
            name=claims.get("name", email.split("@")[0]),
            picture=claims.get("picture"),
        )

        role = "admin" if is_admin else "user"
        created = self._store.create_user(
            user_id=user_data.id,
            email=user_data.email,
            name=user_data.name,
            picture=user_data.picture,
            role=role,
        )

        # Mark invitation as accepted
        if is_invited:
            self._store.mark_invitation_accepted(email)

        return User(**created)

    def get_user_by_id(self, user_id: str) -> User | None:
        """Get a user by their ID."""
        user_data = self._store.get_user_by_id(user_id)
        return User(**user_data) if user_data else None

    def get_user_by_email(self, email: str) -> User | None:
        """Get a user by their email."""
        user_data = self._store.get_user_by_email(email)
        return User(**user_data) if user_data else None

    def is_admin(self, user: User) -> bool:
        """Check if user has admin role."""
        return user.role == "admin"

    def list_users(self) -> list[User]:
        """List all users."""
        users_data = self._store.list_users()
        return [User(**u) for u in users_data]

    def delete_user(self, user_id: str) -> bool:
        """Delete a user."""
        return self._store.delete_user(user_id)


# Singleton instance
_auth_service: AuthService | None = None


def get_auth_service() -> AuthService:
    """Get the singleton AuthService instance."""
    global _auth_service
    if _auth_service is None:
        _auth_service = AuthService()
    return _auth_service
