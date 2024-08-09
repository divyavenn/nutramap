from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pymongo.database import Database
from typing_extensions import Annotated
from databases.user_data_connect import get_user_data
import hashlib
from jose import jwt, JWTError
from datetime import timedelta, timezone, datetime


router = APIRouter(
  # groups API endpoints together
  prefix='/auth', 
  tags=['auth']
)

# generated randomly using openssl rand -hex 32 
SECRET_KEY = "477314e10396029985ce1f3ceca306576019414187572f61126b4da128e2adaf"
# 
ALGORITHM = "HS256" 

#create way for other endpoints to verify user
oauth2_bearer = OAuth2PasswordBearer(tokenUrl='auth/token')



def hash_password(password: str) :
  return hashlib.sha256(password.encode()).hexdigest()

def authenticate_user(email: str, password: str, user_db : Database) :
  user = user_db.users.find_one({"email" : email})
  if not user:
    raise HTTPException(status_code=404, detail="User not found")
  password_hash = hash_password(password)
  # check if hashed password input equals stored hash
  if user["password_hash"] == password_hash:
    return user
  else:
    raise HTTPException(status_code=404, detail="Incorrect password")
  
def create_access_token(email : str, user_id: int, expires : timedelta):
  encode = {'email': email, '_id': user_id}
  expires = datetime.now(timezone.utc) + expires
  encode.update({'exp': expires})
  return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/token") 
async def login_for_access_token(form_data : Annotated[OAuth2PasswordRequestForm, Depends()], user_db: Database = Depends(get_user_data)):
  user = authenticate_user(form_data.username, form_data.password, user_db)
  token = create_access_token(user["email"], user["_id"], timedelta(minutes=60))
  return {'access_token': token, 'token_type': 'bearer'}

async def get_current_user(token:Annotated[str, Depends(oauth2_bearer)]):
  try: 
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    
    email = payload.get('email')
    user_id = payload.get('_id')
    
    if email is None or user_id is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials." )
    return {'email' : email, '_id' : user_id}
  except JWTError:
    if email is None or user_id is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials." )