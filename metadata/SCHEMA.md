# RASOrbit Input File — Field Metadata

This directory describes the entire RASOrbit `.dat` input file as a flat, human-readable
field list (`fields.csv`). It is a design/review artifact: you and your friend can edit the
CSV and pass it back and forth to agree on the field design before any GUI/parser code is
written.

The CSV covers the whole file (input "pages" 1–12), so nothing is left unmodeled. The
author documented it in two halves (pages 1–8, then 9–12) purely for convenience; that
split has no structural meaning, so the metadata is a single list. In the example file
`DATA-10A - US Units.dat` the records span line 1 through line 184 (the end of the file).

## How each value is located in the file

The whole point of this metadata is that it must pin down exactly where every value is
**read from and written to**. It does — it just expresses location as a **sequential
offset** rather than an absolute line/column, because absolute positions are not stable:
the same field lands on different lines depending on the counts (e.g. `cp` starts on line
38 in stage 1 of `DATA-10A`, but on line 78 in stage 2). Hard-coding line/column numbers
would therefore be correct only for the first two lines and wrong everywhere else.

Location is defined by three things, which together determine every value's position
deterministically:

1. **CSV row order is authoritative.** The order of rows in `fields.csv` *is* the order the
   records appear in the file. Reordering rows changes the file format.
2. **`kind` + `count`** give each record's length: `scalar` = 1 value, `vector` = `count`
   values, `matrix` = `rows × cols` values. Counts come from scalar fields read earlier in
   the same stream (`n_stages`, `n_aoa`, `n_mach`, `n_weight`, `n_history`, `n_traj`).
3. **`per_stage`** marks records that repeat `n_stages` times. Repetition applies to each
   **maximal contiguous run** of `per_stage` rows, not to all `per_stage` rows together —
   there are two separate per-stage runs (the pages 3–8 aero block and the page-10
   stage/engine block), divided by the non-per-stage page-9 records. A non-per-stage row
   ends a run.
4. **`when`** marks records whose presence is conditional on another field's value (e.g.
   `engine_type==1`). A record whose condition is false occupies no values in the stream.

### Read algorithm (line-aware)

**The file is line-structured, not a flat token stream.** RASOrbit (FORTRAN) issues one
`READ` per record, and each `READ` starts on a fresh line. Most importantly, a matrix is
read **one row per line** (`READ (cn(i,j), j=1,n_aoa)` inside a loop over `i`), so each
matrix row is its own line and *any extra values past `n_aoa` on that line are ignored*.
This is confirmed by `DATA-10A`/`DATA-10B`, whose stages 3–4 declare `n_aoa = 3` yet store
5-wide matrix rows — RASOrbit reads the first 3 of each line and drops the rest. A flat
"ignore all line breaks" parse would mis-read those files, so the reader must respect lines.

1. Take file line 1 verbatim as `title` (columns 1–80).
2. Walk the CSV records in order, repeating each contiguous run of `per_stage` rows
   `n_stages` times and skipping any record whose `when` condition is false. Consume the
   file line-by-line per record kind:
   - **scalar group** (a scalar/count row plus any immediately following rows marked
     `line=same` — see "Line grouping" below): read that one line, take its values
     left-to-right.
   - **vector** (`count` values): read whole lines, accumulating values until `count` are
     collected; the next record begins on the following line. Extra trailing values on the
     last line are ignored (list-directed semantics).
   - **matrix** (`n_mach` rows × `n_aoa` cols): read exactly `n_mach` lines, taking the
     first `n_aoa` values from each; ignore any extra trailing values per line.
3. The records cover the whole file, so reading ends when the last record is consumed.
   (Unexpected leftover non-blank lines indicate a structural error — see Error tolerance.)

Our reader stays lenient about *intra-line* spacing and trailing padding (so it can salvage
cosmetically broken files), but it must honor line boundaries for matrices and `READ`
starts, because that is how RASOrbit interprets the data.

### Error tolerance

**Cosmetic** errors (intra-line spacing, blank lines, mild re-wrapping, matrix-row
padding) are recoverable and are fixed automatically on save. **Structural** errors — a
missing or extra value, so a count no longer matches the data that follows — cannot always
be unambiguously located (a missing value shifts everything after it). The reader uses each
record's expected value count and line layout as a redundancy check to detect and localize
such errors, and blanks out the affected section/stage rather than mis-assigning values.
Line structure helps here: a matrix row line that is short, or a count outside its valid
range, pinpoints trouble earlier than a pure token stream could. The two "messed up"
example files contain both classes: `DATA-10A - US Units - Messed Up.dat` deletes values
and `DATA-10B - Metric Units - Messed Up.dat` adds them, on top of whitespace
perturbations.

#### No resync after a desync

Once the value count is off there is **no reliable way to resync**: the body is
largely homogeneous floating-point values with no delimiters or sentinels, so a
missing/extra value shifts everything after it and nothing in the data marks where the next
field begins (line breaks bound matrix rows but do not, on their own, re-anchor a vector or
scalar group that has already drifted). The
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
  and every data value has one. A hand-edited file might break this convention, so it can
  flag a likely desync but must not drive silent correction.

Two-ended parsing does not help, because there is no independent marker mid-file to anchor
to — every record's position is computed from the (possibly corrupt) preceding counts.

### Write algorithm

Emit the records in CSV order, re-deriving the per-stage runs and the `when` conditions,
applying the fixed-column format and per-field wrapping (below).

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
| `per_stage` | `stage` if the record belongs to a per-stage run (each contiguous run repeats `n_stages` times); blank otherwise. |
| `when`      | Condition for the record to be present. A bare `field==value` (e.g. `engine_type==1`) tests the **current stage** (only meaningful on `per_stage` rows). An `any(...)` wrapper is a **vehicle-level** test across all stages (e.g. `any(engine_type>0)` = "any stage has an engine"), used to gate non-per-stage records. Blank = always present. |
| `line`      | `same` if this record shares the previous record's physical line (used for the few multi-field lines); blank = start a new line. See "Line grouping". |
| `control`   | Suggested UI control: `text`, `number`, `grid`, or `radio:...` with `option=value` pairs. |
| `min`,`max` | Allowed value range (blank = unbounded). |
| `step`      | GUI spinner increment only. File precision is a fixed 4 decimals for all floats (see write rules), independent of `step`. |
| `page`      | Input page number the field appears on (1–12). |
| `group`     | Group/section heading within the page. |
| `validate`  | Extra rules beyond `min`/`max` that need code: cross-field constraints (e.g. `printout_rate >= integration_time_step`), special rules (`first time must be 0`), and autofill/label-branch notes. |

## Record sequence

### Header (once, not per stage)

1. `title` — text, file line 1, columns 1–80.
2. `n_stages`, `units`, `aero_type` — three integers on file line 2.

### Per-stage aero run — pages 3–8 (repeats `n_stages` times)

In order: `n_aoa`, `aoa[]`, `n_mach`, `mach[]`, `cn[][]`, `ca[][]`, `cp[][]`,
`dca_off[]`, `n_weight`, `weight[]`, `cg[]`, `inertia[]`, `tvc_gimbal`, `tvc_percent`,
`tvc_maxangle`.

Pages are presented per-stage instance (the slides title them "3rd Input Page — For
Stage 1", etc.). Page 2 in the slide deck is an informational notes panel with an OK
button (no editable fields), so it is not represented in the CSV.

### Launch setup — page 9 (once)

In order: a launch line (`launch_mode`, `launch_azimuth`, `nose_heating_model`,
`nose_radius`), an initial-conditions line (`initial_altitude`, `initial_velocity`,
`geodetic_latitude`, `longitude`, `initial_pitch`, `initial_heading_azimuth`,
`initial_bank`, `initial_aoa`), and an integration line (`integration_time_step`,
`total_time`, `printout_rate`).

### Per-stage stage/engine run — page 10 (repeats `n_stages` times)

For each stage: `stage_start_time`, `aero_ref_area`, `stage_initial_weight`,
`stage_burnout_weight`, `engine_type`, then the engine inputs **conditional on
`engine_type`**:

- `0` (no engine): no further values.
- `1` (chamber pressure): 12 values — `throat_area`, `nozzle_expansion_ratio`,
  `nozzle_divergence_half_angle`, `chp_burn_time`, `ref_thrust`, `ref_specific_impulse`,
  `ref_chamber_pressure`, `ref_atm_pressure` (line 1), then `ratio_specific_heats`,
  `thrust_coeff_ratio`, `nozzle_type`, `negative_thrust` (line 2).
- `2` (thrust time history): 4 values — `tth_burn_time`, `nozzle_exit_area`,
  `tth_ref_atm_pressure`, `tth_negative_thrust`.

### Engine time history — page 11 (once, only when any stage has an engine — `any(engine_type>0)`)

`n_history`, `history_time[]`, `history_value[]`. Present only when at least one stage has
`engine_type` 1 or 2. It is a single vehicle-wide curve (not per stage); for the example's
four Type-2 stages it is one combined 38-point thrust curve. Label/units are chamber
pressure (Type 1) or thrust (Type 2).

### Trajectory control — page 12 (once)

`n_traj`, `traj_control`, `traj_time[]`, `traj_angle[]`, `traj_bank[]`. This is the end of
the file.

### Matrix orientation

Each `cn`/`ca`/`cp` matrix is stored one **file line per Mach number**, with `n_aoa`
values across that line. So Mach = rows, Angle of Attack = columns (matching slide 11).
Because each row is its own line, a row line may carry extra trailing values that RASOrbit
ignores (it reads only `n_aoa` per line) — this is exactly what stages 3–4 of the example
files do (5-wide rows with `n_aoa = 3`). We read `n_aoa` per row and re-emit clean rows.

### Line grouping

A few consecutive scalar/count fields are written on a single shared line (one FORTRAN
`READ`). This is encoded in `fields.csv` by the **`line`** column: a row with `line=same`
continues the previous record's line, so each group is a leading row (blank `line`) followed
by its `same` rows. Everything else needed for layout is implied by `kind` (matrices are one
row per line; vectors wrap at the default 8 values per line). The groups are:

- `n_stages` + `units` + `aero_type` (line 2).
- `tvc_gimbal` + `tvc_percent` + `tvc_maxangle` (one line, per stage).
- `launch_mode` + `launch_azimuth` + `nose_heating_model` + `nose_radius`.
- the 8 initial-conditions fields (`initial_altitude` … `initial_aoa`).
- `integration_time_step` + `total_time` + `printout_rate`.
- the 5 stage fields (`stage_start_time` … `engine_type`), per stage.
- engine Type 1: 8 fields, then 4 fields (two lines); Type 2: 4 fields (one line).
- `n_traj` + `traj_control`.

Every other count/scalar sits on its own line.

## Global write-format rules

### RASOrbit is strict

RASOrbit (a FORTRAN program) reads the file with fixed formats, not lenient whitespace: per
the author, "if a number is one space off, if there is a gap between lines, it won't run —
everything should be perfectly lined up." So the writer must reproduce the exact
fixed-column layout; there is no margin. (This is the inverse of our reader, which is
intentionally lenient so it can salvage imperfect files and rewrite them correctly.)

### Format

Every value occupies a **10-column slot** at columns 1, 11, 21, 31, …. Formatting is **by
`type`**, and this rule covers every field (verified against the example's mixed int/float
lines):

- **`int` and `choice`** (counts *and* coded values — `n_*`, `units`, `aero_type`,
  `engine_type`, `launch_mode`, `nose_heating_model`, `nozzle_type`, `negative_thrust`,
  `traj_control`): written `I2`, **right-justified in the first two columns of the slot**,
  then padded with spaces to the slot width (e.g. line 2 puts its three ints at columns
  1–2, 11–12, 21–22; `engine_type` lands at columns 41–42 of the stage line). `I2` is safe
  because every count is ≤ 40 and every code is ≤ 2 — a writer should still guard against an
  unexpected ≥ 100 value.
- **`float`**: **left-justified** in the 10-column slot (sign or first digit in the start
  column, matching the slides' "first number must be in these columns") with **4 decimal
  places** for every float field. Per the author, we use the slides' precision regardless of
  the original file (e.g. `-15.0` is written `-15.0000`). The `step` column is the GUI
  increment only and does not change file precision.
- **`text`** (only `title`): written verbatim in columns 1–80 of line 1.
- **Line wrapping** is uniform: vectors and matrix rows pack **8 values per line**, then
  wrap (8 × 10 columns = 80). In the example files every multi-value line (`mach`,
  `dca_off`, the history and trajectory vectors, and every matrix row) follows this, so a
  single rule reproduces them. `aoa` (≤8) and short vectors simply fit on one line.
- **Multi-field scalar lines** (the `line=same` groups) are written with each value in its
  own 10-column field: line 2, the per-stage TVC triplet, the launch line, the 8-value
  initial-conditions line, the 3-value integration line, the 5-value stage line, the engine
  lines (8+4 for Type 1, 4 for Type 2), and `n_traj`+`traj_control`.

So **reading is lenient** (tolerant of intra-line spacing and trailing padding, falling
back to blank if hopelessly broken) while **writing is strict** (exact fixed columns as
above). The reader still honors line boundaries for matrix rows and `READ` starts — see the
line-aware read algorithm and "Error tolerance" above.

## Branch handling (display only — storage is identical)

`units` and `aero_type` change only labels/units in the GUI; the numbers are stored the
same way regardless. The same storage slots carry either set of coefficients — there is no
separate `cl`/`cd`/`dcd_off` storage; those are just the CL/CD branch's labels for the
`cn`/`ca`/`dca_off` slots.

- `aero_type` = 0 selects the CL/CD/CP branch; = 1 selects CN/CA/CP (confirmed). In the
  CL/CD/CP branch, relabel `cn` → "Lift Coefficient (CL)", `ca` → "Drag Coefficient (CD)",
  and `dca_off` → "Power-Off Delta Drag Coefficient" (`dcd_off`). `cp` is unchanged.
- `units` SI vs English changes unit suffixes:
  - length fields (`cp`, `cg`, `tvc_gimbal`, `nose_radius`, `initial_altitude`): inches/ft
    (English) vs meters (SI)
  - `weight`, `stage_initial_weight`, `stage_burnout_weight`: lbs vs kg
  - `inertia`: slug-ft² vs kg-m²
  - rocket-engine fields (areas ft²/m², thrust lbs/N, pressures lbs-in²/MPa or lbs-ft²/MPa)
  - `history_value`: thrust lbs/N or chamber pressure lbs-in²/MPa
  - angles, ratios, coefficients, Mach, percentages: unchanged
- `launch_mode` (display only): when `0` (Conventional Flight), relabel `launch_azimuth` →
  "Initial Heading" and `initial_heading_azimuth` accordingly. When `1` (Vertical Launch),
  autofill `initial_pitch`=90, `initial_bank`=0, `initial_aoa`=0,
  `initial_heading_azimuth`=`launch_azimuth`. Storage is identical either way.
- `traj_control` (display only): `1` labels the middle array "Angle of Attack"; `0` labels
  it "Pitch Attitude". Same storage slot.
- `engine_type` (display only, page 11): the single time history is labeled "Chamber
  Pressure" for Type 1 and "Thrust" for Type 2.

## Whole-file coverage

The CSV models the entire file (pages 1–12), ending at the page-12 trajectory control
records, so there is no trailing region to preserve verbatim.

## Coverage of the example files

The schema is currently inferred largely from **one vehicle**: `DATA-10A` and `DATA-10B` are
the same 4-stage rocket in US and metric units (plus their deliberately corrupted copies).
The CL/CD/CP variants the author mentioned were not received. So large parts of the format
are **unexercised** and rest on the slides alone. Treat anything below as "matches the slides
but not seen in a real file" until a covering example arrives.

Exercised by the examples:

- `units` 0 and 1 (metric and US).
- Per-stage aero with varying `n_aoa` (5, 5, 3, 3) and `n_mach` (15, 7, 7, 7), including the
  matrix-row padding case (3-wide AoA stored in 5-wide rows).
- `launch_mode = 1` (vertical) with the vertical-launch autofills present (pitch 90, bank 0,
  AoA 0, heading = azimuth) — consistent with, but not proof of, the autofill rule.
- `engine_type = 2` (thrust history) for every stage; one vehicle-wide thrust table.

Not exercised (inferred only):

- `engine_type = 0` (no engine) and `= 1` (chamber pressure); any mix of engine types.
- `aero_type = 0` (CL/CD/CP).
- `n_stages` other than 4 (1-/2-/3-stage layouts).
- `n_weight` greater than 2.
- `launch_mode = 0` (conventional); `nose_heating_model = 0`.
- `traj_control = 0` (pitch attitude + bank); the example uses `1`.
- `n_history` / `n_traj` anywhere near the max of 40.

## Implementation notes (things the code must supply beyond the CSV)

References inside `fields.csv` all resolve (every `count`/`when` target exists, is read
earlier, and shares the referencing record's stage scope), but a few things the
parser/writer/GUI need are **not** encoded as data and must be implemented or kept in mind:

- **Round-trip is normalizing, not byte-exact.** The writer emits 4-decimal floats and clean
  `n_aoa`-wide matrix rows, so a re-saved good file will *not* byte-match the original (the
  examples use variable precision like `-15.0` and padded rows). Compare round-trips on
  **parsed values**, not raw bytes.
- **`when` grammar.** Only two forms are used and need support: a per-stage scalar test
  `field op value` (`==`, and `>`/`<`/`!=` allowed), evaluated against the current stage;
  and an aggregate `any(field op value)` evaluated across all stages. Keep the evaluator to
  this grammar (no general expression engine needed).
- **`control` grammar.** Radios are `radio:Label=value,Label=value`; parse by splitting on
  `:` then `,` then `=`. Labels may contain `/` and spaces (e.g. `CL/CD/CP`) but never `,`
  or `=`.
- **`validate` is human prose, not executable.** Entries like
  `printout_rate >= integration_time_step`, `first time must be 0`, and the autofill notes
  are guidance; the GUI must implement them in code (or we later add a machine-readable
  rule column). They are intentionally not parsed.
- **Display branches (labels/units) are not in the CSV.** The CL/CD relabeling, the per-
  `units` suffixes, and the `launch_mode` / `traj_control` / engine-history label switches
  live only in "Branch handling" prose. A metadata-driven GUI must source them from there
  (or we encode them later). They do not affect file I/O.
- **Autofills** (vertical-launch `initial_pitch`/`bank`/`aoa`/`heading`) are behavior the
  GUI applies; they are not a file-format feature.
- **Page 2 has no fields** (informational panel); page iteration must tolerate the gap
  between page 1 and page 3.

## Open questions

### Resolved (confirmed by author)

- `aero_type` mapping: **0 = CL/CD/CP, 1 = CN/CA/CP**. The original example files use `1`
  (CN/CA/CP); a matching `DATA-10A - CL CD - US Units` set uses `0` (CL/CD/CP) and produces
  identical RASOrbit results.
- `units` mapping: **0 = SI (Metric), 1 = English**.
- `min`/`max`/`step` bounds: reviewed and accepted. `tvc_maxangle` max = **90** deg; blank
  upper bounds on `weight`/`cg`/`inertia`/`tvc_gimbal` are intentional. (Full list still to
  be re-reviewed once sent.)
- Write precision: use the **slides' fixed 4-decimal format**, not the original file's
  precision.
- RASOrbit read strictness: RASOrbit is **format-strict** (exact columns, no stray spaces
  or blank lines, or it won't run). Our reader stays lenient to salvage broken files; our
  writer must be exact.
- Units toggle: **leave the numbers unchanged**; only the on-screen unit labels switch
  between SI and English.
- File layout is fully metadata-driven: line grouping is encoded by the `line` column,
  matrices are one row per line (from `kind`), and vectors wrap at a uniform 8 values per
  line. Verified by a line-by-line parse of both good example files (every line 1–184
  consumed, no leftovers).

### Still to confirm

Blocking (affects read/write correctness):

- **Matrix row padding:** stages 3–4 of both example files declare `n_aoa = 3` but store
  5-wide `cn`/`ca`/`cp` rows. Confirm RASOrbit reads only `n_aoa` values per row-line and
  ignores the rest, and that rewriting clean `n_aoa`-wide rows runs identically.
- **Chamber-pressure engine branch (`engine_type = 1`) is unverified** — both examples use
  `engine_type = 2` for every stage, so there is no real-file sample of Type 1. Confirm the
  Type-1 field order, the 8-then-4 two-line split, and the codes `nozzle_type`
  (1 = Conical, 2 = Bell) and `negative_thrust` (0/1). A Type-1 example `.dat` would settle
  it.
- **Page 11 engine time history scope.** In both examples (all stages Type 2) there is a
  single thrust-vs-time table for the whole flight, with thrust dropping to zero at staging
  — i.e. one vehicle-wide curve, with per-stage records marking transitions, not one table
  per stage. Confirm that intent. **Open structural risk:** if RASOrbit allows stages to
  use *different* engine models (e.g. Type 1 + Type 2), a single page-11 table cannot hold
  both chamber pressure and thrust, so the format would have to be **per-powered-stage** —
  which would change the metadata (make `n_history`/`history_time`/`history_value`
  `per_stage` with `when` Type 1/2) and we'd need a mixed-type example to model it. The
  current schema assumes the single-table form the examples show.
- **Inferred control codes:** `engine_type` (0 none / 1 chamber pressure / 2 thrust
  history), `launch_mode` (0 conventional / 1 vertical), `traj_control` (0 pitch+bank /
  1 AoA+bank). Confirm each mapping.
- **Vector wrapping:** we write every array at 8 values per line. Confirmed for `mach`,
  history, and trajectory vectors; confirm 8/line is acceptable for `weight`/`cg`/`inertia`
  (never exceeds 2 in the examples).

Value limits / sign-off:

- Final review of the complete `min`/`max`/`step` list once it is sent over (now includes
  pages 9–12).
- Placeholder maximums: most page 9–12 numeric fields use an upper bound of 9,000,000
  (altitude, velocity, areas, weights, thrust, pressures, nose radius, burn times). Confirm
  real limits or that "effectively unbounded" is fine.
- `longitude` range is unspecified on the slides (latitude is ±90). Leave unbounded, or
  ±180?
- `n_history` / `n_traj`: min 2, max 40 — confirm.

Behavior rules:

- Vertical-launch autofills: `initial_pitch = 90`, `initial_bank = 0`, `initial_aoa = 0`,
  `initial_heading_azimuth = launch_azimuth`. Confirm.
- Cross-field validation: `printout_rate >= integration_time_step`, `total_time` not zero,
  and the first `time` in the history/trajectory tables must be 0. Confirm these are real
  RASOrbit requirements.
