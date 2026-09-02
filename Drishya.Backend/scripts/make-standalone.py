#!/usr/bin/env python3
"""
Rebuild csv-journey-standalone.py from csv-journey.py and lane_geometry.py.

    python Drishya.Backend/scripts/make-standalone.py
    python Drishya.Backend/scripts/make-standalone.py --check    # CI-friendly

WHY A SECOND COPY OF THE SAME PROGRAM EXISTS
--------------------------------------------
csv-journey.py imports lane_geometry.py, which is correct in a repository:
three scripts share that geometry and must not drift about where a vehicle is.
It is wrong on a locked-down desktop that cannot reach GitHub, where every file
has to arrive through whatever channel happens to work -- a mail attachment, a
memory stick, a paste buffer. Two files is twice the chance of arriving with
one of them missing, and the failure then reads as
"ModuleNotFoundError: No module named 'lane_geometry'", which names the file
that is absent but not the reason it matters.

So the standalone is generated rather than hand-maintained. Editing
lane_geometry.py and forgetting this copy is the obvious hazard; --check exists
to make that visible rather than discovered on the desktop that cannot be
debugged.
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = os.path.join(HERE, "csv-journey.py")
GEOMETRY = os.path.join(HERE, "lane_geometry.py")
TARGET = os.path.join(HERE, "csv-journey-standalone.py")

IMPORT_BLOCK = (
    'sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))\n'
    'from lane_geometry import bearing_deg, cumulative, haversine_km, point_at_km'
    '  # noqa: E402\n'
)

HEADER = """\
# --- lane geometry, inlined -------------------------------------------------
#
# GENERATED. In the repository this lives in lane_geometry.py, shared with
# csv-rds-feeder.py and csv-telemetry-feeder.py so the three cannot disagree
# about where a vehicle is. It is copied in here only so this file can be
# moved to a machine that cannot reach GitHub as ONE file rather than two.
#
# Edit lane_geometry.py, never this copy, and regenerate with:
#     python Drishya.Backend/scripts/make-standalone.py

"""


def build():
    geometry = open(GEOMETRY, encoding="utf-8").read()
    journey = open(SOURCE, encoding="utf-8").read()

    # Drop the module docstring and the imports; the host file already has them.
    body = geometry.split('"""', 2)[2].lstrip("\n")
    body = "\n".join(line for line in body.split("\n")
                     if not line.startswith(("import ", "from ")))

    if IMPORT_BLOCK not in journey:
        raise SystemExit(
            "csv-journey.py no longer contains the import block this script "
            "splices over. Update IMPORT_BLOCK here to match it.")

    out = journey.replace(IMPORT_BLOCK, HEADER + body.strip("\n") + "\n")
    # math is used by the inlined geometry and is not imported by the host.
    out = out.replace("import argparse\nimport csv\nimport json\nimport os\n",
                      "import argparse\nimport csv\nimport json\nimport math\nimport os\n")
    # The usage lines in the docstring name the file being run.
    return out.replace("python csv-journey.py", "python csv-journey-standalone.py")


def main():
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--check", action="store_true",
                   help="Exit non-zero if the standalone is out of date. Writes nothing.")
    args = p.parse_args()

    fresh = build()

    if args.check:
        current = open(TARGET, encoding="utf-8").read() if os.path.exists(TARGET) else ""
        if current == fresh:
            print("csv-journey-standalone.py is up to date.")
            return
        print("csv-journey-standalone.py is STALE — regenerate it:\n"
              "    python Drishya.Backend/scripts/make-standalone.py", file=sys.stderr)
        sys.exit(1)

    open(TARGET, "w", encoding="utf-8").write(fresh)
    print("Wrote %s (%d lines)." % (os.path.basename(TARGET), fresh.count("\n")))


if __name__ == "__main__":
    main()
