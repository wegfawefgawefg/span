from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any


class Project:
    def __init__(self, project_dir: str | Path) -> None:
        self.root = Path(project_dir).resolve()
        self.sheets_dir = self.root / "sheets"
        self.annotations_dir = self.root / "annotations"
        self.manifest_path = self.root / "manifest.json"
        self.annotations_dir.mkdir(parents=True, exist_ok=True)

    def list_sheet_files(self) -> list[Path]:
        return sorted(
            p for p in self.sheets_dir.glob("*.png") if p.is_file()
        )

    def annotation_path_for_sheet(self, sheet_name: str) -> Path:
        stem = Path(sheet_name).stem
        return self.annotations_dir / f"{stem}.annotations.json"

    def load_annotations(self, sheet_name: str) -> dict[str, Any]:
        path = self.annotation_path_for_sheet(sheet_name)
        if not path.exists():
            return {"image": sheet_name, "annotations": []}
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {"image": sheet_name, "annotations": []}

    def save_annotations(
        self, sheet_name: str, payload: dict[str, Any]
    ) -> None:
        self.annotations_dir.mkdir(parents=True, exist_ok=True)
        path = self.annotation_path_for_sheet(sheet_name)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(
            json.dumps(payload, indent=2) + "\n", encoding="utf-8"
        )
        os.replace(tmp, path)

    def load_manifest(self) -> dict[str, dict[str, Any]]:
        if not self.manifest_path.exists():
            return {}
        try:
            data = json.loads(
                self.manifest_path.read_text(encoding="utf-8")
            )
            result: dict[str, dict[str, Any]] = {}
            for asset in data.get("assets", []):
                file_name = asset.get("file")
                if isinstance(file_name, str):
                    result[file_name] = asset
            return result
        except json.JSONDecodeError:
            return {}

    def sheet_exists(self, sheet_name: str) -> bool:
        return (self.sheets_dir / sheet_name).is_file()

    def sheet_path(self, sheet_name: str) -> Path:
        return self.sheets_dir / sheet_name
