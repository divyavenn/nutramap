# Nutrient Database Cleanup and Embedding Generation

This script cleans up your nutrients database and generates embeddings for better semantic matching.

## What It Does

1. **Finds Used Nutrients**: Scans all foods to identify which nutrients are actually in use
2. **Removes Unused Nutrients**: Deletes nutrients that aren't referenced by any food
3. **Generates Embeddings**: Creates OpenAI embeddings for all remaining nutrients

## Why Run This?

- **Better Matching**: Enables semantic search to match nutrient variations (e.g., "Total lipid (fat)" → "Fat")
- **Database Cleanup**: Removes unused nutrients to reduce clutter and improve performance
- **Smaller Database**: Only keeps nutrients that are actually used

## How to Run

From the backend directory:

```bash
cd /Users/divyavenn/Documents/GitHub/nutramap/backend
python -m src.scripts.cleanup_and_embed_nutrients
```

## What to Expect

The script will:

1. Connect to your MongoDB database
2. Scan all foods to find which nutrients are used
3. Show you which nutrients will be deleted (requires confirmation)
4. Generate embeddings for remaining nutrients
5. Display a summary of changes

## Sample Output

```
================================================================================
NUTRIENT DATABASE CLEANUP AND EMBEDDING GENERATION
================================================================================
Connecting to MongoDB: nutramapper

================================================================================
STEP 1: Finding nutrients used in foods
================================================================================

Scanning foods collection...
✓ Scanned 15,234 foods
✓ Found 187 unique nutrients in use

================================================================================
STEP 2: Finding unused nutrients
================================================================================

✓ Total nutrients in database: 412
✓ Unused nutrients found: 225

⚠️  About to delete 225 unused nutrients
First 10 examples:
  - Vitamin K (phylloquinone) (ID: 430)
  - Fatty acids, total trans-monoenoic (ID: 605)
  ... and 215 more

Proceed with deletion? (yes/no): yes
✓ Deleted 225 unused nutrients

================================================================================
STEP 3: Generating embeddings for remaining nutrients
================================================================================

✓ Nutrients without embeddings: 187

🔄 Generating embeddings for 187 nutrients...
  Progress: 10/187 (5.3%)
  Progress: 20/187 (10.7%)
  ...
  Progress: 187/187 (100.0%)

✓ Successfully generated 187 embeddings

================================================================================
SUMMARY
================================================================================

✓ Total nutrients in database: 187
✓ Nutrients with embeddings: 187
✓ Nutrients in use by foods: 187

✅ Cleanup and embedding generation complete!
```

## Safety

- The script asks for confirmation before deleting nutrients
- Only nutrients not referenced by any food are deleted
- Original data is preserved if you answer "no" to the deletion prompt

## Requirements

- MongoDB connection configured in `.env`
- OpenAI API key configured in `.env`
- All dependencies installed (`pip install -r requirements.txt`)

## Notes

- The embedding generation uses `text-embedding-3-large` model
- Each embedding generation makes an API call to OpenAI (costs apply)
- The script shows progress indicators for long operations
- Failed embeddings are logged but don't stop the script
