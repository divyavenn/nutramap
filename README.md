# nutramap

What can't be measured can't be managed - in other words, you're probably more of a fatass than you think.

A key factor in dysfunctional eating is not knowing what's going in your mouth.  No accurate, seamless interface exists for finding and tracking the nutritional composition of an item or recipe. 

Nutramapper is a comprehensive service for meal planning, analysis, and nutrition tracking - designed by home cooks, for home cooks. 

It uses data from the USDA Economic Research Service to provide incredibly thorough data on foodstuffs by weight - the only lifestyle change needed by the user is to weigh what they cook with/eat on a kitchen scale and jot it down.

Entry into the database is made simple using autocomplete. You choose which nutrients and macros to track - Nutramapper will make you aware of any shortcomings of your diet and suggest you foods that will correct that deficiency. You can add the nutrient profiles for prepared foodstuffs and packaged foods.

 
## Developer Setup 

#### Package Management (using conda)
- `conda create -n nutramapEnv python=3.8`
- `conda activate nutramapEnv`
- `chmod u+x install_reqs.sh`
- `conda install -c conda-forge fastapi`
- `conda install -c conda-forge uvicorn`
- `conda install -c conda-forge sqlalchemy`
- `conda install -c conda-forge typing-extensions`
- `conda install -c conda-forge python-multipart`
- `conda -install -c conda-forge  aiofiles`
- 
- `./install_reqs.sh`

Make sure to select your environment-specific interpreter in Visual Studio.

#### Testing
To run backend: `uvicorn backend.main:app --reload`
To run frontend: `npm run dev`

#### Manual Inspection of Databases
 I recommend DBVisualizer for relational dbs and MongoDB Compass for noSQL