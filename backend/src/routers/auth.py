from fastapi import APIRouter, Depends, HTTPException, Form, Request
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
import asyncio
import pickle
import faiss

# When running as a module within the application, use relative imports
try:
    from src.databases.mongo import get_data
    from .parallel import parallel_process

# When running this file directly, use absolute imports
except ImportError:
    import sys
    import os
    sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))
    from src.databases.mongo import get_data
    from src.routers.parallel import parallel_process

__package__ = "nutramap.routers"

# Load environment variables from .env file (for local development)
load_dotenv()

router = APIRouter(
  # groups API endpoints together
  prefix='/auth',
  tags=['auth']
)

# Lazy getters for JWT settings
_SECRET_KEY = None
_ALGORITHM = None

def _get_jwt_config():
    """Get JWT configuration, reading from env at runtime"""
    global _SECRET_KEY, _ALGORITHM
    if _SECRET_KEY is None:
        _SECRET_KEY = os.getenv("JWT_SECRET_KEY")
        _ALGORITHM = os.getenv("JWT_ALGORITHM")
        if not _SECRET_KEY or not _ALGORITHM:
            raise ValueError("JWT_SECRET_KEY and JWT_ALGORITHM environment variables must be set")
    return _SECRET_KEY, _ALGORITHM

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
  SECRET_KEY, ALGORITHM = _get_jwt_config()
  return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)


def get_current_user(token:Annotated[str, Depends(oauth2_bearer)]):
  try:
    SECRET_KEY, ALGORITHM = _get_jwt_config()
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])

    email = payload.get('email')
    user_id = ObjectId(payload.get('_id'))
    role = payload.get('role')
    name = payload.get('name')
    trial = payload.get('trial', False)  # Extract trial flag from token
    if email is None or user_id is None or role is None or name is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")
    return {'email' : email, '_id' : user_id, "role" : role, "name" : name, "trial": trial}
  except JWTError:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")

#--------------------------------------end points------------------------------------------------------# 

@router.post("/submit_login")
async def handle_login(request: Request, username: str = Form(...), password: str = Form(...)):
    user = authenticate_user(username, password, get_data())
    token = create_access_token(user["email"], str(user["_id"]), user["role"], user["name"], timedelta(minutes=60))

    # Keep login response fast while always initializing indexes in the background.
    async def init_indexes() -> None:
        db = get_data()
        print(f"Starting index initialization for user {user['email']}")
        try:
            # Import inside async task so login path does not pay import cost.
            from src.routers.dense import update_faiss_index, update_foods_list
            from src.routers.sparse import _get_client as get_typesense_client
            from src.routers.sparse import update_sparse_index

            tasks = []
            typesense_client = get_typesense_client()
            needs_typesense_update = False

            if typesense_client:
                try:
                    typesense_client.collections["foods"].retrieve()
                except Exception:
                    needs_typesense_update = True
                try:
                    typesense_client.collections["nutrients"].retrieve()
                except Exception:
                    needs_typesense_update = True

            if needs_typesense_update:
                tasks.append(update_sparse_index(db=db, user=user))

            faiss_path = os.getenv("FAISS_BIN")
            if not (faiss_path and os.path.exists(faiss_path) and os.path.getsize(faiss_path) > 0):
                tasks.append(update_faiss_index(db=db, user=user, request=request))
            else:
                request.app.state.faiss_index = faiss.read_index(faiss_path)

            id_list_path = os.getenv("FOOD_ID_CACHE")
            if not (id_list_path and os.path.exists(id_list_path) and os.path.getsize(id_list_path) > 0):
                tasks.append(update_foods_list(db=db, user=user, request=request))
            else:
                with open(id_list_path, "rb") as f:
                    request.app.state.id_name_map = pickle.load(f)

            if tasks:
                await asyncio.gather(*tasks, return_exceptions=True)
        except Exception as e:
            print(f"Error in background index initialization: {e}")

    try:
        asyncio.create_task(init_indexes())
    except Exception as e:
        print(f"Failed to schedule background index initialization: {e}")

    return JSONResponse(content={"access_token": token, "token_type": "bearer"}, status_code=200)
    

@router.get("/check-user")
def check_user(username: str, user_db : Database = Depends(get_data)):
  print("arstarstarst")
  user = user_db.users.find_one({"email" : username})
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  return JSONResponse(content={"msg" : ""}, status_code=200)
