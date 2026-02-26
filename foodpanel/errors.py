from __future__ import annotations

from typing import Any, Optional


class FoodpanelError(Exception):
    """Base exception for the Foodpanel client."""


class FoodpanelConnectionError(FoodpanelError):
    """Raised when the API cannot be reached."""


class FoodpanelAPIError(FoodpanelError):
    """Raised for non-2xx API responses."""

    def __init__(
        self,
        message: str,
        *,
        status_code: Optional[int] = None,
        path: Optional[str] = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.path = path
        self.details = details

    def __str__(self) -> str:
        if self.status_code is None:
            return self.message
        return f"{self.message} (status={self.status_code})"


class FoodpanelAuthError(FoodpanelAPIError):
    """Raised for auth errors (401/403) or missing tokens."""


class FoodpanelNotFoundError(FoodpanelAPIError):
    """Raised for 404 responses."""


class FoodpanelValidationError(FoodpanelAPIError):
    """Raised for 422 responses or invalid payloads."""
