from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.ext.declarative import declarative_base

__package__ = "nutramap.databases"

URL = 'postgresql://'

# configures connection
engine = create_engine(URL)

# a factory for creating new Session objects, used for database transactions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# factory function that creates base class for class definitions - mapping classes to database tables
Base = declarative_base()

def get_session():
  db = SessionLocal()
  try:
    # returns session to caller of function, delaying finally block until caller is finished using it
    # turns function into generator function
    # keeps track of function's state when yield is called; once function is called again, will resume where it left off.
    yield db
  finally:
    db.close()
    
