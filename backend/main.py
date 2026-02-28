import os
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

allowed_origins = [
    "http://localhost:4000",
    "http://127.0.0.1:4000",
    "http://0.0.0.0:4000",
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
    "http://0.0.0.0:8080",
    "https://www.nutramap.me",
    "https://nutramap.me",
    "https://nutramap.vercel.app",
]

extra_allowed_origins = os.getenv("CORS_ALLOW_ORIGINS", "")
if extra_allowed_origins:
    allowed_origins.extend(
        origin.strip()
        for origin in extra_allowed_origins.split(",")
        if origin.strip()
    )

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=list(dict.fromkeys(allowed_origins)),
    # Support Vercel preview deployments like:
    # https://nutramap-git-main-<team>.vercel.app
    allow_origin_regex=r"^https://nutramap(?:-[a-z0-9-]+)?\.vercel\.app$",
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

    # Create persistent volume for FAISS indexes and caches
    # This ensures files persist across container restarts
    volume = modal.Volume.from_name("nutramap-indexes", create_if_missing=True)

    # Get the directory containing this file
    backend_path = Path(__file__).parent

    # Create image with all dependencies and copy src directory
    # Note: We install faiss-gpu separately because it's only available on Linux x86_64
    image = (
        modal.Image.debian_slim(python_version="3.9")
        .pip_install_from_pyproject(backend_path / "pyproject.toml")
        .pip_install("faiss-gpu>=1.7.2")  # GPU-specific package for Modal's Linux containers
        .add_local_dir(backend_path / "src", "/root/src")
    )

    # GPU-accelerated embedding model class
    @app.cls(
        gpu="L4",  # L4 is cost-effective for embedding workloads
        image=image,
        secrets=[modal.Secret.from_name("nutramap-secrets")],
        container_idle_timeout=60,  # Scale down after 60 seconds of inactivity
    )
    class EmbeddingModel:
        """GPU-accelerated embedding model using sentence-transformers.

        This replaces OpenAI API calls with local GPU inference, providing:
        - 10-100x speedup for batch operations
        - Lower latency for single queries (~20ms vs ~200ms)
        - Significant cost savings
        - Better privacy (no external API calls)
        """

        def __enter__(self):
            import torch
            from sentence_transformers import SentenceTransformer

            # Use a model that matches OpenAI's embedding quality
            # BGE-large-en-v1.5 is a top-performing open-source model
            model_name = "BAAI/bge-large-en-v1.5"
            print(f"Loading embedding model: {model_name}")

            self.model = SentenceTransformer(model_name)

            # Move model to GPU if available
            if torch.cuda.is_available():
                self.model = self.model.to('cuda')
                print(f"✓ Model loaded on GPU: {torch.cuda.get_device_name(0)}")
            else:
                print("⚠ No GPU available, using CPU")

            # Dimension of BGE-large-en-v1.5 is 1024 (vs OpenAI's 3072)
            # This is more efficient while maintaining high quality
            self.dimension = 1024

        @modal.method()
        def encode_batch(self, texts: list[str], batch_size: int = 256) -> list[list[float]]:
            """Encode a batch of texts into embeddings.

            Args:
                texts: List of text strings to embed
                batch_size: Number of texts to process at once (higher = faster but more memory)

            Returns:
                List of embedding vectors (each is a list of floats)
            """
            import torch

            if not texts:
                return []

            # Encode with GPU acceleration
            embeddings = self.model.encode(
                texts,
                batch_size=batch_size,
                convert_to_numpy=True,
                show_progress_bar=False,
                normalize_embeddings=True,  # Normalize for cosine similarity
            )

            return embeddings.tolist()

        @modal.method()
        def encode_single(self, text: str) -> list[float]:
            """Encode a single text into an embedding.

            Args:
                text: Text string to embed

            Returns:
                Embedding vector as a list of floats
            """
            embeddings = self.encode_batch([text], batch_size=1)
            return embeddings[0] if embeddings else []

    # GPU-accelerated batch processing utility
    @app.cls(
        gpu="L4",
        cpu=8,
        image=image,
        secrets=[modal.Secret.from_name("nutramap-secrets")],
        container_idle_timeout=60,  # Scale down after 60 seconds of inactivity
    )
    class BatchProcessor:
        """GPU-accelerated batch processing for compute-intensive operations.

        This replaces the sequential async parallel_process with true parallelization.
        """

        def __enter__(self):
            import torch
            if torch.cuda.is_available():
                print(f"✓ BatchProcessor initialized on GPU: {torch.cuda.get_device_name(0)}")
            else:
                print("⚠ BatchProcessor running on CPU")

        @modal.method()
        def process_embeddings_parallel(self, texts: list[str]) -> list[list[float]]:
            """Process embeddings in parallel batches on GPU.

            Args:
                texts: List of text strings to embed

            Returns:
                List of embedding vectors
            """
            from sentence_transformers import SentenceTransformer
            import torch

            model = SentenceTransformer("BAAI/bge-large-en-v1.5")
            if torch.cuda.is_available():
                model = model.to('cuda')

            embeddings = model.encode(
                texts,
                batch_size=256,
                convert_to_numpy=True,
                show_progress_bar=False,
                normalize_embeddings=True,
            )

            return embeddings.tolist()

    # Main web server (CPU only - GPU classes called on-demand)
    @app.function(
        image=image,
        secrets=[modal.Secret.from_name("nutramap-secrets")],
        volumes={"/data": volume},  # Mount persistent volume
        container_idle_timeout=60,  # Scale down after 60 seconds of inactivity
        timeout=1200,  # 10 minutes - FAISS index rebuild can take 5+ minutes
    )
    @modal.asgi_app()
    def serve():
        return fastapi_app

except ImportError:
    # Modal not installed - running locally
    pass
