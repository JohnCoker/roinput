# Test data

This directory contains RASOrbit input (`.dat`) files and, for the valid set, the
corresponding `.out` echoes RASOrbit produces when it runs them.

The directories are organized by **parse outcome**:

- `valid` — corrected inputs with matching `.out` files (parse oracle for read tests)
- `cosmetic` — cosmetic-only variants (spacing, padding, blank lines, rewrapped vectors);
  each parses cleanly to the same model as its counterpart in `valid/`
- `broken` — structural damage (a value added or dropped); parsing is flagged and the
  tail is quarantined
- `canonical` — golden master output from our serializer, shared by `valid/` and
  `cosmetic/` fixtures (write tests)

Cosmetic variants pair with `valid/` by filename. A trailing ` (variant)` suffix (e.g.
`DATA-10B - Metric Units (rewrapped).dat`) strips to the corrected base name for pairing.
