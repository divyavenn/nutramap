import os
from fastapi.templating import Jinja2Templates

# point app to directory with static formatting files
current_directory = os.path.dirname(os.path.abspath(__file__))
static_folder = os.path.join(current_directory, "static")
templates_folder = os.path.join(current_directory, "templates")

# point app to Jinja templates, which can dynamically render data in HTML 
templates = Jinja2Templates(directory=templates_folder)
