"""
Credentials management endpoints.

Handles secure upload and management of sensitive credentials
like Google Service Account JSON files.
"""

import json
from pathlib import Path
from typing import Annotated, Any

from fastapi import APIRouter, File, HTTPException, UploadFile
from google.oauth2 import service_account
from pydantic import BaseModel


router = APIRouter()

CREDENTIALS_DIR = Path(__file__).parent.parent / "credentials"


class CredentialsStatus(BaseModel):
    """Status of credentials files."""

    google_service_account: dict[str, Any]


@router.get("/api/credentials/status")
async def get_credentials_status() -> dict[str, Any]:
    """
    Get status of all credentials files.

    Returns information about which credentials are configured
    without exposing the actual secrets.
    """
    google_creds_path = CREDENTIALS_DIR / "google-service-account.json"

    google_status = {
        "configured": google_creds_path.exists(),
        "valid": False,
        "error": None,
    }

    if google_creds_path.exists():
        try:
            # Try to load and validate
            credentials = service_account.Credentials.from_service_account_file(
                str(google_creds_path),
                scopes=["https://www.googleapis.com/auth/content"],
            )
            google_status["valid"] = True
            google_status["project_id"] = credentials.project_id
            google_status["service_account_email"] = credentials.service_account_email
        except Exception as e:
            google_status["error"] = str(e)[:100]

    return {
        "google_service_account": google_status,
    }


@router.post("/api/credentials/google/upload")
async def upload_google_credentials(file: Annotated[UploadFile, File()]) -> dict[str, Any]:
    """
    Upload Google Service Account credentials file.

    Security checks:
    1. Validates JSON format
    2. Validates required fields for service account
    3. Tests credentials can be loaded by google-auth library
    4. Saves to secure credentials directory

    Args:
        file: JSON file containing Google Service Account credentials

    Returns:
        Success message with validation info

    Raises:
        HTTPException: If file is invalid or cannot be saved
    """
    # Validate file extension
    if not file.filename or not file.filename.endswith(".json"):
        raise HTTPException(
            status_code=400,
            detail="File must be a JSON file (.json extension)",
        )

    # Read file content
    try:
        content = await file.read()
        credentials_data = json.loads(content)
    except json.JSONDecodeError as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON format",
        ) from e

    # Validate required fields for Google Service Account
    required_fields = [
        "type",
        "project_id",
        "private_key_id",
        "private_key",
        "client_email",
        "client_id",
        "auth_uri",
        "token_uri",
    ]

    missing_fields = [field for field in required_fields if field not in credentials_data]

    if missing_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Missing required fields: {', '.join(missing_fields)}",
        )

    # Validate it's a service account
    if credentials_data.get("type") != "service_account":
        raise HTTPException(
            status_code=400,
            detail="Credentials must be of type 'service_account'",
        )

    # Create credentials directory if it doesn't exist
    CREDENTIALS_DIR.mkdir(parents=True, exist_ok=True)

    # Save to temporary file first to test loading
    temp_path = CREDENTIALS_DIR / "google-service-account.json.tmp"
    try:
        with temp_path.open("w") as f:
            json.dump(credentials_data, f, indent=2)

        # Test that credentials can be loaded
        credentials = service_account.Credentials.from_service_account_file(
            str(temp_path),
            scopes=["https://www.googleapis.com/auth/content"],
        )

        # If successful, rename to final location
        final_path = CREDENTIALS_DIR / "google-service-account.json"
        temp_path.rename(final_path)

        # Set restrictive permissions (read-only for owner)
        final_path.chmod(0o600)

        return {
            "success": True,
            "message": "Google Service Account credentials uploaded successfully",
            "project_id": credentials.project_id,
            "service_account_email": credentials.service_account_email,
        }

    except Exception as e:
        # Clean up temp file if it exists
        if temp_path.exists():
            temp_path.unlink()

        raise HTTPException(
            status_code=400,
            detail=f"Failed to validate credentials: {str(e)[:200]}",
        ) from e


@router.delete("/api/credentials/google")
async def delete_google_credentials() -> dict[str, Any]:
    """
    Delete Google Service Account credentials.

    Returns:
        Success message
    """
    google_creds_path = CREDENTIALS_DIR / "google-service-account.json"

    if not google_creds_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Google credentials not found",
        )

    google_creds_path.unlink()

    return {
        "success": True,
        "message": "Google Service Account credentials deleted",
    }
