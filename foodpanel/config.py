from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Optional


CONFIG_PATH_ENV = "FOODPANEL_CONFIG_PATH"
DEFAULT_BASE_URL = "https://divyavenkatraman234--nutramap-backend-serve.modal.run"


@dataclass
class StoredConfig:
    base_url: Optional[str] = None
    access_token: Optional[str] = None


class ConfigStore:
    """Read/write persistent client config used by CLI and MCP wrappers."""

    def __init__(self, path: Optional[str] = None) -> None:
        self.path = Path(path) if path else self.default_path()

    @staticmethod
    def default_path() -> Path:
        env_path = os.getenv(CONFIG_PATH_ENV)
        if env_path:
            return Path(env_path)
        return Path.home() / ".foodpanel" / "config.json"

    def load(self) -> StoredConfig:
        if not self.path.exists():
            return StoredConfig()

        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return StoredConfig()

        return StoredConfig(
            base_url=raw.get("base_url"),
            access_token=raw.get("access_token"),
        )

    def save(self, *, base_url: Optional[str], access_token: Optional[str]) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        payload = {
            "base_url": base_url,
            "access_token": access_token,
        }
        self.path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
