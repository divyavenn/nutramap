#!/usr/bin/env python3
"""
Script to create a single permanent trial user and generate its authentication token.
Run this once to set up the trial user for your application.
"""

import os
from pymongo import MongoClient
from bson import ObjectId
from datetime import datetime, timedelta, timezone
from jose import jwt
from dotenv import load_dotenv

load_dotenv()

# Default requirements for trial users (US RDA for average adult)
# Note: These nutrient names must match exactly what's in the nutrients collection
DEFAULT_REQUIREMENTS = {
    "Protein": 50,
    "Carbohydrate, by difference": 300,  # Changed from "Carbohydrate"
    "Total lipid (fat)": 70,  # Changed from "Fat, total"
    "Fiber, total dietary": 25,
    "Iron, Fe": 18,
    "Vitamin D (D2 + D3)": 20,
    "Vitamin K (phylloquinone)": 120,
}

def get_jwt_config():
    """Get JWT configuration from environment"""
    # Try both SECRET_KEY and JWT_SECRET_KEY for compatibility
    SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError(
            "SECRET_KEY or JWT_SECRET_KEY not found in environment!\n"
            "Please set one of these in your .env file.\n"
            "You can generate one with: openssl rand -hex 32"
        )
    ALGORITHM = os.getenv("ALGORITHM", "HS256")
    return SECRET_KEY, ALGORITHM

def create_long_lived_token(user_id: str, email: str) -> str:
    """Create a long-lived JWT token (10 years) for trial user"""
    SECRET_KEY, ALGORITHM = get_jwt_config()

    encode = {
        'email': email,
        '_id': str(user_id),
        'role': 'user',
        'name': '',  # Empty name for trial users
        'trial': True,
        'exp': datetime.now(timezone.utc) + timedelta(days=3650)  # 10 years
    }

    return jwt.encode(encode, SECRET_KEY, algorithm=ALGORITHM)

def setup_trial_user():
    """Create the single trial user and generate its permanent token"""

    # Connect to MongoDB
    mongo_uri = os.getenv("MONGO_URI")
    db_name = os.getenv("DB_NAME", "nutramap")
    client = MongoClient(mongo_uri)
    db = client[db_name]

    print("=" * 60)
    print("SETTING UP PERMANENT TRIAL USER")
    print("=" * 60)
    print()

    # Check if trial user already exists
    trial_email = "trial@nutramap.app"
    existing_user = db.users.find_one({"email": trial_email})

    if existing_user:
        print(f"⚠️  Trial user already exists with email: {trial_email}")
        print(f"   User ID: {existing_user['_id']}")

        response = input("\nDo you want to regenerate the token? (yes/no): ")
        if response.lower() != 'yes':
            print("Cancelled.")
            return

        user_id = existing_user['_id']
        print(f"\n✓ Using existing trial user")
    else:
        # Create the trial user
        trial_user = {
            "_id": ObjectId(),
            "email": trial_email,
            "first_name": "Trial",
            "last_name": "User",
            "role": "trial",
            "password_hash": "",  # No password for trial user
            "created_at": datetime.now(timezone.utc),
            "is_trial": True,
            "is_permanent_trial": True,  # Flag to prevent cleanup
            "recipes": [],
            "custom_foods": []
        }

        db.users.insert_one(trial_user)
        user_id = trial_user["_id"]
        print(f"✓ Created trial user: {trial_email}")
        print(f"  User ID: {user_id}")

        # Create default requirements
        print(f"\n✓ Creating {len(DEFAULT_REQUIREMENTS)} default requirements...")
        requirements_created = 0

        for nutrient_name, target_value in DEFAULT_REQUIREMENTS.items():
            nutrient = db.nutrients.find_one({"nutrient_name": nutrient_name})
            if nutrient:
                # Check if requirement already exists
                existing_req = db.requirements.find_one({
                    "user_id": user_id,
                    "nutrient_id": nutrient["_id"]
                })

                if not existing_req:
                    requirement = {
                        "user_id": user_id,
                        "nutrient_id": nutrient["_id"],
                        "amt": target_value,
                        "should_exceed": True,
                        "created_at": datetime.now(timezone.utc)
                    }
                    db.requirements.insert_one(requirement)
                    requirements_created += 1
                    print(f"  ✓ {nutrient_name}: {target_value}")
            else:
                print(f"  ✗ WARNING: Nutrient '{nutrient_name}' not found!")

        print(f"\n✓ Created {requirements_created} requirements")

    # Generate the permanent token
    print("\n✓ Generating permanent authentication token...")
    token = create_long_lived_token(str(user_id), trial_email)

    # Output the token
    print("\n" + "=" * 60)
    print("TRIAL USER TOKEN GENERATED")
    print("=" * 60)
    print()
    print("Add this to your .env file:")
    print()
    print(f"TRIAL_USER_TOKEN={token}")
    print()
    print("=" * 60)
    print()
    print("The trial user is now set up and ready to use!")
    print("All 'Try it' clicks will log into this single account.")
    print()

    # Optionally write to .env file
    response = input("Would you like to automatically add this to your .env file? (yes/no): ")
    if response.lower() == 'yes':
        env_path = os.path.join(os.path.dirname(__file__), '../../.env')

        # Read existing .env
        if os.path.exists(env_path):
            with open(env_path, 'r') as f:
                env_content = f.read()

            # Check if TRIAL_USER_TOKEN already exists
            if 'TRIAL_USER_TOKEN=' in env_content:
                # Replace existing token
                lines = env_content.split('\n')
                new_lines = []
                for line in lines:
                    if line.startswith('TRIAL_USER_TOKEN='):
                        new_lines.append(f'TRIAL_USER_TOKEN={token}')
                    else:
                        new_lines.append(line)
                env_content = '\n'.join(new_lines)
            else:
                # Append new token
                if not env_content.endswith('\n'):
                    env_content += '\n'
                env_content += f'\n# Trial user permanent token\nTRIAL_USER_TOKEN={token}\n'

            # Write back
            with open(env_path, 'w') as f:
                f.write(env_content)

            print(f"✓ Added TRIAL_USER_TOKEN to {env_path}")
        else:
            print(f"⚠️  .env file not found at {env_path}")
            print("Please add the token manually.")

    client.close()

if __name__ == "__main__":
    setup_trial_user()
