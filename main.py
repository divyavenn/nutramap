from fastapi import FastAPI
from contextlib import asynccontextmanager
from databases.food_models import Base
from routers import auth, food_data, user_data
from databases.food_data_connect import engine
from databases.user_data_connect import close_mongo_db


app = FastAPI()

Base.metadata.create_all(bind = engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    yield
    # Shutdown
    close_mongo_db()

app = FastAPI(lifespan=lifespan)
    
@app.get("/")
def welcome():
  return "Welome to Nutramapper!"

app.include_router(auth.router)
app.include_router(food_data.router)
app.include_router(user_data.router)


  