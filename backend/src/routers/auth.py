from fastapi import APIRouter, Depends, HTTPException, Form, Request, BackgroundTasks
from fastapi.security import OAuth2PasswordBearer
from pymongo.database import Database
from typing_extensions import Annotated
import hashlib
from jose import jwt, JWTError
from datetime import timedelta, timezone, datetime 
from fastapi.responses import JSONResponse
from bson import ObjectId
import os
from dotenv import load_dotenv
import faiss
import asyncio
import pickle

from src.databases.mongo import get_data

__package__ = "nutramap.routers"

# Load environment variables
load_dotenv()

router = APIRouter(
  # groups API endpoints together
  prefix='/auth', 
  tags=['auth']
)

# Get JWT settings from environment variables
SECRET_KEY = os.getenv("JWT_SECRET_KEY")
ALGORITHM = os.getenv("JWT_ALGORITHM")
if not SECRET_KEY and not ALGORITHM:
    raise ValueError("authentication environment variable is not set")

def hash_password(password: str) :
  return hashlib.sha256(password.encode()).hexdigest()


# #------------------------------------------pages-------------------------------------------------# 
# @router.get("/login")
# def render_login(request: Request):
#   return templates.TemplateResponse("login.html", {"request" : request})
  
# @router.get("/register")
# def render_register(request: Request):
#   return templates.TemplateResponse("register.html", {"request" : request})
# #--------------------------------------helpers-------------------------------------------------# 

#just for Swagger docs - this is the endpoint where the token in generated
oauth2_bearer = OAuth2PasswordBearer(tokenUrl='auth/submit_login')

def authenticate_user(email: str, password: str, user_db : Database) :
  user = user_db.users.find_one({"email" : email})
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  password_hash = hash_password(password)
  # check if hashed password input equals stored hash
  if user["password_hash"] == password_hash:
    return user
  else:
    raise HTTPException(status_code=403, detail="Incorrect password")
  
  
def create_access_token(email : str, user_id: any, role: str, name: str, expires : timedelta):
  encode = {'email': email, '_id': str(user_id), 'role' : role, 'name' : name}
  expires = datetime.now(timezone.utc) + expires
  # encode.update({'exp': expires})
  return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token:Annotated[str, Depends(oauth2_bearer)]):
  try: 
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    
    email = payload.get('email')
    user_id = ObjectId(payload.get('_id'))
    role = payload.get('role')
    name = payload.get('name')
    if email is None or user_id is None or role is None or name is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")
    return {'email' : email, '_id' : user_id, "role" : role, "name" : name}
  except JWTError:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")

#--------------------------------------end points------------------------------------------------------# 


def update_sparse_index(db: Database, user: dict, request: Request, background_tasks: BackgroundTasks):
    background_tasks.add_task(update_sparse_index, db=db, user=user, request=request)



@router.post("/submit_login")
async def handle_login(request: Request, background_tasks: BackgroundTasks, username: str = Form(...), password: str = Form(...)):
    user = authenticate_user(username, password, get_data())
    token = create_access_token(user["email"], str(user["_id"]), user["role"], user["name"], timedelta(minutes=60))
    
    # Initialize indexes with the current user's information
    try:
        # Import here to avoid circular imports
        from src.routers.dense_og import update_faiss_index, update_id_list
        from src.routers.sparse import update_sparse_index
        
        # Define the initialization function as a standalone function
        # This ensures it runs completely independently of the request
        async def init_indexes():
            db = get_data()
            print(f"Starting index initialization for user {user['email']}")
            try:
                # update sparse index 
                background_tasks.add_task(update_sparse_index, db=db, user=user, request=request)
                db = get_data()
                
                # check bin for faiss index, add to app state
                faiss_path = os.getenv("FAISS_BIN")
                if os.path.exists(faiss_path) and os.path.getsize(faiss_path) > 0:
                    print("Loading FAISS index from disk...")
                    index = faiss.read_index(faiss_path)
                    request.app.state.faiss_index = index
                else:
                    print("No index found — generating FAISS index...")
                    background_tasks.add_task(update_faiss_index, db=db, user=user, request=request)
                
                # check bin for id list, add to app state
                id_list_path = os.getenv("FOOD_ID_CACHE")
                if os.path.exists(id_list_path) and os.path.getsize(id_list_path) > 0:
                    with open(id_list_path, "rb") as f:
                        id_name_map = pickle.load(f)
                    request.app.state.id_name_map = id_name_map
                else:
                    print("No id list found — generating id list...")
                    background_tasks.add_task(update_id_list, db=db, user=user, request=request)
            except Exception as e:
                print(f"Error in background index initialization: {e}")
                import traceback
                traceback.print_exc()
    except Exception as e:
      print(f"Error in background index initialization: {e}")
      import traceback
      traceback.print_exc()
    
    # Return the token in the response body immediately
    # This allows the user to proceed to the dashboard while indexes initialize
    return JSONResponse(content={"access_token": token, "token_type": "bearer"}, status_code=200)
    

@router.get("/check-user")
def check_user(username: str, user_db : Database = Depends(get_data)):
  print("arstarstarst")
  user = user_db.users.find_one({"email" : username})
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  return JSONResponse(content={"msg" : ""}, status_code=200)
