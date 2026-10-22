import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

HERE = Path(__file__).parent
OWN_APIS = [
    "iam.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "storage.googleapis.com",
    "artifactregistry.googleapis.com",
]
OPERATOR = "terraform-operator@demo.iam.gserviceaccount.com"
READ_ONLY = {"describe", "list", "get-iam-policy"}


def setup_env(
    project: str = "demo",
    region: str = "us-central1",
    registry: str = "images",
    apis: str = "",
    roles: str = "",
    extra: str = "",
) -> str:
    return (
        f"GOOGLE_CLOUD_PROJECT={project}\nGOOGLE_CLOUD_REGION={region}\nSETUP_REGISTRY={registry}\n{extra}\n"
        f'SETUP_APIS="\n{apis}\n"\nSETUP_OPERATOR_ROLES="\n{roles}\n"\n'
    )


class Repo:
    """A copy of setup.sh in a temporary repository, with a stub gcloud on the PATH."""

    def __init__(self, root: Path) -> None:
        self.root = root
        self.script = root / "infrastructure/setup/setup.sh"
        self.outputs = root / "infrastructure/setup/outputs"
        self.state_file = root / "gcloud-state.json"
        self.script.parent.mkdir(parents=True)
        shutil.copy(HERE.parent / "setup.sh", self.script)
        bin_dir = root / "bin"
        bin_dir.mkdir()
        gcloud = bin_dir / "gcloud"
        gcloud.write_text(f'#!/bin/sh\nexec "{sys.executable}" "{HERE / "gcloud_stub.py"}" "$@"\n')
        gcloud.chmod(0o755)
        sleep = bin_dir / "sleep"
        sleep.write_text("#!/bin/sh\n")
        sleep.chmod(0o755)
        self.path = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"
        self.save()
        self.write_env(setup_env())

    def write_env(self, content: str, env: str = "dev") -> None:
        folder = self.root / "infrastructure/environments" / env
        folder.mkdir(parents=True, exist_ok=True)
        (folder / "setup.env").write_text(content)

    def save(self, **state: Any) -> None:
        """Writes the fake project: empty, apart from the given fields."""
        empty: dict[str, Any] = {
            "project": "demo",
            "number": "123456",
            "apis": [],
            "accounts": [],
            "bindings": [],
            "buckets": [],
            "versioned": [],
            "repositories": [],
            "fail": [],
            "invisible": 0,
            "calls": [],
            "configs": [],
        }
        self.state_file.write_text(json.dumps({**empty, **state}))

    def state(self) -> dict[str, Any]:
        return json.loads(self.state_file.read_text())

    def calls(self) -> list[list[str]]:
        return self.state()["calls"]

    def changing_calls(self) -> list[list[str]]:
        return [call for call in self.calls() if not set(call) & READ_ONLY]

    def run(self, *args: str, **env: str) -> subprocess.CompletedProcess[str]:
        environ = {**os.environ, "PATH": self.path, "GCLOUD_STUB_STATE": str(self.state_file), **env}
        # /bin/bash is 3.2 on macOS, the oldest Bash the script supports.
        return subprocess.run(
            ["/bin/bash", str(self.script), *args], capture_output=True, text=True, env=environ, check=False
        )


@pytest.fixture
def repo(tmp_path: Path) -> Repo:
    return Repo(tmp_path)


def changes(result: subprocess.CompletedProcess[str]) -> list[str]:
    return [line.strip() for line in result.stdout.splitlines() if line.startswith("  ")]


@pytest.mark.parametrize("args", [[], ["--env"], ["--env", "staging"], ["--env", "dev", "--force"]])
def test_refuses_an_unknown_environment(repo: Repo, args: list[str]) -> None:
    result = repo.run(*args)
    assert result.returncode != 0
    assert "usage:" in result.stderr
    assert repo.calls() == []


@pytest.mark.parametrize("name", ["GOOGLE_CLOUD_PROJECT", "GOOGLE_CLOUD_REGION", "SETUP_REGISTRY"])
def test_refuses_a_missing_required_value(repo: Repo, name: str) -> None:
    repo.write_env(setup_env().replace(f"{name}=", f"{name}=\n#"))
    result = repo.run("--env", "dev")
    assert result.returncode != 0
    assert name in result.stderr
    assert repo.calls() == []


def test_takes_values_only_from_setup_env(repo: Repo) -> None:
    repo.write_env(setup_env().replace("GOOGLE_CLOUD_PROJECT=demo\n", ""))
    result = repo.run("--env", "dev", GOOGLE_CLOUD_PROJECT="demo")
    assert result.returncode != 0
    assert "GOOGLE_CLOUD_PROJECT" in result.stderr


def test_refuses_a_project_the_account_cannot_read(repo: Repo) -> None:
    repo.write_env(setup_env(project="other"))
    result = repo.run("--env", "dev")
    assert result.returncode != 0
    assert "cannot read project other" in result.stderr


def test_refuses_a_project_number(repo: Repo) -> None:
    repo.write_env(setup_env(project="123456"))
    result = repo.run("--env", "dev")
    assert result.returncode != 0
    assert "must be the project id: demo" in result.stderr
    assert len(repo.calls()) == 1


def test_dry_run_lists_what_is_missing_and_changes_nothing(repo: Repo) -> None:
    repo.write_env(
        setup_env(apis="  run.googleapis.com\n\n  iam.googleapis.com", roles="roles/run.admin\n\nroles/storage.admin")
    )
    before = repo.state()

    result = repo.run("--env", "dev")

    assert result.returncode == 0, result.stderr
    assert changes(result) == [
        *(f"would enable {api}" for api in [*OWN_APIS, "run.googleapis.com"]),
        f"would create service account {OPERATOR}",
        f"would grant roles/run.admin to {OPERATOR}",
        f"would grant roles/storage.admin to {OPERATOR}",
        "would create bucket gs://demo-tfstate in us-central1, versioned",
        "would create Docker repository images in us-central1",
    ]
    assert result.stdout.splitlines()[-1] == "Changes: 10"
    assert {**repo.state(), "calls": [], "configs": []} == before
    assert repo.changing_calls() == []
    assert not repo.outputs.exists()


def test_counts_only_what_is_missing(repo: Repo) -> None:
    operator = "deployer@demo.iam.gserviceaccount.com"
    repo.write_env(
        setup_env(
            apis="run.googleapis.com",
            roles="roles/run.admin\nroles/storage.admin",
            extra="SETUP_OPERATOR_SA=deployer\nSETUP_STATE_BUCKET=demo-state",
        )
    )
    repo.save(
        apis=[*OWN_APIS, "run.googleapis.com"],
        accounts=[operator],
        bindings=[["roles/run.admin", f"serviceAccount:{operator}"], ["roles/storage.admin", "user:someone@x.org"]],
        buckets=["demo-state"],
        versioned=["demo-state"],
    )

    result = repo.run("--env", "dev")

    assert result.returncode == 0, result.stderr
    assert changes(result) == [
        f"would grant roles/storage.admin to {operator}",
        "would create Docker repository images in us-central1",
    ]
    assert result.stdout.splitlines()[-1] == "Changes: 2"


def test_turns_on_versioning_in_an_existing_bucket(repo: Repo) -> None:
    repo.save(apis=OWN_APIS, accounts=[OPERATOR], buckets=["demo-tfstate"], repositories=["images"])

    dry_run = repo.run("--env", "dev")
    applied = repo.run("--env", "dev", "--apply")

    assert changes(dry_run) == ["would turn on versioning in gs://demo-tfstate"]
    assert applied.returncode == 0, applied.stderr
    assert repo.state()["versioned"] == ["demo-tfstate"]


def test_empty_lists_enable_and_grant_nothing(repo: Repo) -> None:
    repo.save(
        apis=OWN_APIS,
        accounts=[OPERATOR],
        buckets=["demo-tfstate"],
        versioned=["demo-tfstate"],
        repositories=["images"],
    )

    result = repo.run("--env", "dev", "--apply")

    assert result.returncode == 0, result.stderr
    assert "Changes made: 0" in result.stdout.splitlines()
    assert repo.changing_calls() == []


def test_apply_creates_everything_and_a_new_run_finds_nothing(repo: Repo) -> None:
    repo.write_env(setup_env(apis="run.googleapis.com", roles="roles/run.admin"))

    applied = repo.run("--env", "dev", "--apply", CLOUDSDK_ACTIVE_CONFIG_NAME="idea-agro-dev")

    assert applied.returncode == 0, applied.stderr
    assert repo.changing_calls() == [
        ["services", "enable", *OWN_APIS, "--project=demo"],
        ["services", "enable", "run.googleapis.com", "--project=demo"],
        [
            "iam",
            "service-accounts",
            "create",
            "terraform-operator",
            "--project=demo",
            "--display-name=Terraform operator",
        ],
        [
            "projects",
            "add-iam-policy-binding",
            "demo",
            f"--member=serviceAccount:{OPERATOR}",
            "--role=roles/run.admin",
            "--condition=None",
        ],
        [
            "storage",
            "buckets",
            "create",
            "gs://demo-tfstate",
            "--project=demo",
            "--location=us-central1",
            "--uniform-bucket-level-access",
            "--public-access-prevention",
        ],
        ["storage", "buckets", "update", "gs://demo-tfstate", "--project=demo", "--versioning"],
        [
            "artifacts",
            "repositories",
            "create",
            "images",
            "--project=demo",
            "--location=us-central1",
            "--repository-format=docker",
        ],
    ]
    assert set(repo.state()["configs"]) == {"idea-agro-dev"}
    assert [path.name for path in (repo.root / "infrastructure/environments/dev").iterdir()] == ["setup.env"]
    assert (repo.outputs / "dev.backend.tfvars").read_text().endswith('bucket = "demo-tfstate"\n')
    assert (repo.outputs / "dev.terraform.tfvars").read_text().endswith('project = "demo"\nregion  = "us-central1"\n')
    assert '    bucket = "demo-tfstate"' in applied.stdout.splitlines()

    again = repo.run("--env", "dev")

    assert again.returncode == 0, again.stderr
    assert changes(again) == []
    assert again.stdout.splitlines()[-1] == "Changes: 0"


def test_enables_at_most_20_apis_per_call(repo: Repo) -> None:
    apis = [f"api{i}.googleapis.com" for i in range(25)]
    repo.write_env(setup_env(apis="\n".join(apis)))

    result = repo.run("--env", "dev", "--apply")

    assert result.returncode == 0, result.stderr
    assert repo.state()["apis"] == [*OWN_APIS, *apis]
    assert [len(call) - 3 for call in repo.changing_calls() if call[:2] == ["services", "enable"]] == [4, 20, 5]


def test_retries_a_grant_until_the_new_account_is_visible(repo: Repo) -> None:
    repo.write_env(setup_env(roles="roles/run.admin"))
    repo.save(apis=OWN_APIS, invisible=2)

    result = repo.run("--env", "dev", "--apply")

    assert result.returncode == 0, result.stderr
    assert repo.state()["bindings"] == [["roles/run.admin", f"serviceAccount:{OPERATOR}"]]
    assert sum(call[1] == "add-iam-policy-binding" for call in repo.calls()) == 3


def test_a_failing_call_stops_the_run(repo: Repo) -> None:
    repo.write_env(setup_env(roles="roles/run.admin"))
    repo.save(apis=OWN_APIS, accounts=[OPERATOR], fail=["projects add-iam-policy-binding demo"])

    result = repo.run("--env", "dev", "--apply")

    assert result.returncode != 0
    assert "failed on purpose" in result.stderr
    assert sum(call[1] == "add-iam-policy-binding" for call in repo.calls()) == 1
    assert repo.state()["buckets"] == []
    assert not repo.outputs.exists()
