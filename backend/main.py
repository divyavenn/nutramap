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
    import os
    import pickle
    import faiss
    from dotenv import load_dotenv

    load_dotenv()

    # Initialize app state to hold indexes
    fastapi_app.state.faiss_index = None
    fastapi_app.state.id_list = None
    fastapi_app.state.sparse_index = None

    print("Loading FAISS index at startup...")

    # Load FAISS index from .bin file if it exists
    try:
        faiss_bin_path = os.getenv("FAISS_BIN")
        if faiss_bin_path and os.path.exists(faiss_bin_path):
            fastapi_app.state.faiss_index = faiss.read_index(faiss_bin_path)
            print(f"✓ Loaded FAISS index with {fastapi_app.state.faiss_index.ntotal} vectors")
        else:
            print(f"⚠ FAISS index file not found at: {faiss_bin_path}")
    except Exception as e:
        print(f"⚠ Failed to load FAISS index: {e}")

    # Load food ID list from pickle cache
    try:
        food_id_cache_path = os.getenv("FOOD_ID_CACHE")
        if food_id_cache_path and os.path.exists(food_id_cache_path):
            with open(food_id_cache_path, "rb") as f:
                id_name_map = pickle.load(f)
            fastapi_app.state.id_list = list(id_name_map.keys())
            print(f"✓ Loaded food ID list with {len(fastapi_app.state.id_list)} entries")
        else:
            print(f"⚠ Food ID cache not found at: {food_id_cache_path}")
            # Regenerate the pickle cache from MongoDB
            print("Regenerating food ID cache from database...")
            from src.databases.mongo import get_data

            db = get_data()
            if db is not None:
                # Get all foods from MongoDB, sorted by _id to match FAISS index order
                foods = list(db.foods.find({}, {"_id": 1, "food_name": 1}).sort("_id", 1))
                id_name_map = {}
                skipped = 0
                for food in foods:
                    # Skip foods without food_name field
                    if "food_name" not in food or not food["food_name"]:
                        skipped += 1
                        continue
                    id_name_map[food["_id"]] = {"name": food["food_name"]}

                # Save to pickle cache
                with open(food_id_cache_path, "wb") as f:
                    pickle.dump(id_name_map, f)

                fastapi_app.state.id_list = list(id_name_map.keys())
                print(f"✓ Regenerated and saved food ID cache with {len(fastapi_app.state.id_list)} entries" +
                      (f" (skipped {skipped} foods without names)" if skipped > 0 else ""))
            else:
                print("⚠ Could not connect to database to regenerate cache")
    except Exception as e:
        print(f"⚠ Failed to load food ID cache: {e}")

    print("App state initialized successfully at startup")

    yield

    # Shutdown
    close_mongo_db()

fastapi_app = FastAPI(lifespan=lifespan)

# Templates are not currently used - initialize lazily if needed
# templates = Jinja2Templates(directory="templates")

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "https://www.nutramap.me",
        "https://nutramap.me",
        "*"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
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