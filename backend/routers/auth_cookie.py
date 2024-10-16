from fastapi import APIRouter, Depends, HTTPException, Request, Form, Response
from fastapi.security import OAuth2PasswordRequestForm, OAuth2PasswordBearer
from pymongo.database import Database
from typing_extensions import Annotated
import hashlib
from jose import jwt, JWTError
from datetime import timedelta, timezone, datetime 
from fastapi.templating import Jinja2Templates
from fastapi.responses import JSONResponse
from nutramap.backend.imports import templates


from ..databases.main_connection import get_user_data

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

#just for documentation - this is the endpoint where the token in generated
oauth2_bearer = OAuth2PasswordBearer(tokenUrl='/auth/submit_login')


def hash_password(password: str) :
  return hashlib.sha256(password.encode()).hexdigest()

### Pages ##
@router.get("/login")
def render_login(request: Request):
  return templates.TemplateResponse("login.html", {"request" : request})

@router.post("/submit_login")
# this is a version that would return the token as a cookie
def handle_login_cookie(response: Response, email: str = Form(...), password: str = Form(...)):
  #return {"email" : email, "password" : password}
  try:
    user = authenticate_user(email, password, get_user_data())
    token = create_access_token(user["email"], user["_id"], user["role"], timedelta(minutes=60))
    
    # Set a cookie in the response
    response.set_cookie(
        key="access_token",          # Name of the cookie
        value=token,          # The token value
        httponly=True,               # JavaScript can't access this cookie (prevents XSS)
        max_age=3600,                # Expiration time in seconds (1 hour)
        expires=3600,                # Expiration time in seconds (same as max_age)
        secure=True,                 # Only send the cookie over HTTPS (use in production)
        samesite="Lax"               # CSRF protection: don't send cookies on cross-site requests
    )

    # Return a JSON response with a success message
    return JSONResponse(content={"message": "Login successful"}, status_code=200)
    
  except HTTPException as e:
    # Handle invalid credentials or user not found
    return JSONResponse(content={"error": str(e.detail)}, status_code=400)
  
@router.get("/register")
def render_register(request: Request):
  return templates.TemplateResponse("register.html", {"request" : request})

### End points ### 

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
  
def create_access_token(email : str, user_id: int, role: str, expires : timedelta):
  encode = {'email': email, '_id': user_id, 'role' : role}
  expires = datetime.now(timezone.utc) + expires
  encode.update({'exp': expires})
  return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)

@router.post("/token") 
async def login_for_access_token(form_data : Annotated[OAuth2PasswordRequestForm, Depends()], user_db: Database = Depends(get_user_data)):
  user = authenticate_user(form_data.username, form_data.password, user_db)
  token = create_access_token(user["email"], user["_id"], user["role"], timedelta(minutes=60))
  return {'access_token': token, 'token_type': 'bearer'}

  return get_info_from_token(token)

def get_info_from_token(token):
  try: 
    payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    
    email = payload.get('email')
    user_id = payload.get('_id')
    role = payload.get('role')
    
    if email is None or user_id is None or role is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")
    return {'email' : email, '_id' : user_id, "role" : role}
  except JWTError:
    if email is None or user_id is None or role is None:
      raise HTTPException(status_code = 401, detail = "Unauthorized; could not validate credentials.")
    
def get_current_user_cookie(request: Request):
    # Extract the token from the cookie instead of the Authorization header
    token = request.cookies.get("access_token")
    
    if token is None:
        # If the token is not found in the cookies, raise an error
        raise HTTPException(status_code=401, detail="Not authenticated")

    try:
        # Verify the token and return the user data (this logic remains unchanged)
        return get_info_from_token(token)
    except Exception as e:
        raise HTTPException(status_code=403, detail="Invalid token or expired")
  
        
