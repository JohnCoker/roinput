# RASOrbit Input File — First-Half Field Metadata

This directory describes the **first half** of a RASOrbit `.dat` input file as a flat,
human-readable field list (`first-half-fields.csv`). It is a design/review artifact:
you and your friend can edit the CSV and pass it back and forth to agree on the field
design before any GUI/parser code is written.

The "first half" runs from the start of the file through the end of all per-stage
aerodynamic data, stopping right before the launch/trajectory data. In the example file
`DATA-10A - US Units.dat` that is line 1 through line 152 (the trajectory data begins at
line 153).

## How each value is located in the file

The whole point of this metadata is that it must pin down exactly where every value is
**read from and written to**. It does — it just expresses location as a **sequential
offset** rather than an absolute line/column, because absolute positions are not stable:
the same field lands on different lines depending on the counts (e.g. `cp` starts on line
38 in stage 1 of `DATA-10A`, but on line 78 in stage 2). Hard-coding line/column numbers
would therefore be correct only for the first two lines and wrong everywhere else.

Location is defined by three things, which together determine every value's position
deterministically:

1. **CSV row order is authoritative.** The order of rows in `first-half-fields.csv` *is*
   the order the records appear in the file. Reordering rows changes the file format.
2. **`kind` + `count`** give each record's length: `scalar` = 1 value, `vector` = `count`
   values, `matrix` = `rows × cols` values. Counts come from scalar fields read earlier in
   the same stream (`n_stages`, `n_aoa`, `n_mach`, `n_weight`).
3. **`per_stage`** marks the block of records that repeats `n_stages` times.

### Read algorithm

1. Take file line 1 verbatim as `title` (columns 1–80).
2. Tokenize the rest of the file on whitespace into one flat value stream. Line breaks act
   only as value separators (FORTRAN list-directed input), so cosmetic problems — wrong
   column spacing, blank lines, re-wrapped rows — do not affect reading.
3. Walk the CSV records in order, consuming the exact number of tokens each needs (using
   counts already read), repeating the `per_stage` records `n_stages` times.
4. When the first-half records are exhausted, the next token marks the start of the second
   half; everything from there on is preserved verbatim. The first/second-half boundary is
   thus computed from the counts, not a fixed line (line 153 is simply where it falls in
   `DATA-10A`).

### Error tolerance

In a well-formed file the line structure carries no information beyond the counts, so
**cosmetic** errors (spacing, blank lines, wrapping) are fully recoverable and are fixed
automatically on save. **Structural** errors — a missing or extra value, so a count no
longer matches the data that follows — cannot be unambiguously located in a flat token
stream (a missing value silently shifts everything after it). The reader should use each
record's expected value count as a redundancy check to detect and localize such errors,
and blank out the affected section/stage rather than mis-assign values. The two "messed
up" example files contain both classes: `DATA-10A - US Units - Messed Up.dat` deletes
values (785 numeric tokens vs 864 in the good file) and `DATA-10B - Metric Units - Messed
Up.dat` adds them (872), in addition to whitespace perturbations.

#### No resync after a desync

Once the token count is off there is **no reliable way to resync**: the body is
homogeneous floating-point values with no delimiters or sentinels, so a missing/extra value
shifts everything after it and nothing in the data marks where the next field begins. The
reader therefore does not attempt to realign. It instead **detects early and quarantines**:
parse forward, and at the first sign of trouble keep the good prefix, blank the ambiguous
remainder, and tell the user where confidence was lost (e.g. "Stage 3 onward could not be
read reliably"). Goal: silently fix all cosmetic errors, detect-and-localize structural
ones, never silently auto-correct a desync.

Weak anchors available for detection (none guaranteed, used only to flag/bound — never to
rewrite values):

- The header is line-based, so it is always safe: line 1 is the title, line 2 is the three
  header integers, and `n_stages` fixes how many stage blocks to expect.
- Counts must be small integers in known ranges (`n_aoa` 3–8, `n_mach` 2–15, `n_weight`
  2–10). A value outside the range where a count is expected proves a desync and gives a
  clean "blank from here" point.
- Lexical hint only: in both sample files every count is written without a decimal point
  and every data value has one. FORTRAN would accept either, so this can flag a likely
  desync but must not drive silent correction.

Two-ended parsing does not help, because the start of the second half is computed from the
(possibly corrupt) first-half counts — there is no independent marker for it.

### Write algorithm

Emit the records in CSV order, re-deriving the `per_stage` repetition, applying the
fixed-column format and per-field wrapping (below), then append the preserved second half
unchanged.

Because each record's length is known from counts read earlier, this is fully
deterministic in both directions: **there is no field we can read but cannot write back.**

## CSV columns

| Column      | Meaning |
|-------------|---------|
| `id`        | Stable machine key for the field. |
| `label`     | Human label shown in the GUI. |
| `kind`      | `scalar` (one value), `vector` (1-D list), or `matrix` (2-D grid). |
| `type`      | `text`, `int`, `float`, or `choice`. |
| `count`     | For `vector`: the `id` of the count field (e.g. `n_mach`). For `matrix`: `rows x cols` as count ids (e.g. `n_mach x n_aoa`). Blank for `scalar`. |
| `per_stage` | `stage` if the record lives inside the per-stage block (repeated `n_stages` times); blank for header fields. |
| `control`   | Suggested UI control: `text`, `number`, `grid`, or `radio:...` with options. |
| `min`,`max` | Allowed value range (blank = unbounded). |
| `step`      | Increment / implied decimal places (e.g. `0.0001` ⇒ 4 decimals). |
| `page`      | Input page number the field appears on. |
| `group`     | Group/section heading within the page. |

## Record sequence

### Header (once, not per stage)

1. `title` — text, file line 1, columns 1–80.
2. `n_stages`, `units`, `aero_type` — three integers on file line 2.

### Per-stage block (repeats `n_stages` times)

In order: `n_aoa`, `aoa[]`, `n_mach`, `mach[]`, `cn[][]`, `ca[][]`, `cp[][]`,
`dca_off[]`, `n_weight`, `weight[]`, `cg[]`, `inertia[]`, `tvc_gimbal`, `tvc_percent`,
`tvc_maxangle`.

Pages are presented per-stage instance (the slides title them "3rd Input Page — For
Stage 1", etc.). Page 2 in the slide deck is an informational notes panel with an OK
button (no editable fields), so it is not represented in the CSV.

### Matrix orientation

Each `cn`/`ca`/`cp` matrix is stored one **file line per Mach number**, with `n_aoa`
values across that line. So Mach = rows, Angle of Attack = columns (matching slide 11).

## Global write-format rules

RASOrbit (a FORTRAN program) reads tolerant whitespace but the file is conventionally
column-formatted. Writing should emit:

- **Counts** (`n_stages`, `n_aoa`, `n_mach`, `n_weight`) as `I2`, right-justified in
  columns 1–2. (`units`/`aero_type` sit in the same line-2 integer fields at columns 12
  and 22.)
- **Floats** in 10-character fields beginning at columns 1, 11, 21, 31, … Decimal places
  follow each field's `step`.
- **Line wrapping** differs per field:
  - `mach` and `dca_off`: 8 values per line, then wrap.
  - `aoa` and each matrix row: a single line (max 8 values, fits in 80 columns).
  - `weight`, `cg`, `inertia`: a single line up to 10 values (may extend past column 80).

The two "messed up" example files are exactly column-misalignment errors, which is why
**reading is lenient** (whitespace tokenization, fall back to blank if hopelessly broken)
while **writing is strict** (fixed columns as above).

## Branch handling (display only — storage is identical)

`units` and `aero_type` change only labels/units in the GUI; the numbers are stored the
same way regardless.

- `aero_type` CL/CD/CP branch: relabel `cn` → "Lift Coefficient (CL)", `ca` → "Drag
  Coefficient (CD)". `cp` is unchanged.
- `units` SI vs English changes unit suffixes:
  - length fields (`cp`, `cg`, `tvc_gimbal`): inches (English) vs meters (SI)
  - `weight`: lbs vs kg
  - `inertia`: slug-ft² vs kg-m²
  - `aoa`, `mach`, coefficients, `tvc_percent`, `tvc_maxangle`: unitless / degrees (no change)

## Second half

Everything from file line 153 on (launch/trajectory data) is **out of scope** for now and
must be preserved verbatim by any future writer.

## Open questions for confirmation

1. `aero_type`: which integer (0 or 1) means CL/CD/CP vs CN/CA/CP? Both example files use
   `1`, so the mapping is ambiguous from the data alone.
2. Confirm `units`: 0 = SI, 1 = English (matches the two examples — `DATA-10A` US = 1,
   `DATA-10B` Metric = 0).
3. Confirm proposed `min`/`max`/`step` bounds (especially `tvc_percent` 0–1, the upper
   bounds left blank for `weight`/`cg`/`inertia`/`tvc_gimbal`/`tvc_maxangle`).
4. On write, use canonical decimals (e.g. 4 places as in the slide mockups) or preserve
   the existing input file's formatting?
5. How does RASOrbit's FORTRAN code read the file — one large list-directed read per array
   (line-agnostic), or row-by-row? This determines whether line breaks are pure separators
   or a weak structural boundary we should validate against.
