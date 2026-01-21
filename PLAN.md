# Conlang PWA - SQL Database Schema

## Overview
Client-side SQL database structure for a Progressive Web App (PWA) conlang builder. Optimized for mobile performance with indexed lookups and minimal joins.

---

## Database Tables

### 1. Graphemes Table
Stores visual writing symbols (letters, characters, glyphs).
```sql
CREATE TABLE graphemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,           -- "a", "oo", "ph", "sh", etc.
  svg_img TEXT,                         -- SVG data as string
  note TEXT,                            -- User notes for search/organization
  is_compound BOOLEAN DEFAULT FALSE,    -- Is this multiple characters? (e.g., "oo")
  structure_template TEXT,              -- Reserved for future: "{C}_e" patterns (NULL for now)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_grapheme_name ON graphemes(name);
CREATE INDEX idx_grapheme_compound ON graphemes(is_compound);
```

**Fields:**
- `id`: Unique identifier
- `name`: The grapheme as text (e.g., "a", "oo", "ph")
- `svg_img`: SVG markup for custom drawn characters
- `note`: User-defined notes for filtering/searching
- `is_compound`: TRUE if made of multiple base characters
- `structure_template`: Future field for complex patterns (A_E style)
- `created_at`/`updated_at`: Timestamps

---

### 2. Phonemes Table
Stores pronunciation sounds (phonetic units).
```sql
CREATE TABLE phonemes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ipa TEXT NOT NULL UNIQUE,             -- IPA notation: "/ʊ/", "/k/", "/æ/"
  description TEXT,                     -- Human-readable: "short u as in 'book'"
  syllable_position TEXT,               -- "onset", "nucleus", "coda", "any"
  example_word TEXT,                    -- Example word: "book", "cat"
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  CHECK (syllable_position IN ('onset', 'nucleus', 'coda', 'any'))
);

CREATE INDEX idx_phoneme_ipa ON phonemes(ipa);
CREATE INDEX idx_phoneme_position ON phonemes(syllable_position);
```

**Fields:**
- `id`: Unique identifier
- `ipa`: International Phonetic Alphabet notation
- `description`: Plain language description
- `syllable_position`: Where this sound can appear (onset/nucleus/coda/any)
- `example_word`: Example usage for reference

---

### 3. Grapheme-Phoneme Mappings (Junction Table)
Maps graphemes to phonemes (many-to-many relationship).
```sql
CREATE TABLE grapheme_phoneme_mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  grapheme_id INTEGER NOT NULL,
  phoneme_id INTEGER NOT NULL,
  is_primary BOOLEAN DEFAULT TRUE,      -- Is this the default/primary mapping?
  context_rules TEXT,                   -- JSON for future conditional rules (NULL for now)
  use_in_autospell BOOLEAN DEFAULT TRUE, -- Include in automatic word generation?
  priority INTEGER DEFAULT 0,           -- For disambiguation (higher = preferred)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (grapheme_id) REFERENCES graphemes(id) ON DELETE CASCADE,
  FOREIGN KEY (phoneme_id) REFERENCES phonemes(id) ON DELETE CASCADE,
  UNIQUE(grapheme_id, phoneme_id)       -- Prevent duplicate mappings
);

CREATE INDEX idx_gpm_grapheme ON grapheme_phoneme_mappings(grapheme_id);
CREATE INDEX idx_gpm_phoneme ON grapheme_phoneme_mappings(phoneme_id);
CREATE INDEX idx_gpm_primary ON grapheme_phoneme_mappings(is_primary);
CREATE INDEX idx_gpm_autospell ON grapheme_phoneme_mappings(use_in_autospell);
```

**Fields:**
- `id`: Unique identifier
- `grapheme_id`: Reference to graphemes table
- `phoneme_id`: Reference to phonemes table
- `is_primary`: TRUE if this is the default pronunciation
- `context_rules`: Reserved for future conditional mappings (JSON)
- `use_in_autospell`: If FALSE, exclude from auto word generation
- `priority`: Disambiguation order (higher values preferred)

---

## Design Rationale

### Why This Structure?

1. **Compound Graphemes as Atomic Units**
   - "oo" is stored as a single grapheme row, not two "o"s
   - Faster queries (no array operations or sequence tables)
   - Order is implicit in the `name` field

2. **Many-to-Many Flexibility**
   - One grapheme → multiple phonemes (e.g., "c" → /k/ or /s/)
   - One phoneme ← multiple graphemes (e.g., /f/ ← "f" or "ph")
   - Handled efficiently via junction table

3. **Mobile Optimization**
   - Minimal JOINs required for common queries
   - Heavy indexing on frequently queried fields
   - Denormalized where appropriate (grapheme name stores order)

4. **Future-Proof**
   - `structure_template` for complex syllable patterns (A_E)
   - `context_rules` for conditional mappings
   - Fields are NULL/unused until features are implemented

---

## Common Query Patterns

### Get all phonemes for a grapheme
```sql
SELECT p.* 
FROM phonemes p
JOIN grapheme_phoneme_mappings gpm ON p.id = gpm.phoneme_id
WHERE gpm.grapheme_id = ?;
```

### Get primary grapheme for a phoneme
```sql
SELECT g.* 
FROM graphemes g
JOIN grapheme_phoneme_mappings gpm ON g.id = gpm.grapheme_id
WHERE gpm.phoneme_id = ? 
  AND gpm.is_primary = TRUE
ORDER BY gpm.priority DESC
LIMIT 1;
```

### Get all graphemes usable in autospell
```sql
SELECT DISTINCT g.* 
FROM graphemes g
JOIN grapheme_phoneme_mappings gpm ON g.id = gpm.grapheme_id
WHERE gpm.use_in_autospell = TRUE;
```

### Search graphemes by name or note
```sql
SELECT * 
FROM graphemes 
WHERE name LIKE ? OR note LIKE ?;
```

---

## Example Data

### Sample Graphemes
```sql
INSERT INTO graphemes (name, is_compound, note) VALUES 
  ('a', FALSE, 'basic vowel'),
  ('o', FALSE, 'basic vowel'),
  ('oo', TRUE, 'double o compound'),
  ('c', FALSE, 'hard/soft consonant'),
  ('k', FALSE, 'hard consonant'),
  ('ph', TRUE, 'f sound compound'),
  ('sh', TRUE, 's sound compound');
```

### Sample Phonemes
```sql
INSERT INTO phonemes (ipa, description, syllable_position, example_word) VALUES 
  ('/æ/', 'short a as in cat', 'nucleus', 'cat'),
  ('/ɑ/', 'short o as in hot', 'nucleus', 'hot'),
  ('/ʊ/', 'short u as in book', 'nucleus', 'book'),
  ('/k/', 'k sound', 'onset', 'cat'),
  ('/s/', 's sound', 'onset', 'sit'),
  ('/f/', 'f sound', 'onset', 'fun'),
  ('/ʃ/', 'sh sound', 'onset', 'ship');
```

### Sample Mappings
```sql
INSERT INTO grapheme_phoneme_mappings (grapheme_id, phoneme_id, is_primary, priority) VALUES
  -- 'a' mappings
  (1, 1, TRUE, 10),        -- a → /æ/ (primary)
  
  -- 'o' mappings  
  (2, 2, TRUE, 10),        -- o → /ɑ/ (primary)
  
  -- 'oo' mappings
  (3, 3, TRUE, 10),        -- oo → /ʊ/ (primary)
  
  -- 'c' mappings
  (4, 4, TRUE, 10),        -- c → /k/ (primary, as in "cat")
  (4, 5, FALSE, 5),        -- c → /s/ (secondary, as in "city")
  
  -- 'k' mappings
  (5, 4, TRUE, 10),        -- k → /k/
  
  -- 'ph' mappings
  (6, 6, TRUE, 10),        -- ph → /f/
  
  -- 'sh' mappings
  (7, 7, TRUE, 10);        -- sh → /ʃ/
```

---

## Migration Strategy

### Initial Setup
1. Create tables in order: `graphemes` → `phonemes` → `grapheme_phoneme_mappings`
2. Populate with basic graphemes (user-created or defaults)
3. Populate with phoneme inventory (IPA set)
4. Create mappings as user defines relationships

### Future Enhancements
- Populate `structure_template` when implementing complex syllable patterns
- Populate `context_rules` when implementing conditional mappings (e.g., "c" → /s/ before "i", "e")
- Add additional tables as needed (words, syllable rules, etc.)

---

## Performance Notes

### Indexes
- All foreign keys are indexed
- Common query fields are indexed (`name`, `ipa`, `is_primary`, `use_in_autospell`)
- Composite indexes may be added based on actual query patterns

### Client-Side Considerations
- Keep SVG data compressed/optimized
- Consider lazy-loading grapheme images
- Cache frequent queries in application layer
- Use transactions for batch operations

### Estimated Storage
- ~100 graphemes × 5KB SVG = ~500KB
- ~50 phonemes × 200 bytes = ~10KB
- ~200 mappings × 100 bytes = ~20KB
- **Total: ~530KB for typical conlang**

---

## Future Expansion Points

### Additional Tables (Not Implemented Yet)
```sql
-- Words table (for dictionary/lexicon)
CREATE TABLE words (
  id INTEGER PRIMARY KEY,
  spelling TEXT,           -- How it's written
  pronunciation TEXT,      -- IPA or grapheme sequence
  meaning TEXT,
  part_of_speech TEXT
);

-- Syllable Structure Rules
CREATE TABLE syllable_rules (
  id INTEGER PRIMARY KEY,
  pattern TEXT,            -- e.g., "(C)(C)V(C)(C)"
  is_allowed BOOLEAN
);
```

These can be added without modifying the core grapheme/phoneme structure.

---

## Summary

This schema provides:
- ✅ Flexible many-to-many grapheme ↔ phoneme mappings
- ✅ Fast mobile queries with proper indexing
- ✅ Compound grapheme support (with implicit ordering)
- ✅ Future-proof extensibility
- ✅ Simple enough to implement incrementally
- ✅ Optimized for client-side SQL (SQLite/WebSQL/IndexedDB with SQL.js)