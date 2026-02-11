"""
One-time script to convert AGE-PRO CSV files into js/data.js.
Run: python preprocess_csv.py
"""

import csv
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

CSV_FILES = [
    os.path.join(SCRIPT_DIR, "csv_files", "BULK_LOAD_LupusTargets.csv"),
    os.path.join(SCRIPT_DIR, "csv_files", "BULK_LOAD_UScoTargets_B6.csv"),
    os.path.join(SCRIPT_DIR, "csv_files", "BULK_LOAD_UScoTargets_B7.csv"),
]

OUTPUT_FILE = os.path.join(SCRIPT_DIR, "js", "data.js")


def normalize_molecule(mol):
    mol = mol.strip()
    if mol == "CO":
        return "12CO"
    return mol


def normalize_data_type(dt):
    return " ".join(dt.split())


def parse_size(s):
    s = s.strip().replace("\t", "")
    try:
        return float(s) if s else 0
    except ValueError:
        return 0


def extract_filename(url):
    return url.rstrip("/").split("/")[-1]


def main():
    records = []
    rid = 0

    for fpath in CSV_FILES:
        with open(fpath, "r", encoding="utf-8") as f:
            for i, line in enumerate(f):
                line = line.rstrip("\n").rstrip("\r")

                # Skip header
                if i == 0 and line.startswith("Region"):
                    continue

                # Skip blank / whitespace-only lines
                stripped = line.replace(",", "").strip()
                if not stripped:
                    continue

                parts = line.split(",")
                if len(parts) < 8:
                    continue

                region = parts[0].strip()
                disk = parts[1].strip()
                band = parts[2].strip()
                molecule = normalize_molecule(parts[3])
                url = parts[4].strip()
                data_type = normalize_data_type(parts[5])
                # parts[6] is Link Imagen (mostly empty)
                size_mb = parse_size(parts[7])

                if not region or not url:
                    continue

                filename = extract_filename(url)
                target_dir = f"AGEPRO_DATA/{region}/{disk}/{band}/{molecule}"

                records.append(
                    {
                        "id": rid,
                        "region": region,
                        "disk": disk,
                        "band": band,
                        "molecule": molecule,
                        "url": url,
                        "filename": filename,
                        "dataType": data_type,
                        "sizeMB": size_mb,
                        "targetDir": target_dir,
                    }
                )
                rid += 1

    with open(OUTPUT_FILE, "w") as f:
        f.write("// Auto-generated from CSV files. Do not edit manually.\n")
        f.write("const AGEPRO_DATA = ")
        f.write(json.dumps(records, indent=2))
        f.write(";\n")

    print(f"Processed {rid} records into {OUTPUT_FILE}")

    # Print summary
    regions = sorted(set(r["region"] for r in records))
    disks = sorted(set(r["disk"] for r in records))
    bands = sorted(set(r["band"] for r in records))
    molecules = sorted(set(r["molecule"] for r in records))
    data_types = sorted(set(r["dataType"] for r in records))

    print(f"Regions ({len(regions)}): {regions}")
    print(f"Disks ({len(disks)}): {disks}")
    print(f"Bands ({len(bands)}): {bands}")
    print(f"Molecules ({len(molecules)}): {molecules}")
    print(f"Data Types ({len(data_types)}): {data_types}")


if __name__ == "__main__":
    main()
