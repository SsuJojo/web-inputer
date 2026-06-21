# PyInstaller spec for building remote-input.exe (one-file).
# Build:  .venv\Scripts\python.exe -m PyInstaller remote-input.spec --noconfirm
from PyInstaller.utils.hooks import collect_submodules

datas = [("app/static", "app/static")]

hiddenimports = []
# uvicorn protocol/backends pulled in by string import in some setups
hiddenimports += collect_submodules("uvicorn")
# pynput Windows backends
hiddenimports += collect_submodules("pynput")
# passlib lazily imports bcrypt handler
hiddenimports += collect_submodules("passlib")
hiddenimports += ["bcrypt"]
# pywin32 modules used at runtime
hiddenimports += [
    "win32api",
    "win32con",
    "win32gui",
    "win32process",
    "win32clipboard",
    "pywintypes",
    "pythoncom",
]
# our own package so the frozen importer can resolve app.main:app
hiddenimports += [
    "app",
    "app.main",
    "app.config",
    "app.auth",
    "app.input_controller",
    "app.screen_preview",
    "app.window_switcher",
]

a = Analysis(
    ["run.py"],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name="remote-input",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
