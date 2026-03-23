from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import FileResponse, JSONResponse

from span.project import Project

router = APIRouter(prefix="/api")


def _build_sheet_entry(
    project: Project, path: Path, manifest_assets: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    asset = manifest_assets.get(path.name, {})
    annotation_file = str(
        project.annotation_path_for_sheet(path.name).relative_to(
            project.root
        )
    )
    return {
        "file": path.name,
        "name": asset.get("name", path.stem),
        "image_url": f"/sheets/{path.name}",
        "annotation_url": f"/api/annotations?sheet={path.name}",
        "annotation_file": annotation_file,
        "asset_page": asset.get("asset_page", ""),
        "download_url": asset.get("download_url", ""),
    }


@router.get("/sheets")
def list_sheets(request: Request) -> JSONResponse:
    project: Project = request.app.state.project
    manifest = project.load_manifest()
    sheets = [
        _build_sheet_entry(project, p, manifest)
        for p in project.list_sheet_files()
    ]
    return JSONResponse({"sheets": sheets})


@router.get("/annotations")
def get_annotations(
    request: Request, sheet: str = Query(...)
) -> JSONResponse:
    project: Project = request.app.state.project
    if not project.sheet_exists(sheet):
        raise HTTPException(404, "Unknown sheet")
    return JSONResponse(project.load_annotations(sheet))


@router.post("/annotations")
async def save_annotations(
    request: Request, sheet: str = Query(...)
) -> JSONResponse:
    project: Project = request.app.state.project
    if not project.sheet_exists(sheet):
        raise HTTPException(404, "Unknown sheet")
    body = await request.json()
    if not isinstance(body, dict) or "annotations" not in body:
        raise HTTPException(400, "Malformed annotation payload")
    body["image"] = sheet
    project.save_annotations(sheet, body)
    return JSONResponse({"ok": True})


@router.get("/project_annotations")
def project_annotations(request: Request) -> JSONResponse:
    project: Project = request.app.state.project
    manifest = project.load_manifest()
    sheets = []
    for path in project.list_sheet_files():
        entry = _build_sheet_entry(project, path, manifest)
        payload = project.load_annotations(path.name)
        entry["annotations"] = payload.get("annotations", [])
        sheets.append(entry)
    return JSONResponse({"sheets": sheets})
