#!/usr/bin/env python3
"""
Static preflight validator for React tutorial FSM implementations.

This script performs repository-level checks for common tutorial regressions:
- step/event mismatches,
- selector specificity risks,
- missing API wiring for final email CTA,
- styling and media accessibility signals.

Usage:
  python skills/react-tutorial-fsm/scripts/validate_tutorial.py \
    --root /path/to/repo \
    --steps-file frontend/src/components/TryTutorial.tsx \
    --report tutorial-preflight.json
"""

from __future__ import annotations

import argparse
import ast
import json
import re
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Iterable, List, Optional, Set


STEP_BLOCK_RE = re.compile(r"new\s+TutorialStep\s*\(\s*\{(.*?)\}\s*\)", re.DOTALL)
STRING_FIELD_RE_TEMPLATE = r"{field}\s*:\s*(?P<value>'(?:\\.|[^'])*'|\"(?:\\.|[^\"])*\"|`(?:\\.|[^`])*`)"
BOOL_FIELD_RE_TEMPLATE = r"{field}\s*:\s*(?P<value>true|false)"
TUPLE_STEP_RE = re.compile(
    r"\[\s*(?P<message>'(?:\\.|[^'])*'|\"(?:\\.|[^\"])*\")\s*,\s*"
    r"(?P<selector>null|'(?:\\.|[^'])*'|\"(?:\\.|[^\"])*\")\s*,\s*"
    r"(?P<event>null|'(?:\\.|[^'])*'|\"(?:\\.|[^\"])*\")\s*(?:,\s*(?P<extra>[^\]]+))?\]",
    re.DOTALL,
)
EVENT_EMIT_RE = re.compile(r"\btutorialEvent\s*\(\s*(['\"])(?P<name>[^'\"]+)\1\s*\)")
RAW_EVENT_EMIT_RE = re.compile(r"new\s+Event\s*\(\s*(['\"])(?P<name>[^'\"]+)\1\s*\)")

MEDIA_IMAGE_RE = re.compile(r"\{[^{}]*type\s*:\s*['\"]image['\"][^{}]*\}", re.DOTALL)
MEDIA_VIDEO_RE = re.compile(r"\{[^{}]*type\s*:\s*['\"]video['\"][^{}]*\}", re.DOTALL)
MEDIA_MAP_HINT_RE = re.compile(r"\b(mediaByStep|stepMedia|mediaMap|STEP_MEDIA|mediaForStep)\b")

GENERIC_SELECTOR_HINTS = {
    ".item",
    ".row",
    ".card",
    ".button",
    ".btn",
    ".wrapper",
    ".container",
    ".list",
}

SUBSCRIBE_ENDPOINT = "/user/mailing-list/subscribe"
ADMIN_LIST_ENDPOINT = "/mailing-list"
REQUIRED_FRONTEND_PACKAGES = {
    "react",
    "react-dom",
    "react-router-dom",
    "recoil",
    "@floating-ui/dom",
    "framer-motion",
    "motion-plus",
}


@dataclass
class StepDef:
    index: int
    message: Optional[str]
    selector: Optional[str]
    event_name: Optional[str]
    highlight_only: bool
    line: int


@dataclass
class Finding:
    severity: str  # error | warning | info
    code: str
    message: str
    file: Optional[str] = None
    line: Optional[int] = None


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def line_number(source: str, offset: int) -> int:
    return source.count("\n", 0, offset) + 1


def unquote_js_string(literal: str) -> str:
    if not literal:
        return literal
    if literal.startswith("`") and literal.endswith("`"):
        return literal[1:-1].replace("\\`", "`")
    try:
        return ast.literal_eval(literal)
    except Exception:
        return literal.strip("'\"")


def parse_string_field(body: str, field: str) -> Optional[str]:
    pattern = re.compile(STRING_FIELD_RE_TEMPLATE.format(field=re.escape(field)), re.DOTALL)
    match = pattern.search(body)
    if not match:
        return None
    return unquote_js_string(match.group("value"))


def parse_bool_field(body: str, field: str) -> Optional[bool]:
    pattern = re.compile(BOOL_FIELD_RE_TEMPLATE.format(field=re.escape(field)))
    match = pattern.search(body)
    if not match:
        return None
    return match.group("value") == "true"


def parse_steps(source: str) -> List[StepDef]:
    steps: List[StepDef] = []
    for idx, match in enumerate(STEP_BLOCK_RE.finditer(source)):
        body = match.group(1)
        steps.append(
            StepDef(
                index=idx,
                message=parse_string_field(body, "message"),
                selector=parse_string_field(body, "selector"),
                event_name=parse_string_field(body, "eventName"),
                highlight_only=parse_bool_field(body, "highlightOnly") or False,
                line=line_number(source, match.start()),
            )
        )

    if steps:
        return steps

    # Fallback for tuple-style definitions.
    for idx, match in enumerate(TUPLE_STEP_RE.finditer(source)):
        selector_raw = match.group("selector")
        event_raw = match.group("event")
        extra = (match.group("extra") or "").lower()
        steps.append(
            StepDef(
                index=idx,
                message=unquote_js_string(match.group("message")),
                selector=None if selector_raw == "null" else unquote_js_string(selector_raw),
                event_name=None if event_raw == "null" else unquote_js_string(event_raw),
                highlight_only="highlightonly" in extra and "true" in extra,
                line=line_number(source, match.start()),
            )
        )
    return steps


def collect_files(root: Path, patterns: Iterable[str]) -> List[Path]:
    files: List[Path] = []
    seen: Set[Path] = set()
    for pattern in patterns:
        for path in root.glob(pattern):
            if not path.is_file():
                continue
            if path in seen:
                continue
            seen.add(path)
            files.append(path)
    return files


def collect_emitted_events(paths: Iterable[Path]) -> Set[str]:
    events: Set[str] = set()
    for path in paths:
        try:
            content = read_text(path)
        except UnicodeDecodeError:
            continue
        for pattern in (EVENT_EMIT_RE, RAW_EVENT_EMIT_RE):
            for match in pattern.finditer(content):
                events.add(match.group("name"))
    return events


def selector_specificity_warning(selector: str) -> bool:
    value = selector.strip()
    if not value:
        return False
    if ".tutorial-" in value or "[data-tutorial" in value or "#" in value:
        return False
    if value in GENERIC_SELECTOR_HINTS:
        return True
    class_tokens = re.findall(r"\.[a-zA-Z0-9_-]+", value)
    attr_tokens = re.findall(r"\[[^\]]+\]", value)
    if len(class_tokens) == 1 and not attr_tokens:
        return True
    return False


def check_media_specs(steps_source: str, steps_file: Path) -> List[Finding]:
    findings: List[Finding] = []
    if MEDIA_MAP_HINT_RE.search(steps_source):
        findings.append(
            Finding(
                severity="warning",
                code="MEDIA_MAP_PATTERN_DETECTED",
                message="Detected media-map naming pattern. Prefer keeping media on each `TutorialStep.media`.",
                file=str(steps_file),
            )
        )

    for match in MEDIA_IMAGE_RE.finditer(steps_source):
        block = match.group(0)
        if "alt" not in block:
            findings.append(
                Finding(
                    severity="error",
                    code="MEDIA_IMAGE_ALT_MISSING",
                    message="Image media entry is missing required `alt` text.",
                    file=str(steps_file),
                    line=line_number(steps_source, match.start()),
                )
            )
    for match in MEDIA_VIDEO_RE.finditer(steps_source):
        block = match.group(0)
        if "poster" not in block:
            findings.append(
                Finding(
                    severity="warning",
                    code="MEDIA_VIDEO_POSTER_MISSING",
                    message="Video media entry should include a `poster` for stable loading UX.",
                    file=str(steps_file),
                    line=line_number(steps_source, match.start()),
                )
            )
    if "<video" in steps_source and "playsInline" not in steps_source:
        findings.append(
            Finding(
                severity="warning",
                code="VIDEO_PLAYSINLINE_MISSING",
                message="Video rendering found without `playsInline`; mobile playback may break.",
                file=str(steps_file),
            )
        )
    return findings


def check_styling_specs(css_files: List[Path]) -> List[Finding]:
    findings: List[Finding] = []
    if not css_files:
        findings.append(
            Finding(
                severity="warning",
                code="TUTORIAL_CSS_NOT_FOUND",
                message="No tutorial css file found for styling validation.",
            )
        )
        return findings

    merged = ""
    for css in css_files:
        try:
            merged += "\n" + read_text(css)
        except UnicodeDecodeError:
            continue

    required_tokens = [".tutorial-dim", ".tutorial-text"]
    for token in required_tokens:
        if token not in merged:
            findings.append(
                Finding(
                    severity="error",
                    code="STYLE_TOKEN_MISSING",
                    message=f"Required tutorial style token missing: {token}",
                )
            )

    if "prefers-reduced-motion" not in merged:
        findings.append(
            Finding(
                severity="warning",
                code="REDUCED_MOTION_MISSING",
                message="No `prefers-reduced-motion` styles found for tutorial animations.",
            )
        )

    if ":focus" not in merged and ":focus-visible" not in merged:
        findings.append(
            Finding(
                severity="warning",
                code="FOCUS_STYLE_MISSING",
                message="No tutorial focus styles detected for keyboard accessibility.",
            )
        )

    return findings


def check_frontend_packages(root: Path) -> List[Finding]:
    findings: List[Finding] = []
    candidate_files = [root / "frontend/package.json", root / "package.json"]
    package_file = next((p for p in candidate_files if p.exists()), None)

    if package_file is None:
        findings.append(
            Finding(
                severity="warning",
                code="PACKAGE_JSON_NOT_FOUND",
                message="No package.json found (checked frontend/package.json and package.json).",
            )
        )
        return findings

    try:
        package_json = json.loads(read_text(package_file))
    except json.JSONDecodeError:
        findings.append(
            Finding(
                severity="error",
                code="PACKAGE_JSON_INVALID",
                message=f"Invalid JSON in {package_file}",
                file=str(package_file),
            )
        )
        return findings

    deps = package_json.get("dependencies", {})
    dev_deps = package_json.get("devDependencies", {})
    merged = set(deps.keys()) | set(dev_deps.keys())

    for pkg in sorted(REQUIRED_FRONTEND_PACKAGES):
        if pkg not in merged:
            findings.append(
                Finding(
                    severity="warning",
                    code="PACKAGE_MISSING",
                    message=f"Required package not found in package.json: {pkg}",
                    file=str(package_file),
                )
            )

    return findings


def check_typewriter_usage(steps_source: str, steps_file: Path) -> List[Finding]:
    findings: List[Finding] = []
    if "motion-plus/react" not in steps_source:
        findings.append(
            Finding(
                severity="warning",
                code="TYPEWRITER_IMPORT_MISSING",
                message='Tutorial runtime does not import from "motion-plus/react".',
                file=str(steps_file),
            )
        )
    if "<Typewriter" not in steps_source:
        findings.append(
            Finding(
                severity="warning",
                code="TYPEWRITER_COMPONENT_MISSING",
                message="Tutorial runtime does not render Motion+ <Typewriter>.",
                file=str(steps_file),
            )
        )
    if "function TypewriterText" in steps_source:
        findings.append(
            Finding(
                severity="warning",
                code="CUSTOM_TYPEWRITER_DETECTED",
                message="Custom TypewriterText implementation detected; use Motion+ Typewriter API.",
                file=str(steps_file),
            )
        )
    return findings


def run_validation(root: Path, steps_file: Path) -> dict:
    findings: List[Finding] = []

    if not steps_file.exists():
        findings.append(
            Finding(
                severity="error",
                code="STEPS_FILE_NOT_FOUND",
                message=f"Steps file not found: {steps_file}",
            )
        )
        return {"steps": [], "events_declared": [], "events_emitted": [], "findings": findings}

    steps_source = read_text(steps_file)
    steps = parse_steps(steps_source)

    if not steps:
        findings.append(
            Finding(
                severity="error",
                code="NO_STEPS_PARSED",
                message="Could not parse tutorial steps. Ensure Step object/class definitions are present.",
                file=str(steps_file),
            )
        )

    source_files = collect_files(
        root,
        [
            "frontend/src/**/*.ts",
            "frontend/src/**/*.tsx",
            "backend/src/**/*.py",
        ],
    )
    emitted_events = collect_emitted_events(source_files)

    selectors_seen: Set[str] = set()
    declared_events: Set[str] = set()

    for step in steps:
        if step.selector:
            if selector_specificity_warning(step.selector):
                findings.append(
                    Finding(
                        severity="warning",
                        code="SELECTOR_TOO_GENERIC",
                        message=f"Selector may be too generic for deterministic targeting: `{step.selector}`",
                        file=str(steps_file),
                        line=step.line,
                    )
                )
            if step.selector in selectors_seen:
                findings.append(
                    Finding(
                        severity="info",
                        code="SELECTOR_REUSED",
                        message=f"Selector reused across steps: `{step.selector}`",
                        file=str(steps_file),
                        line=step.line,
                    )
                )
            selectors_seen.add(step.selector)

        if step.event_name:
            declared_events.add(step.event_name)
            if step.event_name not in emitted_events:
                findings.append(
                    Finding(
                        severity="error",
                        code="EVENT_WITHOUT_EMITTER",
                        message=f"No emitter found for step event `{step.event_name}`.",
                        file=str(steps_file),
                        line=step.line,
                    )
                )

        if step.highlight_only and step.event_name:
            findings.append(
                Finding(
                    severity="warning",
                    code="HIGHLIGHT_ONLY_WITH_EVENT",
                    message="Step has both `highlightOnly=true` and `eventName`; ensure semantics are intentional.",
                    file=str(steps_file),
                    line=step.line,
                )
            )

    # API wiring checks for final email CTA.
    frontend_files = collect_files(root, ["frontend/src/**/*.ts", "frontend/src/**/*.tsx"])
    backend_files = collect_files(root, ["backend/src/**/*.py"])

    frontend_merged = "\n".join(read_text(p) for p in frontend_files if p.exists())
    backend_merged = "\n".join(read_text(p) for p in backend_files if p.exists())

    if SUBSCRIBE_ENDPOINT not in frontend_merged:
        findings.append(
            Finding(
                severity="error",
                code="SUBSCRIBE_API_NOT_CALLED",
                message=f"Frontend does not reference `{SUBSCRIBE_ENDPOINT}`.",
            )
        )
    if '@router.post("/mailing-list/subscribe")' not in backend_merged:
        findings.append(
            Finding(
                severity="error",
                code="SUBSCRIBE_API_NOT_DEFINED",
                message="Backend subscribe endpoint `/mailing-list/subscribe` not found.",
            )
        )
    if "mailing list" not in backend_merged:
        findings.append(
            Finding(
                severity="warning",
                code="MAILING_LIST_COLLECTION_NAME",
                message='Backend does not appear to reference collection/table name "mailing list".',
            )
        )
    if ADMIN_LIST_ENDPOINT not in backend_merged:
        findings.append(
            Finding(
                severity="warning",
                code="ADMIN_LIST_ENDPOINT_MISSING",
                message="Admin mailing list read endpoint not detected.",
            )
        )

    # Event bus sanity check.
    if "tutorial:app-event" not in steps_source:
        findings.append(
            Finding(
                severity="warning",
                code="NORMALIZED_EVENT_BUS_MISSING",
                message="No normalized tutorial app-event bus detected in steps/runtime file.",
                file=str(steps_file),
            )
        )

    findings.extend(check_media_specs(steps_source, steps_file))
    tutorial_css_files = collect_files(root, ["frontend/src/assets/css/tutorial.css", "frontend/src/**/*.tutorial*.css"])
    findings.extend(check_styling_specs(tutorial_css_files))
    findings.extend(check_frontend_packages(root))
    findings.extend(check_typewriter_usage(steps_source, steps_file))

    return {
        "steps": steps,
        "events_declared": sorted(declared_events),
        "events_emitted": sorted(emitted_events),
        "findings": findings,
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Static validator for React tutorial FSM implementations.")
    parser.add_argument("--root", default=".", help="Repository root path.")
    parser.add_argument(
        "--steps-file",
        required=True,
        help="Path to tutorial steps/runtime file, relative to --root.",
    )
    parser.add_argument("--report", help="Optional path to write JSON report.")
    parser.add_argument("--json", action="store_true", help="Print JSON report to stdout.")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    steps_file = (root / args.steps_file).resolve()

    result = run_validation(root, steps_file)
    findings: List[Finding] = result["findings"]

    errors = [f for f in findings if f.severity == "error"]
    warnings = [f for f in findings if f.severity == "warning"]
    infos = [f for f in findings if f.severity == "info"]

    report = {
        "root": str(root),
        "steps_file": str(steps_file),
        "step_count": len(result["steps"]),
        "events_declared": result["events_declared"],
        "events_emitted": result["events_emitted"],
        "summary": {
            "errors": len(errors),
            "warnings": len(warnings),
            "infos": len(infos),
        },
        "findings": [asdict(f) for f in findings],
    }

    if args.report:
        report_path = (root / args.report).resolve()
        report_path.parent.mkdir(parents=True, exist_ok=True)
        report_path.write_text(json.dumps(report, indent=2), encoding="utf-8")

    if args.json:
        print(json.dumps(report, indent=2))
    else:
        print(f"Tutorial preflight: {len(errors)} error(s), {len(warnings)} warning(s), {len(infos)} info")
        for finding in findings:
            loc = ""
            if finding.file:
                loc = f" [{finding.file}"
                if finding.line:
                    loc += f":{finding.line}"
                loc += "]"
            print(f"- {finding.severity.upper()} {finding.code}{loc}: {finding.message}")

    return 1 if errors else 0


if __name__ == "__main__":
    raise SystemExit(main())
