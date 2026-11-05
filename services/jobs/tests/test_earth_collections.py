"""The collections task's Earth Engine side, with `ee.data` answering for the server."""

import uuid
from collections.abc import Callable
from datetime import date
from typing import Any

import ee
import pytest
from earth_offline import offline_earth
from idea_agro_jobs.collection import COLLECTIONS, CollectionError, ExportState, ExportStatus, refresh
from idea_agro_jobs.domain import Indicator
from idea_agro_jobs.et import millis

ET = COLLECTIONS[Indicator.ET]
JOB = "serviceAccount:data-jobs@idea-agro-dev.iam.gserviceaccount.com"
OWNERS = {"role": "roles/owner", "members": ["user:owner@example.org"]}
WRITERS = {"role": "roles/editor", "members": [JOB]}
PUBLIC = {"version": 1, "bindings": [OWNERS, WRITERS, {"role": "roles/viewer", "members": ["allUsers"]}]}
PRIVATE = {"version": 1, "bindings": [OWNERS, WRITERS]}
COLLECTION = {"type": "IMAGE_COLLECTION", "name": ET.asset, "id": "idea-agro/et"}


def listing(start: date) -> dict[str, Any]:
    """An image as Earth Engine lists it: its `id` is its `name` without `projects/*/assets/`."""
    return {
        "type": "IMAGE",
        "name": f"{ET.asset}/{start:%Y_%m_%d}",
        "id": f"idea-agro/et/{start:%Y_%m_%d}",
        "startTime": f"{start}T00:00:00Z",
        "properties": {"period": "8-day", "unit": "mm/day"},
    }


def operation(name: str, description: str, done: bool, state: str) -> dict[str, Any]:
    metadata = {"@type": "type.googleapis.com/google.earthengine.v1.OperationMetadata", "state": state}
    return {"name": name, "done": done, "metadata": metadata | {"description": description, "type": "EXPORT_IMAGE"}}


class Server:
    """What Earth Engine answers, and what the job asked of it."""

    def __init__(
        self,
        asset: dict[str, Any] | None = COLLECTION,
        policy: dict[str, Any] = PUBLIC,
        writable: bool = True,
        held: tuple[date, ...] = (),
        running: tuple[date, ...] = (),
        published: tuple[date, ...] = (),
    ) -> None:
        self.asset = asset
        self.policy = policy
        self.writable = writable
        self.held = held
        self.running = running
        self.published = published
        self.calls: list[str] = []
        self.written: list[tuple[str, dict[str, Any]]] = []
        self.exports: list[tuple[str, dict[str, Any]]] = []

    def functions(self) -> dict[str, Callable[..., Any]]:
        return {
            "getAsset": self.get_asset,
            "getIamPolicy": self.get_iam_policy,
            "setAssetProperties": self.set_asset_properties,
            "listImages": self.list_images,
            "listOperations": self.list_operations,
            "computeValue": self.compute_value,
            "exportImage": self.export_image,
            "getOperation": self.get_operation,
        }

    def get_asset(self, asset_id: str) -> dict[str, Any]:
        self.calls.append("getAsset")
        if self.asset is None:
            raise ee.EEException(f"Asset '{asset_id}' not found (does not exist or caller does not have access).")
        return self.asset

    def get_iam_policy(self, asset_id: str) -> dict[str, Any]:
        self.calls.append("getIamPolicy")
        return self.policy

    def set_asset_properties(self, asset_id: str, properties: dict[str, Any]) -> None:
        self.calls.append("setAssetProperties")
        if not self.writable:
            raise ee.EEException("Permission 'earthengine.assets.update' denied.")
        self.written.append((asset_id, properties))

    def list_images(self, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("listImages")
        assert params == {"parent": ET.asset}
        return {"images": [listing(start) for start in self.held]}

    def list_operations(self, project: str | None = None) -> list[dict[str, Any]]:
        self.calls.append("listOperations")
        return [
            operation("projects/pastizales-uy/operations/OWNER", "ET-8", False, "RUNNING"),
            operation("projects/pastizales-uy/operations/OLD", "idea-agro-et-2023_12_27", True, "SUCCEEDED"),
            *(
                operation(f"projects/pastizales-uy/operations/R{n}", f"idea-agro-et-{start:%Y_%m_%d}", False, "PENDING")
                for n, start in enumerate(self.running)
            ),
        ]

    def compute_value(self, computed: Any) -> list[int]:
        self.calls.append("computeValue")
        return [millis(start) for start in self.published]

    def export_image(self, request_id: str, params: dict[str, Any]) -> dict[str, Any]:
        self.calls.append("exportImage")
        self.exports.append((request_id, params))
        return {"name": f"projects/pastizales-uy/operations/E{len(self.exports)}", "done": False}

    def get_operation(self, name: str) -> dict[str, Any]:
        self.calls.append("getOperation")
        found = operation(name, "", True, "SUCCEEDED")
        found["metadata"]["batchEecuUsageSeconds"] = 42.0
        return found


def test_a_collection_that_is_ready_gets_its_properties_written() -> None:
    server = Server()

    with offline_earth(**server.functions()) as earth:
        earth.check_collection(ET)

    assert server.calls == ["getAsset", "getIamPolicy", "setAssetProperties"]
    assert server.written == [(ET.asset, {"period": "8-day", "unit": "mm/day"})]


@pytest.mark.parametrize(
    ("server", "message", "calls"),
    [
        (Server(asset=None), "must exist and be shared with the job", ["getAsset"]),
        (Server(asset=COLLECTION | {"type": "FOLDER"}), "must be an ImageCollection, not FOLDER", ["getAsset"]),
        (Server(policy=PRIVATE), "must be readable by anyone", ["getAsset", "getIamPolicy"]),
        (
            Server(writable=False),
            "must be shared with the job's account as a writer",
            ["getAsset", "getIamPolicy", "setAssetProperties"],
        ),
    ],
    ids=["missing", "not a collection", "not public", "cannot write"],
)
def test_a_collection_the_job_cannot_use_fails_the_check_saying_why(
    server: Server, message: str, calls: list[str]
) -> None:
    with offline_earth(**server.functions()) as earth, pytest.raises(CollectionError, match=message):
        earth.check_collection(ET)

    assert server.calls == calls
    assert server.written == []


def test_nothing_is_listed_or_exported_after_a_failed_check() -> None:
    server = Server(policy=PRIVATE, published=(date(2024, 1, 1),))

    with offline_earth(**server.functions()) as earth, pytest.raises(CollectionError):
        refresh(earth, [ET], sleep=lambda seconds: None)

    assert server.calls == ["getAsset", "getIamPolicy"]
    assert server.written == []
    assert server.exports == []


def test_images_operations_and_published_composites_are_read() -> None:
    server = Server(
        held=(date(2024, 1, 1),),
        running=(date(2024, 1, 9),),
        published=(date(2024, 1, 9), date(2024, 1, 1), date(2024, 1, 9)),
    )

    with offline_earth(**server.functions()) as earth:
        images = earth.collection_images(ET.asset)
        running = earth.running_exports(ET)
        published = earth.published(ET, date(2024, 1, 1), date(2024, 12, 31))

    assert [image.name for image in images] == [f"{ET.asset}/2024_01_01"]
    assert running == [date(2024, 1, 9)]
    assert published == [date(2024, 1, 1), date(2024, 1, 9)]


def test_an_export_starts_to_its_image_and_its_state_is_read() -> None:
    server = Server()

    with offline_earth(**server.functions()) as earth:
        name = earth.start_export(ET, date(2024, 1, 17))
        state = earth.export_state(name)

    [(request_id, params)] = server.exports
    assert uuid.UUID(request_id)
    assert params["description"] == "idea-agro-et-2024_01_17"
    assert params["assetExportOptions"]["earthEngineDestination"] == {
        "name": f"{ET.asset}/2024_01_17",
        "overwrite": False,
    }
    assert name == "projects/pastizales-uy/operations/E1"
    assert state == ExportState(ExportStatus.SUCCEEDED, eecu_seconds=42.0)


def test_a_run_exports_only_what_the_collection_lacks_and_no_export_writes() -> None:
    published = (date(2024, 1, 1), date(2024, 1, 9), date(2024, 1, 17))
    server = Server(held=published[:1], running=published[1:2], published=published)

    with offline_earth(**server.functions()) as earth:
        refresh(earth, [ET], since=date(2024, 1, 1), until=date(2024, 12, 31), sleep=lambda seconds: None)

    assert [params["description"] for _, params in server.exports] == ["idea-agro-et-2024_01_17"]
    assert server.written == [(ET.asset, ET.properties)]
