# f3d_studio.spec — PyInstaller build spec for F3D Studio
# Run: pyinstaller f3d_studio.spec

import sys
from pathlib import Path
from PyInstaller.building.build_main import Analysis, PYZ, EXE, COLLECT
from PyInstaller.config import CONF
from PyInstaller.utils.hooks import collect_all, collect_submodules

# The source root
SRC = Path(SPECPATH)

block_cipher = None

# Collect all submodules for packages that PyInstaller struggles with
collect_numpy = collect_all('numpy')
collect_scipy = collect_all('scipy')
collect_pil = collect_all('PIL')
collect_requests = collect_all('requests')
collect_urllib3 = collect_all('urllib3')
collect_trimesh = collect_all('trimesh')
collect_stl = collect_all('stl')
collect_webview = collect_all('webview')
collect_pythonnet = collect_all('pythonnet')

# Merge binaries and datas from collect_all
extra_binaries = []
extra_datas = []

for collected in [collect_numpy, collect_scipy, collect_pil, collect_requests, collect_urllib3, collect_trimesh, collect_stl, collect_webview, collect_pythonnet]:
    extra_binaries.extend(collected[0])  # binaries
    extra_datas.extend(collected[1])     # datas

a = Analysis(
    ['server.py'],
    pathex=[str(SRC)],
    binaries=extra_binaries,
    datas=[
        # Compiled React frontend
        ('dist', 'dist'),
        # Public STL models served at /nozzle.stl etc.
        ('public', 'public'),
        # CAD tip models
        ('CAD_tips', 'CAD_tips'),
        # PrusaSlicer executable and all its files
        ('PrusaSlicer-2.9.3', 'PrusaSlicer-2.9.3'),
        # Default print config
        ('config.ini', '.'),
        # Klipper configs (reference only)
        ('klipper_configs', 'klipper_configs'),
        # Python utility modules
        ('utils', 'utils'),
    ] + extra_datas,
    hiddenimports=[
        'flask',
        'flask_cors',
        'werkzeug',
        'werkzeug.serving',
        'werkzeug.routing',
        'werkzeug.middleware',
        'numpy',
        'numpy._core',
        'numpy._core._exceptions',
        'numpy._core._multiarray_umath',
        'numpy._core.multiarray',
        'numpy._core.umath',
        'numpy._core.numeric',
        'numpy._core.shape_base',
        'numpy._core.fromnumeric',
        'numpy._core._methods',
        'numpy._core.arrayprint',
        'numpy._core.defchararray',
        'numpy._core.records',
        'numpy._core.memmap',
        'numpy._core.function_base',
        'numpy._core.getlimits',
        'numpy._core.machar',
        'numpy._core.einsumfunc',
        'numpy._core._string_helpers',
        'numpy._core._type_aliases',
        'numpy._core._dtype',
        'numpy.lib',
        'numpy.lib.format',
        'numpy.lib.mixins',
        'numpy.lib.scimath',
        'numpy.lib.stride_tricks',
        'numpy.linalg',
        'numpy.linalg._umath_linalg',
        'numpy.fft',
        'numpy.fft._pocketfft',
        'numpy.random',
        'numpy.random._common',
        'numpy.random._generator',
        'numpy.random._mt19937',
        'numpy.random._pcg64',
        'numpy.random._sfc64',
        'numpy.random._philox',
        'numpy.random._bounded_integers',
        'numpy.random.bit_generator',
        'scipy',
        'scipy.spatial',
        'PIL',
        'PIL.Image',
        'PIL._imaging',
        'PIL.JpegImagePlugin',
        'PIL.PngImagePlugin',
        'PIL.GifImagePlugin',
        'PIL.BmpImagePlugin',
        'PIL.TiffImagePlugin',
        'PIL.WebPImagePlugin',
        'stl',
        'trimesh',
        'engineio',
        'socketio',
        # HTTP client (used by moonraker_client)
        'requests',
        'requests.adapters',
        'requests.api',
        'requests.auth',
        'requests.cookies',
        'requests.exceptions',
        'requests.hooks',
        'requests.models',
        'requests.packages',
        'requests.sessions',
        'requests.status_codes',
        'requests.structures',
        'requests.utils',
        'urllib3',
        'urllib3.util',
        'urllib3.util.connection',
        'urllib3.util.retry',
        'urllib3.util.timeout',
        'urllib3.util.url',
        'urllib3.util.ssl_',
        'urllib3.util.ssltransport',
        'urllib3.connection',
        'urllib3.connectionpool',
        'urllib3.poolmanager',
        'urllib3.response',
        'urllib3.fields',
        'urllib3.filepost',
        'urllib3.exceptions',
        'charset_normalizer',
        'certifi',
        'idna',
        # Local project modules
        'moonraker_client',
        'fdm_print_manager',
        'configparser',
        # Desktop window (pywebview)
        'webview',
        'webview.platforms.winforms',
        'pythonnet',
        'clr',
        'clr_loader',
        'clr_loader.hostfxr',
        'clr_loader.mono',
        'clr_loader.netfx',
        'clr_loader.types',
        'cffi',
        'cffi.api',
        'cffi.backend_ctypes',
        'cffi.cparser',
        'cffi.ffiplatform',
        'cffi.model',
        'cffi.pkgconfig',
        'cffi.recompiler',
        'cffi.vengine_cpy',
        'cffi.vengine_gen',
        'cffi.verifier',
        'proxy_tools',
        'bottle',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[
        # Exclude heavy ML/CUDA packages not needed by F3D Studio
        'torch', 'torchvision', 'torchaudio',
        'tensorflow', 'keras',
        'matplotlib', 'PyQt5', 'PyQt6', 'tkinter',
        'IPython', 'jupyter', 'notebook',
        'sklearn', 'skimage',
        'cv2',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='F3D_Studio',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,         # Native desktop app — no terminal window
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='public/f3d_icon.ico',  # App icon for Windows title bar and executable
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='F3D_Studio',
)
