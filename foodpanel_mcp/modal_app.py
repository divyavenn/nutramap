from __future__ import annotations

import modal


app = modal.App("foodpanel-mcp")

image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install_from_pyproject("pyproject.toml")
    .add_local_python_source("foodpanel", "foodpanel_mcp", copy=True)
    .env(
        {
            # Enforce stateless request handling for remote MCP transport.
            "FOODPANEL_MCP_STATELESS": "1",
            "FOODPANEL_MCP_TRANSPORT": "streamable-http",
        }
    )
)


@app.function(image=image, timeout=300, container_idle_timeout=60)
@modal.asgi_app()
def serve():
    from foodpanel_mcp.server import streamable_http_app

    return streamable_http_app()
