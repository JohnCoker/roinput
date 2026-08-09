---
layout: default
---
This is a desktop application for editing RASOrbit input files (`.dat`).
It presents the file as a sequence of pages—header, per-stage aerodynamic and engine data,
launch and trajectory settings—with a page outline on the left and the current page on the right.

This is an add-on program to **RASOrbit**; see [www.rasaero.com](http://www.rasaero.com) for more info.

## Download

Pre-built files are available for some platforms,
[latest](https://github.com/johncoker/roinput/releases):
- [Windows (Intel 64-bit)](https://github.com/johncoker/roinput/releases)
- [macOS (Apple Silicon)](https://github.com/johncoker/roinput/releases)
- [Linux (Intel 64-bit)](https://github.com/johncoker/roinput/releases)

Other platforms may be built from [source](https://github.com/johncoker/roinput/).

## Usage

1. **Launch** the app.

2. **Open or create a file**:
   - Use **File → New** to start from a blank template, or
   - Use **File → Open File…** to open an existing `.dat` file, or
   - Open a `.dat` file via the OS with this application.

3. **Navigate pages**:
   - Use the outline on the left to jump between pages.
   - Per-stage pages repeat for each stage in the file (up to four).
   - Each page shows a heading and footing with guidance where needed.

4. **Edit fields**:
   - Enter values in the controls on the current page.
   - Changing the number of stages, angles of attack, or Mach numbers resizes the
     dependent grids and vectors automatically.
   - On the **Configuration** page, SI/English and CN/CA/CP vs CL/CD/CP change labels and units shown;
     they do **not** convert stored numbers.

5. **Check status**:
   - The outline marks pages as complete, incomplete, or in error.
   - Incomplete means required or placeholder data is still unset; error means a value looks invalid for RASOrbit.
   - Invalid values are highlighted on the page.
   - A dot in the window title means the file has unsaved changes.

6. **Save**:
   - Use **File → Save** or **File → Save As…** to write the file back out.
   - You can save work in progress and finish later; unfilled fields are written as zero.
   - Closing or opening another file with unsaved changes prompts to save first.

7. **Help**:
   - **Help → Check for Updates…** looks for a newer release.
   - **Help → About…** shows the app version and license.

## Details

The author is [John Coker](mailto:john@jcsw.com).
This app is free software; feel free to use it for personal, educational or commercial missions.
There is no support and no warranty.

<script src="release.js"></script>
