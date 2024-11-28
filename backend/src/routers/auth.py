from fastapi import APIRouter, Depends, HTTPException, Request, Form
from fastapi.security import OAuth2PasswordBearer
from pymongo.database import Database
from typing_extensions import Annotated
import hashlib
from jose import jwt, JWTError
from datetime import timedelta, timezone, datetime 
from fastapi.responses import JSONResponse
from bson import ObjectId

from src.databases.mongo import get_data

__package__ = "nutramap.routers"

router = APIRouter(
  # groups API endpoints together
  prefix='/auth', 
  tags=['auth']
)

# generated randomly using openssl rand -hex 32 
SECRET_KEY = "477314e10396029985ce1f3ceca306576019414187572f61126b4da128e2adaf"
# 
ALGORITHM = "HS256" 


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

@router.post("/submit_login")
def handle_login(username: str = Form(...), password: str = Form(...)):
    user = authenticate_user(username, password, get_data())
    token = create_access_token(user["email"], str(user["_id"]), user["role"], user["name"], timedelta(minutes=60))
    # Return the token in the response body
    return JSONResponse(content={"access_token": token, "token_type": "bearer"}, status_code=200)
    

@router.get("/check-user")
def check_user(username: str, user_db : Database = Depends(get_data)):
  print("arstarstarst")
  user = user_db.users.find_one({"email" : username})
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  return JSONResponse(content={"msg" : ""}, status_code=200)

