from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from src.routers import auth, foods, users, requirements, logs, nutrients, match
from src.databases.mongo import close_mongo_db, get_data
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from src.routers.dense import update_faiss_index 
from src.routers.sparse import update_sparse_index
import os


#__package__ = 'nutramap'
#__name__ = 'nutramap.main'

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    close_mongo_db()

app = FastAPI(lifespan=lifespan)
# Define the templates directory
templates = Jinja2Templates(directory="templates")

@app.on_event("startup")
async def load_index():
    # Create a mock request object with access to the app
    from fastapi import Request
    from starlette.datastructures import Headers, Scope
    
    # Create a minimal scope for the request
    scope: Scope = {
        "type": "http",
        "headers": Headers({}).raw,
        "method": "GET",
        "path": "/",
        "query_string": b"",
        "client": ("127.0.0.1", 8000),
    }
    
    # Create the request with access to the app
    request = Request(scope=scope)
    request.app = app
    
    # Get database connection
    db = get_data()
    
    # Create a system user for initialization
    system_user = {"_id": "system_init"}
    
    # Initialize app state to hold indexes
    app.state.faiss_index = None
    app.state.id_list = None
    app.state.sparse_index = None
    
    print("App state initialized successfully at startup")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to your frontend's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Base.metadata.create_all(bind = engine) 
# app.mount("/static", StaticFiles(directory="backend/static"), name="static")
@app.get("/")
def welcome(request: Request):
  # request is the data being passed into the template. in this case, empty.
  # return templates.TemplateResponse("home.html", {"request" : request})
  return "hi!"
  
app.include_router(auth.router)
app.include_router(foods.router)
app.include_router(users.router)
app.include_router(requirements.router)
app.include_router(logs.router)
app.include_router(nutrients.router)
app.include_router(match.router)