# Controller Directory

This directory contains the low-level drivers for the Projector and Motor, typically deployed to the Raspberry Pi.

## `src/`

### `src/UV_projector/`
Core driver package for the DLPC1438 controller.
- **`__init__.py`**: Makes the directory a Python package. **(In Use)**
- **`controller.py`**: The main `DLPC1438` class that handles I2C/SPI communication. **(In Use)**
- **`img_convert.py`**: Helper module to convert images to SPI-compatible arrays. **(In Use)**
