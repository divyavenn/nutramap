ARG PORT

# Use Python 3.9 slim image
FROM python:3.9-slim

# Install system dependencies required for faiss and other packages
RUN apt-get update && apt-get install -y \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app
ENV PORT=${PORT}

# Install uv
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy dependency files
COPY pyproject.toml .
COPY uv.lock* .

# Update lock file and install dependencies
RUN uv lock
RUN uv sync --no-dev

# Copy the rest of the application code
COPY . .

# Expose the application port
EXPOSE $PORT

# Run the application using uv
CMD uv run uvicorn main:fastapi_app --host 0.0.0.0 --port $PORT