from fastapi import FastAPI, Request
from contextlib import asynccontextmanager
from .databases.food_models import Base
from .routers import auth, foods, users, requirements, logs, nutrients
from .databases.main_connection import engine, close_mongo_db
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates

from fastapi.middleware.cors import CORSMiddleware


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this to your frontend's URL in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

Base.metadata.create_all(bind = engine) 
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
