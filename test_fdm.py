import uuid, os, json
from pathlib import Path

# Add stl import mock to avoid the missing module error during test
import sys
from unittest.mock import MagicMock
sys.modules['stl'] = MagicMock()

from server import _run_fdm_slice_job

job_id = 'test_job_123'
form_params = {
    'layer_height': '0.3',
    'infill': '10',
    'nozzle_temp': '210',
    'bed_temp': '65',
    'infill_pattern': 'honeycomb',
    'perimeters': '4',
    'models_metadata': '[]',
    'nozzle_diameter': '0.4',
    'supports': 'false'
}

job_dir = Path('jobs') / job_id
job_dir.mkdir(parents=True, exist_ok=True)
stl_path = job_dir / 'empty.stl'
stl_path.touch()

_run_fdm_slice_job(job_id, stl_path, job_dir, form_params)
print("job_config.ini content:")
print((job_dir / "job_config.ini").read_text(encoding='utf-8'))
