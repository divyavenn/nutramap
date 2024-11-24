from sqlalchemy import Column, Integer, String, ForeignKey, DECIMAL, Float, Date, PrimaryKeyConstraint
from sqlalchemy.orm import relationship
from .sqlite_data_connect import Base

__package__ = "nutramap.backend.databases"

# Food data
class Nutrient(Base):
  __tablename__= 'nutrient'
  
  @staticmethod
  def to_str():
    return "nutrient" 
  
  primary = ['nutrient_id']
  secondary = ['nutrient_name', 'unit']
  
  # primary
  nutrient_id = Column(Integer, primary_key = True, index = True)
  nutrient_name = Column(String, index = True)
  unit = Column(String)
  
  # relationships
  #requirement = relationship("Requirement", back_populates='nutrient') 
  # first argument matches class name
  # back_populates matches relationship in other class
  data = relationship("Data", back_populates = 'nutrient') 

class Data(Base):
  __tablename__= 'data'
  
  @staticmethod
  def to_str():
    return "data" 
  
  primary = ['food_id', 'nutrient_id']
  secondary = ['amt']
  
  # primary
  food_id = Column(Integer, ForeignKey('food.food_id'), index = True)
  nutrient_id = Column(Integer, ForeignKey('nutrient.nutrient_id'), index = True)
  amt = Column(DECIMAL(13,3))
  
  # sets up composite primary key
  __table_args__ = (PrimaryKeyConstraint('food_id', 'nutrient_id'),)
  
  # relationships
  nutrient = relationship("Nutrient", back_populates='data') 
  food = relationship("Food", back_populates = 'data') 
  
class Food(Base):
  __tablename__= 'food'
  @staticmethod
  def to_str():
    return "food" 
  
  primary = ['food_id']
  secondary = ['food_name']
  
  # primary
  food_id = Column(Integer, primary_key = True)
  food_name = Column(String)
  
  
  # relationships
  data = relationship('Data', back_populates='food')
  #log = relationship('Log', back_populates='food') #
  



