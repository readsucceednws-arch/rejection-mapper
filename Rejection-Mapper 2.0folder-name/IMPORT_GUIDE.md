# Robust CSV/Excel Import Implementation Guide

## Overview

I've implemented a production-ready import system for your Rejection Mapper application that handles messy, real-world data gracefully. The solution includes:

✅ **Robust field normalization** (trim, lowercase, flexible matching)
✅ **Fallback creation logic** (auto-creates missing parts, rejection types, rework types, zones)
✅ **Detailed error handling** (skips invalid rows instead of failing completely)
✅ **Comprehensive logging** (debug what's happening and why rows fail)
✅ **Dry-run mode** (preview errors before importing)
✅ **Case-insensitive & flexible matching** (handles "Part A" vs "PART A")

---

## Files Created/Modified

### 1. **server/import-utils.ts** (NEW)
Utility functions for data normalization, matching, and logging.

**Key Functions:**
```typescript
normalizeText(value)           // Trim whitespace
normalizeForMatching(value)    // Case-insensitive, flexible matching
normalizeCode(value)           // Uppercase codes, handle dashes
safeNumber(value)              // Parse numbers safely
safeDate(value)                // Parse dates (DD-MM-YYYY, YYYY-MM-DD, MM/DD/YYYY, etc.)
flexibleMatch(a, b)            // Compare with flexible matching
getRowCell(row, colName)       // Get value from row with flexible column matching
```

**Logging:**
```typescript
ImportLogger  // Tracks all import operations with debug/info/warn/error levels
```

### 2. **server/routes.ts** (MODIFIED)
Added new endpoint: `POST /api/import-entries`

---

## New Import Endpoint

### Endpoint: `POST /api/import-entries`

**Authentication:** ✅ Admin required

**Request Body:**
```json
{
  "rows": [
    {
      "Date": "2024-03-15",
      "Part Number": "Part A",
      "Type": "Rejection",
      "Code": "CODE-001",
      "Purpose": "Surface Defect",
      "Zone": "Assembly",
      "Quantity": "5",
      "Remarks": "Found during inspection"
    }
  ],
  "dryRun": true  // Optional: true to preview without inserting
}
```

**Flexible Column Matching:**
The endpoint automatically detects column names (case-insensitive):
- ✅ "Date", "date", "DATE", "Entry Date", "entry_date"
- ✅ "Part Number", "part_number", "Part No", "PN", "Part", "Item"
- ✅ "Type", "type", "Entry Type", "Category"
- ✅ "Code", "code", "Rejection Code", "Rework Code"
- ✅ "Purpose", "Reason", "Description"
- ✅ "Zone", "zone"
- ✅ "Quantity", "quantity", "Qty", "QTY"
- ✅ "Remarks", "Notes"

**Response:**
```json
{
  "success": true,
  "message": "Imported 98 of 100 rows",
  "summary": {
    "totalRows": 100,
    "successfulImports": 98,
    "failedRows": [
      {
        "success": false,
        "rowIndex": 15,
        "reason": "Missing part number"
      }
    ],
    "created": {
      "parts": 5,
      "rejectionTypes": 3,
      "reworkTypes": 0,
      "zones": 2
    },
    "warnings": []
  },
  "logs": [
    "[IMPORT] [INFO] Starting import of 100 rows | {\"dryRun\": true}",
    "[IMPORT] [DEBUG] Loaded existing data | {...}",
    ...
  ]
}
```

---

## Key Features

### 1. **Whitespace Handling**
- All fields are trimmed automatically
- Extra spaces are normalized
- Works with data like: `"  Part A  "` → `"Part A"`

### 2. **Case-Insensitive Matching**
- `"part_a"` matches `"Part A"`
- `"REJECTION"` type matches `"rejection"`
- `"CODE-001"` matches `"code-001"`

### 3. **Flexible Column Detection**
Automatically recognizes various column name variations:
```
Part Number ≈ Part No ≈ PN ≈ part_number
Rejection Code ≈ Code ≈ rejection_code ≈ Reason (fallback)
Date ≈ entry_date ≈ Entry Date
...
```

### 4. **Fallback Creation**
If a referenced entity doesn't exist, it's created automatically:

```typescript
// If "Part A" doesn't exist → Created automatically
// If "CODE-001" rejection code doesn't exist → Created
// If "Assembly" zone doesn't exist → Created

// Instead of: ❌ FAILED - Part not found
// You get: ✅ Created new part "Part A"
```

### 5. **Graceful Error Handling**
- **Invalid rows are skipped**, not fatal errors
- Summary shows exactly which rows failed and why
- Returns detailed error messages for debugging

### 6. **Detailed Logging**
Every step is logged:
```
[IMPORT] [INFO] Starting import of 100 rows
[IMPORT] [DEBUG] Loaded existing data | {parts: 50, ...}
[IMPORT] [INFO] Creating new part: Part A
[IMPORT] [DEBUG] Processing row 15 | {part: "Part B", code: "CODE-002", ...}
[IMPORT] [WARN] Row 20: Missing rejection code
[IMPORT] [ERROR] Row 45: Exception during processing
```

### 7. **Dry Run Mode**
Preview what will be imported without actually inserting:
```json
{
  "dryRun": true
}
```

Returns the same summary, but no data is inserted.

---

## Usage Examples

### Basic Import (with flexible matching)

```bash
curl -X POST http://localhost:3000/api/import-entries \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [
      {
        "date": "2024-03-15",
        "part_number": "Part A",
        "type": "rejection",
        "code": "DEF-001",
        "purpose": "Surface Defect",
        "zone": "Assembly",
        "quantity": "5",
        "remarks": "Found during inspection"
      }
    ]
  }'
```

### Dry Run (Preview Before Import)

```bash
curl -X POST http://localhost:3000/api/import-entries \
  -H "Content-Type: application/json" \
  -d '{
    "rows": [...],
    "dryRun": true
  }'
```

### Handling Messy Data

Input CSV with issues:
```csv
Date,PART No,Type,Code,Description,Zone,Qty
2024-03-15,  Part A  ,Rejection,  CODE-001  ,Surface Defect,  Assembly  ,  5  
2024-03-16,Part B,REWORK,code-002,Electrical,assembly,  3
```

✅ All variations are automatically normalized:
- Extra spaces trimmed
- Case differences handled
- Code formatting normalized
- Will successfully create entries and new entities as needed

---

## Data Flow

```
CSV/Excel Input
       ↓
Normalize & Validate
       ↓
       ├─→ Look up Part (flexible matching)
       │    └─→ Not found? Create it ✅
       │
       ├─→ Look up Rejection/Rework Type (flexible matching)
       │    └─→ Not found? Create it ✅
       │
       ├─→ Look up Zone (flexible matching)
       │    └─→ Not found? Create it ✅
       │
       └─→ Insert Entry with all IDs
            └─→ Success ✅ or Log Error ⚠️
       ↓
Return Summary with:
  - Count of successful imports
  - List of failed rows with reasons
  - Count of created entities
  - Detailed logs for debugging
```

---

## Error Examples & Handling

### Missing Required Fields
```
Row 15: Missing part number
→ Row is skipped, import continues
```

### Invalid Quantity
```
Row 20: Invalid quantity: "abc"
→ Row is skipped, import continues
```

### Missing Type (Rejection vs Rework)
```
Row 25: Type field blank, assumes "rejection"
→ Row processes successfully
```

### Date Parsing
```
Row 30: Date "01-04-2025" (DD-MM-YYYY) → Parsed correctly
Row 31: Date "2025-04-01" (YYYY-MM-DD) → Parsed correctly
Row 32: Date "04/01/2025" (MM/DD/YYYY) → Parsed correctly
Row 33: Date "invalid" → Falls back to current date
→ All rows process successfully
```

---

## Production Tips

### 1. **Start with Dry Run**
Always preview before importing large datasets:
```json
{
  "rows": [...],
  "dryRun": true
}
```

### 2. **Monitor the Logs**
Use the `logs` array in response to debug issues:
```typescript
const response = await fetch('/api/import-entries', {...});
const data = await response.json();
console.log(data.logs); // Review what happened
```

### 3. **Check the Summary**
Review created entities and failed rows:
```typescript
console.log(`Imported: ${data.summary.successfulImports}/${data.summary.totalRows}`);
console.log(`Created: ${data.summary.created.parts} new parts`);
console.log(`Failed: ${data.summary.failedRows.length} rows`);
```

### 4. **Common Data Issues & Solutions**

| Issue | Solution |
|-------|----------|
| Extra spaces in Part Number | ✅ Automatically trimmed |
| Mixed case codes (Code-001 vs CODE-001) | ✅ Normalized |
| Missing quantity | ✅ Defaults to 1 |
| Missing date | ✅ Uses current date |
| Unknown part/code | ✅ Creates automatically |
| Empty remarks | ✅ Stored as NULL |

---

## Cancelling Long-Running Imports

For large imports (1000+ rows), you may want the ability to stop the process:

### Step 1: Start an Import
```bash
curl -X POST http://localhost:3000/api/import-entries \
  -H "Content-Type: application/json" \
  -d '{"rows": [...]}'
```

Response includes `importId`:
```json
{
  "success": true,
  "message": "Imported 250 of 1000 rows",
  "importId": "abc123def456...",
  "summary": {...}
}
```

### Step 2: Cancel While Running
If import is still processing, call the cancel endpoint:
```bash
curl -X POST http://localhost:3000/api/import-entries/abc123def456.../cancel \
  -H "Content-Type: application/json"
```

Response:
```json
{
  "success": true,
  "message": "Import cancellation requested. Current row processing will halt.",
  "importId": "abc123def456..."
}
```

### How It Works
- Import will finish the **current row** it's processing
- Then stop and return a summary showing:
  - Rows imported before cancellation
  - Entities created
  - Cancellation flag
- Example: `"Import cancelled at row 250. 250 of 1000 rows imported before cancellation."`

### React Hook Usage
```typescript
import { useImportEntries } from '@/hooks/use-import-entries-bulk';

function MyComponent() {
  const { importEntries, cancelImport, currentImportId, isImporting } = useImportEntries();

  const handleImport = async () => {
    await importEntries(rows);
  };

  const handleCancel = async () => {
    await cancelImport(); // Cancels current import
  };

  return (
    <div>
      <button onClick={handleImport} disabled={isImporting}>
        Start Import
      </button>
      <button onClick={handleCancel} disabled={!isImporting || !currentImportId}>
        Cancel Import
      </button>
      {currentImportId && <p>Import ID: {currentImportId}</p>}
    </div>
  );
}
```

---

## Regarding the "Reason" Column

I reviewed the recent-entries.tsx table and did not find a visible "Reason" column in the display. The table currently shows:
- Date
- Part Number
- Type (Rejection/Rework)
- Code
- Purpose
- Zone
- Logged By
- Quantity
- Remarks

The `reason` field exists in the database as part of rejection/rework types, but is not displayed as a separate column in the entries table. If you'd like to hide it from dropdowns or elsewhere, please let me know the specific location.

---

## Testing the Import

### From Frontend (React)
Create a hook or function to call the endpoint:

```typescript
async function importEntries(rows: any[], dryRun = false) {
  const response = await fetch('/api/import-entries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ rows, dryRun })
  });
  
  const result = await response.json();
  console.log(`Success: ${result.summary.successfulImports}/${result.summary.totalRows}`);
  console.log('Created:', result.summary.created);
  console.log('Logs:', result.logs);
  
  return result;
}
```

### Sample Test Data
```json
{
  "rows": [
    {
      "Date": "2024-03-15",
      "Part Number": "Widget X1",
      "Type": "Rejection",
      "Code": "SURF-001",
      "Purpose": "Surface Defect",
      "Zone": "Assembly",
      "Quantity": "5",
      "Remarks": "Minor scratches"
    },
    {
      "Date": "2024-03-16",
      "Part Number": "Widget X2",
      "Type": "Rework",
      "Code": "ELEC-002",
      "Purpose": "Electrical Testing",
      "Zone": "QA",
      "Quantity": "3",
      "Remarks": ""
    }
  ],
  "dryRun": false
}
```

---

## Architecture Benefits

✅ **Robustness**: Handles real-world messy data
✅ **Performance**: Efficient lookups with Map-based caching
✅ **User Experience**: Clear error messages for debugging
✅ **Maintainability**: Well-documented, modular code
✅ **Safety**: Dry-run mode for preview
✅ **Reliability**: Graceful degradation (skips bad rows)
✅ **Debugging**: Comprehensive logging

---

## Next Steps

1. **Test the import endpoint** with sample CSV/Excel data
2. **Review the logs** to understand what's happening
3. **Use dry-run mode** before importing real data
4. **Monitor the summary** for created entities and failures
5. **Integrate with frontend** to call the endpoint from your import UI

---

## Questions or Issues?

The import system is production-ready and well-documented. Each function is commented, and logs provide visibility into every step of the import process.

For detailed implementation questions:
- See the inline comments in `server/import-utils.ts`
- Review error messages in the response summary
- Check the logs array for debugging information
