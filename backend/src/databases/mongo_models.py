from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List, Dict, Union
from datetime import datetime
from bson import ObjectId


__package__ = "nutramap.databases"

class LogCreate(BaseModel):
    food_id: int
    amount_in_grams: float
    date: datetime
    
    class Config:
        json_schema_extra = {
            'example': {
                'food_id' : 170903,
                'amount_in_grams' : 20,
                'date' : "2024-10-16T10:15:30.000Z"
                }
        }

class LogEdit(BaseModel):
    food_id: int
    amount_in_grams: float
    date: datetime
    log_id: str
           
class Log(BaseModel):
    log_id: str = Field(alias="_id") 
    user_id: Optional[str] 
    food_id: int
    amount_in_grams: float
    date: Optional[datetime] 
    
    @field_validator('log_id', 'user_id')
    def validate_objectid(cls, v):
        if v is None:  # Skip validation if the field is missing
            return v
        if isinstance(v, ObjectId):
            return str(v)
        return v

class Recipe(BaseModel):
    recipe_id: str = Field(alias="_id") 
    user_id: Optional[str] 
    foods: List[Dict[int, float]]
    
    @field_validator('recipe_id', 'user_id')
    def validate_objectid(cls, v):
        if v is None:  # Skip validation if the field is missing
            return v
        if isinstance(v, ObjectId):
            return str(v)
        return v
    

class RequirementCreate(BaseModel):
    nutrient_id: int
    amt: float
    # is the requirement to meet/exceed the target? if so, equals True. to stay below target, equals False
    should_exceed : bool
    
    class Config:
        json_schema_extra = {
            'example': {
                'nutrient_id': '1003',
                'amt' : '100',
                'should_exceed' : True
            }
     }
    
    
class Requirement(BaseModel):
    user_id: Optional[str]
    nutrient_id: int
    amt: float
    # is the requirement to meet/exceed the target? if so, equals True. to stay below target, equals False
    should_exceed : bool
    
    @field_validator('user_id')
    def validate_objectid(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class User(BaseModel):
    user_id: Optional[str] = Field(alias="_id")
    name: str
    email: EmailStr
    password_hash: str
    role: str

    @field_validator('user_id')
    def validate_objectid(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v
      
    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        json_schema_extra = {
            'example': {
                'name': 'Divya Venn',
                'email': 'venn.divya@gmail.com',
                'password' : '1234',
                }
        }