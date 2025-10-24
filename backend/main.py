from fastapi import FastAPI
from contextlib import asynccontextmanager
from src.routers import auth, foods, users, requirements, logs, nutrients, match, trial_user, recipes
from src.databases.mongo import close_mongo_db
from fastapi.middleware.cors import CORSMiddleware


#__package__ = 'nutramap'
#__name__ = 'nutramap.main'

@asynccontextmanager
async def lifespan(fastapi_app: FastAPI):
    # Startup
    # Initialize app state to hold indexes
    fastapi_app.state.faiss_index = None
    fastapi_app.state.id_list = None
    fastapi_app.state.sparse_index = None

    print("App state initialized successfully at startup")

    yield

    # Shutdown
    close_mongo_db()

fastapi_app = FastAPI(lifespan=lifespan)

# Templates are not currently used - initialize lazily if needed
# templates = Jinja2Templates(directory="templates")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to your frontend's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Base.metadata.create_all(bind = engine)
# fastapi_app.mount("/static", StaticFiles(directory="backend/static"), name="static")
@fastapi_app.get("/")
def welcome():
  return {"message": "NutraMap API", "status": "running"}

fastapi_app.include_router(auth.router)
fastapi_app.include_router(foods.router)
fastapi_app.include_router(users.router)
fastapi_app.include_router(requirements.router)
fastapi_app.include_router(logs.router)
fastapi_app.include_router(nutrients.router)
fastapi_app.include_router(match.router)
fastapi_app.include_router(trial_user.router)
fastapi_app.include_router(recipes.router)


# ============================================================================
# Modal Deployment Configuration
# ============================================================================
# This section is only used when deploying to Modal.
# For local development, this code is ignored.

try:
    import modal
    from pathlib import Path

    # Create Modal app
    app = modal.App("nutramap-backend")

    # Get the directory containing this file
    backend_path = Path(__file__).parent

    # Create image with all dependencies and copy src directory
    image = (
        modal.Image.debian_slim(python_version="3.9")
        .pip_install_from_pyproject(backend_path / "pyproject.toml")
        .add_local_dir(backend_path / "src", "/root/src")
    )

    # Load secrets from Modal
    @app.function(
        image=image,
        secrets=[modal.Secret.from_name("nutramap-secrets")],
        min_containers=1,
        timeout=300,
    )
    @modal.asgi_app()
    def serve():
        return fastapi_app

except ImportError:
    # Modal not installed - running locally
    pass