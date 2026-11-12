"""Starts server.py from Python's own pythonw.exe with the virtual environment's packages.

Some antivirus programs (Acronis Cyber Protect's machine-learning scan, for one) take the
small pythonw.exe launcher that a virtual environment gets on Windows for malware and
remove it. Python's own pythonw.exe is left alone, so the Windows installer starts that
one with this file: the environment's packages are added here, then server.py runs.

  <Python home>\\pythonw.exe -s launch.py <venv folder> [server.py options]
"""

import os
import runpy
import site
import sys

here = os.path.dirname(os.path.abspath(__file__))
venv = sys.argv[1]
site.addsitedir(os.path.join(venv, 'Lib', 'site-packages'))
if here not in sys.path:
    sys.path.insert(0, here)
sys.argv = [os.path.join(here, 'server.py'), *sys.argv[2:]]
runpy.run_path(sys.argv[0], run_name='__main__')
