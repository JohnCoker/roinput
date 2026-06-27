# RASOrbit Input File

This documents the RASOrbit `.dat` input file model and [fields.csv](fields.csv) is metadata
for the individual fields.

## How each value is located in the file

This metadata pins down exactly where every value is **read from and written to**. It
expresses location as a **sequential offset** rather than an absolute line/column, because
absolute positions shift with the counts (the same field lands on a different line in each
stage).

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
`READ` per record, each starting on a fresh line, and matrices are read one row per line (see
"Matrix orientation"). The reader must honor line boundaries — a flat "ignore all line
breaks" parse would mis-read matrix rows.

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

The reader is lenient about *intra-line* spacing and trailing padding (to salvage
cosmetically broken files) but honors line boundaries, because that is how RASOrbit reads.
The writer, by contrast, is strict (see "Global write-format rules").

### Error tolerance

**Cosmetic** errors (intra-line spacing, blank lines, mild re-wrapping, matrix-row
padding) are recoverable and are fixed automatically on save. **Structural** errors — a
missing or extra value, so a count no longer matches the data that follows — cannot always
be unambiguously located (a missing value shifts everything after it). The reader uses each
record's expected value count and line layout as a redundancy check to detect and localize
such errors, and blanks out the affected section/stage rather than mis-assigning values.
Line structure helps here: a matrix row line that is short, or a count outside its valid
range, pinpoints trouble earlier than a pure token stream could. (Both classes occur in
practice: a value can be dropped or added, on top of whitespace perturbations.)

#### No resync after a desync

Once the value count is off there is **no reliable way to resync**: the body is
largely homogeneous floating-point values with no delimiters or sentinels, so a
missing/extra value shifts everything after it and nothing in the data marks where the next
field begins (line breaks bound matrix rows but do not, on their own, re-anchor a vector or
scalar group that has already drifted). The
reader therefore does not attempt to realign. It instead **detects early and quarantines**:
parse forward, and at the first sign of trouble keep the good prefix, blank the ambiguous
remainder, and tell the user where confidence was lost (e.g. "Stage 3 onward could not be
read reliably").

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

`n_history`, `history_time[]`, `history_value[]`. One vehicle-wide curve (see "Engine model
rules"). Label/units are chamber pressure (Type 1) or thrust (Type 2).

### Trajectory control — page 12 (once)

`n_traj`, `traj_control`, `traj_time[]`, `traj_angle[]`, `traj_bank[]`. This is the end of
the file.

### Matrix orientation

Each `cn`/`ca`/`cp` matrix is stored one **file line per Mach number**, with `n_aoa` values
across that line — so Mach = rows, Angle of Attack = columns (matching slide 11). A row line
may carry extra trailing values, which RASOrbit ignores (it reads only `n_aoa` per line); we
read `n_aoa` per row and re-emit clean rows.

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
fixed-column layout; there is no margin.

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
  the original file (e.g. `-15.0` is written `-15.0000`).
- **`text`** (only `title`): written verbatim in columns 1–80 of line 1.
- **Line wrapping** is uniform: vectors and matrix rows pack **8 values per line**, then
  wrap (8 × 10 columns = 80). In the example files every multi-value line (`mach`,
  `dca_off`, the history and trajectory vectors, and every matrix row) follows this, so a
  single rule reproduces them. `aoa` (≤8) and short vectors simply fit on one line.
- **Multi-field scalar lines** (the `line=same` groups listed under "Line grouping") put each
  value in its own 10-column field.

## Branch handling (display only — storage is identical)

`units` and `aero_type` change only labels/units in the GUI; the numbers are stored the
same way regardless. The same storage slots carry either set of coefficients — there is no
separate `cl`/`cd`/`dcd_off` storage; those are just the CL/CD branch's labels for the
`cn`/`ca`/`dca_off` slots.

- `aero_type` = 0 selects the CL/CD/CP branch; = 1 selects CN/CA/CP (confirmed). In the
  CL/CD/CP branch, relabel `cn` → "Lift Coefficient (CL)", `ca` → "Drag Coefficient (CD)",
  and `dca_off` → "Power-Off Delta Drag Coefficient" (`dcd_off`). `cp` is unchanged.
- `units` SI vs English changes only the displayed unit; stored values are unchanged.
  Authoritative units and RASOrbit's own field names are tabulated in "Units & RASOrbit
  labels (from the `.out` echo)" below.
- `launch_mode` (display only): when `0` (Conventional Flight), relabel `launch_azimuth` →
  "Initial Heading" and `initial_heading_azimuth` accordingly. When `1` (Vertical Launch),
  autofill `initial_pitch`=90, `initial_bank`=0, `initial_aoa`=0,
  `initial_heading_azimuth`=`launch_azimuth`. Storage is identical either way.
- `traj_control` (display only): `1` labels the middle array "Angle of Attack"; `0` labels
  it "Pitch Attitude". Same storage slot.
- `engine_type` (display only, page 11): the single time history is labeled "Chamber
  Pressure" for Type 1 and "Thrust" for Type 2.

## Engine model rules

- **No mixing of engine models.** Every powered stage in a vehicle uses the *same* model:
  either all Type 1 (chamber pressure) or all Type 2 (thrust history). A vehicle is never
  part Type 1 and part Type 2. This is why a single page-11 table suffices and why its kind
  (chamber pressure vs thrust) is well-defined.
- **`engine_type = 0` (glider / no engine)** is allowed only for (a) a single-stage glider,
  or (b) the **last stage** of an otherwise-powered vehicle. So among the per-stage
  `engine_type` values, all are equal except the last, which may be 0.
- **Page 11 is one vehicle-wide curve** that starts at time 0. It is present iff the vehicle
  is powered (`any(engine_type>0)`); a pure glider has no page 11. Whether the curve's last
  time must equal `total_time` is unsettled — see Open questions.
- **Glider last stage:** if the last stage is a glider on a powered vehicle, the history
  values are 0 from that stage's start time onward (the curve still runs to `total_time`).

## Units & RASOrbit labels (from the `.out` echo)

RASOrbit writes a labeled echo of the input at the top of each `.out` file. That echo is the
**authoritative** source for field labels and units (it is how RASOrbit itself interprets the
file). The units below are confirmed from the X-15 pair (`DATA-17A` English, `DATA-17B`
metric); fields not shown are dimensionless (coefficients, ratios, Mach, percentages) or
angles in degrees (AoA, pitch, bank, azimuth, divergence/TVA angles).

| Field (`id`) | RASOrbit label | English | SI |
|--------------|----------------|---------|-----|
| `cp` | CENTER OF PRESSURE | inches | meters |
| `cg` | X-CG | inches | meters |
| `inertia` | PITCH INERTIA | slug-ft² | kg-m² |
| `weight` / `stage_initial_weight` / `stage_burnout_weight` | WEIGHT / INITIAL-WT / BURNOUT-WT | lbs | kg |
| `tvc_gimbal` | TVS-X-STA | inches | meters |
| `aero_ref_area` | REF-AREA | ft² | m² |
| `throat_area` | THROAT-AREA | ft² | m² |
| `ref_thrust` | REF-THRUST | lbs | newtons |
| `ref_specific_impulse` | REF-ISP | sec | sec |
| `ref_chamber_pressure` | REF-PC | psi | MPa |
| `ref_atm_pressure` | REF-PA | psi | MPa |
| `history_value` | CHAMBER PRESSURE / THRUST | psi (CP) or lbs (thrust) | MPa (CP) or newtons (thrust) |
| `nose_radius` | REFERENCE NOSE RADIUS | feet | meters |
| `engine_type` | THRUST-LOGIC | — | — |
| `integration_time_step` / `total_time` / `printout_rate` | FRAME-TIME / RUN-TIME / PRINT-TIME | sec | sec |
| `launch_mode` | VERTICAL-LAUNCH | — | — |

The `.out` echo also gives us two reusable assets for the build: (1) RASOrbit's own field
names (e.g. `engine_type` = "THRUST-LOGIC", `ref_atm_pressure` = "REF-PA",
`tvc_gimbal` = "TVS-X-STA"), useful if we want labels to match RASOrbit; and (2) a **golden
oracle** — after we write a `.dat`, running RASOrbit and diffing the `.out` echo confirms we
preserved every value.

## Coverage of the example files

A broad set of confirmed-working files (with matching `.out` outputs) exercises every major
branch; the metadata-driven, line-aware parser reads all of them with no leftover lines. Use
the `Rev A` files as canonical.

| File | Vehicle | aero | stages | engine | launch | heating |
|------|---------|------|--------|--------|--------|---------|
| DATA-10A US Rev A | Minotaur I | CN/CA | 4 | Type 2 | vertical | on |
| DATA-10A CL CD US Rev A | Minotaur I | CL/CD | 4 | Type 2 | vertical | on |
| DATA-10B Metric Rev A | Minotaur I | CN/CA | 4 | Type 2 | vertical | on |
| DATA-12A Space Shuttle US | Shuttle reentry | CN/CA | 1 | none (glider) | conventional | on |
| DATA-12C Space Shuttle CL CD | Shuttle reentry | CL/CD | 1 | none (glider) | conventional | on |
| DATA-12D Space Shuttle Heating Off | Shuttle reentry | CN/CA | 1 | none (glider) | conventional | **off** |
| DATA-17A X-15 US | X-15 air-launch | CN/CA | 1 | **Type 1** (chamber pressure) | conventional | on |
| DATA-17B X-15 Metric | X-15 air-launch | CN/CA | 1 | Type 1 | conventional | on |

Between them these files cover both `units`, both `aero_type`, all three `engine_type` values
(0 glider, 1 chamber pressure, 2 thrust history), both `launch_mode` values, both
`nose_heating_model` values, `n_stages` 1 and 4, per-stage aero with varying `n_aoa`/`n_mach`,
the Type-1 8+4 engine block, and page-11 present (powered) and absent (glider). Variations
that still lack an example are listed under "Open questions".

## Implementation notes (things the code must supply beyond the CSV)

References inside `fields.csv` all resolve (every `count`/`when` target exists, is read
earlier, and shares the referencing record's stage scope), but a few things the
parser/writer/GUI need are **not** encoded as data and must be implemented or kept in mind:

- **Round-trip is normalizing, not byte-exact.** The writer emits 4-decimal floats and clean
  `n_aoa`-wide matrix rows, so a re-saved good file will *not* byte-match the original (the
  examples use variable precision like `-15.0` and padded rows). Compare round-trips on
  **parsed values**, not raw bytes.
- **`when` grammar needs a small evaluator** (the two forms in the `when` column above), not
  a general expression engine.
- **`control` grammar.** Radios are `radio:Label=value,Label=value`; split on `:` then `,`
  then `=`. Labels may contain `/` and spaces (e.g. `CL/CD/CP`) but never `,` or `=`.
- **`validate` is human prose, not executable** — the GUI must implement those rules in code
  (or we later add a machine-readable rule column).
- **Display branches and autofills live in "Branch handling" prose, not the CSV** — a GUI
  must source the relabeling/unit/autofill behavior from there. They do not affect file I/O.
- **Page 2 has no fields** (informational panel); page iteration must tolerate the gap
  between page 1 and page 3.

## Open questions

One real discrepancy plus minor / value-bound items:

- **Last engine-history time vs `total_time`.** The author says the last history time must
  equal the total run time, and the Type-2 thrust-history files obey this (578 = 578). But
  both Type-1 chamber-pressure files (X-15) end the history at 80 s while `total_time` is
  1000 s. So the rule is either thrust-history-only, or not a hard requirement. Do **not**
  enforce it until clarified. (Likely: the curve need only cover the powered phase, and the
  vehicle coasts/glides afterward to `total_time`.)
- Final review of the complete `min`/`max`/`step` list (Chuck approved the earlier values;
  the pages 9–12 list went out in the last email — awaiting any corrections).
- Placeholder maximums: most page 9–12 numeric fields use an upper bound of 9,000,000.
  Confirm real limits or that "effectively unbounded" is fine.
- `longitude` range — unspecified (latitude is ±90). Leave unbounded, or ±180?
- `n_history` / `n_traj` max of 40 — examples stay well under (≤ 38); confirm the cap.
- No example yet for `traj_control = 0` (pitch attitude + bank), `n_weight > 2`, `n_stages`
  2 or 3, or a single-stage vertical launch. All low-risk.
