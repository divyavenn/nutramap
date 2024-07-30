from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
from pydantic import BaseModel, Field


class LogCreate(BaseModel):
    user_id: str
    food_id: int
    amount_in_grams: float
    
    class Config:
        json_schema_extra = {
            'example': {
                'user_id': '66a83ce870cf597258c87888',
                'food_id' : 170903,
                'amount_in_grams' : 20
                }
        }
    
class Log(BaseModel):
    log_id: Optional[str] = Field(alias="_id")
    user_id: str
    food_id: int
    date: Optional[datetime]
    amount_in_grams: float
    
    @field_validator('log_id', 'user_id')
    def validate_objectid(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        
        json_schema_extra = {
            'example': {
                'user_id': '66a83ce870cf597258c87888',
                'food_id' : 170903,
                'amount_in_grams' : 20
                }
        }

class Requirement(BaseModel):
    user_id: str
    nutrient_id: int
    amt: float
    # is the requirement to meet/exceed the target? if so, equals True. to stay below target, equals False
    should_exceed : bool
    
    @field_validator('nutrient_id', 'user_id')
    def validate_objectid(cls, v):
        if isinstance(v, ObjectId):
            return str(v)
        return v

    class Config:
        arbitrary_types_allowed = True
        json_encoders = {ObjectId: str}
        
        json_schema_extra = {
            'example': {
                'user_id': '66a83ce870cf597258c87888',
                'nutrient_id': '1003',
                'amt' : '100',
                'greater_than' : True
                }
        }

class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: str


class User(BaseModel):
    user_id: Optional[str] = Field(alias="_id")
    name: str
    email: EmailStr
    password_hash: str

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