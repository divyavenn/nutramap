import csv
from sqlalchemy.orm import Session
from databases.food_data_connect import SessionLocal, engine, Base
from databases.food_models import Nutrient, Food, Data
import os

Base.metadata.create_all(bind=engine)


def get_food_info (csv_row):
    # values in CSV row
    fdc_id, data_type, description, food_category_id, publication_date = csv_row
    # create and add entry to Food 
    return {'food_id' : int(fdc_id),
            'food_name' : description}
    
def get_nutrient_info (csv_row):
    # values in CSV row
    nutrient_id, name, unit_name, nutrient_nbr, rank = csv_row
    # create and add entry to  Nutrient 
    return {'nutrient_id' : int(nutrient_id),
            'nutrient_name' : name.strip(),
            'unit' : unit_name.strip()}

def get_data_info (csv_row):
    # values in CSV row
    id, fdc_id,	nutrient_id, amount, data_points, derivation_id, min,max, median, footnote, min_year_acquired = csv_row
    
    return {'food_id' : int(fdc_id),
            'nutrient_id' : int(nutrient_id),
            'amt' : float(amount)}

get_info_for_model = {Nutrient : get_nutrient_info,
                      Food: get_food_info,
                      Data: get_data_info}
    
def update(session, model, primary, secondary, log = True):
    #check if exists
    existing_record = session.query(model).filter_by(**primary).first()
    # if exists, update
    if existing_record:
      for label in secondary:
        setattr(existing_record, label, secondary[label])
      
      if log:
        msg = "Updated record "
        for primary_key in primary:
          msg += f" {primary_key} : {primary[primary_key]}"
        msg += " from "
        for label in secondary:
          msg += f" {label} : {getattr(existing_record, label)}"
        msg += " to "
        for label in secondary:
          msg += f" {label} : {secondary[label]}."
        print (msg)
      return True
    return False

def catch_error(e : Exception, session, commit_log):
  # print error and offending rows
  print(str(e))
  for row in commit_log:
    print(f" {row}   :   {commit_log[row]}")
  # roll back commit
  session.rollback()
  
def try_commit(session : Session, commit_log, log = True):
    try:
      session.commit()
      if log:
        print(f"Sucessfully commited {len(commit_log)} rows.")
      # reset commit log
      commit_log.clear()
      # tell calling function it worked
      return True
    except Exception as e:
      catch_error(e, session, commit_log)
      return False
    

def dict_to_str (map):
  s = ""
  for m in map.values():
    s = s + str(m) + ", " 
  return s[:-2]
  
def add_entry (session, model, csv_row, commit_log, log = False):
  success = True
  # values in CSV row
  info = get_info_for_model[model](csv_row)
  # hashmap of primary key variable names and values
  primary = {var: info[var] for var in model.primary}
  primary_key_string = dict_to_str(primary)
  
  # check if there is a duplicate value in commit log, if so, commit all rows so update can take care of it
  if primary_key_string in commit_log.keys():
    success = success and try_commit(session, commit_log)
    
  
  # hashmap of other variable names and values
  secondary = {var: info[var] for var in model.secondary}
  secondary_key_string = dict_to_str(secondary)
  
  # update entry if exists - only checks already committed rows
  if not update(session,
                model,
                primary = primary,
                secondary = secondary):
    # if not, insert new entry
    session.add(model(**info))
    
    if log:
      msg = "Inserted record "
      for i in info:
        msg += f" {i} : {info[i]},"
      print(msg)
    
  # add the primary keys + other values to the commit log hashmap
  commit_log[primary_key_string] = secondary_key_string
  return success
  
  
  
def load_data(file_path, model, titles = True, batch_size = 10, overwrite = True):
    if overwrite:
      # Drop the existing table
      model.__table__.drop(engine)
      # Recreate the table
      Base.metadata.create_all(bind=engine)
      
    session = SessionLocal()
    success = True

    try:
      with open(file_path, mode='r') as file:
        reader = csv.reader(file)
        
        # this is to keep track of the rows we're commiting
        commit_log = {}
        
        for row in reader:
          # skip header row if exists
          if titles:
            titles = False
            continue

          # convert data to Model form, either insert or update entry
          try: 
            success = success and add_entry(session, model, row, commit_log)
          # suppress empty/malformed rows
          except ValueError as ve:
            print(f"Skipping invalid row: {row} due to error: {ve}")
            return
      
          # if batch is filled, commit
          if len(commit_log) % batch_size == 0:
            success = success and try_commit(session, commit_log)  
      
        # this commits all rows if not doing batches, catches any leftover rows if we are.
        success = success and try_commit(session, commit_log)
        
    finally:
      if success:
        print(model.to_str() + " loaded!")
      session.close()

# Load data from the CSV file
base_dir = os.path.dirname(os.path.abspath(__file__))

load_data(base_dir + '/databases/Archive/nutrient.csv', batch_size= 500, model=Nutrient)
load_data(base_dir + '/databases/Archive/food.csv', batch_size = 500, model=Food)
load_data(base_dir + '/databases/Archive/food_nutrient.csv', batch_size=300, model=Data)