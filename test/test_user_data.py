from fastapi.testclient import TestClient
from ..databases.main_connection import get_session, Base
from ..routers.user_data import user_db_dependency, user_dependency, food_db_dependency
from fastapi import status
import pytest
import unittest


from ..main import app

__package__ = "nutramap.test"
__name__ = 'nutramap.test.test_user_data'

client = TestClient(app)
 
def get_test_user():
  return {'email' : 'somebody@gmail.com', 
          '_id': 2,
          'name' : 'John Doe',
          'password_hash' : 'arstd',
          'role' : 'user'}
  
def get_test_admin():
  return {'email' : 'admin@gmail.com', 
          '_id': 1,
          'name' : 'Jane Doe',
          'password_hash' : 'arstd',
          'role' : 'admin'}


class Tests(unittest.TestCase):
  
  def testOne(self):
    response = client.post("/new")
    assert response.status_code == 404
    assert response.json() == {}
    
unittest.main() 