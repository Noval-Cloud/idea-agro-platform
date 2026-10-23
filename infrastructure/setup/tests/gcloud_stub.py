"""A stand-in for gcloud in the setup tests: a fake project kept in the JSON file named by GCLOUD_STUB_STATE."""

import json
import os
import sys
from pathlib import Path
from typing import TypedDict, cast


class State(TypedDict):
    project: str
    number: str
    apis: list[str]
    accounts: list[str]
    bindings: list[list[str]]
    # account, role, member: bindings on a service account itself.
    sa_bindings: list[list[str]]
    buckets: list[str]
    versioned: list[str]
    repositories: list[str]
    fail: list[str]
    # Grants that report the account as missing before it becomes visible.
    invisible: int
    calls: list[list[str]]
    configs: list[str]


class StubError(Exception):
    pass


def need_api(state: State, api: str) -> None:
    if api not in state["apis"]:
        raise StubError(f"{api} is not enabled")


def need_project(state: State, project: str | None) -> str:
    if project is None or project != state["project"]:
        raise StubError(f"unknown project {project}")
    return project


def run(state: State, args: list[str]) -> list[str]:
    words = [arg for arg in args if not arg.startswith("--")]
    flags: dict[str, str] = {}
    for arg in args:
        if arg.startswith("--"):
            key, _, value = arg[2:].partition("=")
            flags[key] = value
    if " ".join(words[:3]) in state["fail"]:
        raise StubError("failed on purpose")

    match words:
        case ["projects", "describe", project]:
            return [need_project(state, state["project"] if project == state["number"] else project)]
        case ["projects", "get-iam-policy", project]:
            need_project(state, project)
            need_api(state, "cloudresourcemanager.googleapis.com")
            return [f"{role}\t{member}" for role, member in state["bindings"]]
        case ["projects", "add-iam-policy-binding", project]:
            need_project(state, project)
            need_api(state, "cloudresourcemanager.googleapis.com")
            member = flags["member"]
            if member.removeprefix("serviceAccount:") not in state["accounts"]:
                raise StubError(f"{member} does not exist")
            if state["invisible"] > 0:
                state["invisible"] -= 1
                raise StubError(f"{member} does not exist")
            state["bindings"].append([flags["role"], member])
            return []
        case ["services", "list"]:
            need_project(state, flags.get("project"))
            return state["apis"] if "enabled" in flags else []
        case ["services", "enable", *apis]:
            need_project(state, flags.get("project"))
            if len(apis) > 20:
                raise StubError("at most 20 services per call")
            state["apis"].extend(api for api in apis if api not in state["apis"])
            return []
        case ["iam", "service-accounts", "list"]:
            need_project(state, flags.get("project"))
            need_api(state, "iam.googleapis.com")
            return state["accounts"]
        case ["iam", "service-accounts", "get-iam-policy", email]:
            need_project(state, flags.get("project"))
            need_api(state, "iam.googleapis.com")
            if email not in state["accounts"]:
                raise StubError(f"{email} does not exist")
            return [f"{role}\t{member}" for account, role, member in state["sa_bindings"] if account == email]
        case ["iam", "service-accounts", "add-iam-policy-binding", email]:
            need_project(state, flags.get("project"))
            need_api(state, "iam.googleapis.com")
            if email not in state["accounts"]:
                raise StubError(f"{email} does not exist")
            state["sa_bindings"].append([email, flags["role"], flags["member"]])
            return []
        case ["iam", "service-accounts", "create", account]:
            project = need_project(state, flags.get("project"))
            need_api(state, "iam.googleapis.com")
            state["accounts"].append(f"{account}@{project}.iam.gserviceaccount.com")
            return []
        case ["storage", "buckets", "list"]:
            need_project(state, flags.get("project"))
            need_api(state, "storage.googleapis.com")
            return state["buckets"]
        case ["storage", "buckets", "create", url]:
            need_project(state, flags.get("project"))
            need_api(state, "storage.googleapis.com")
            state["buckets"].append(url.removeprefix("gs://"))
            return []
        case ["storage", "buckets", "describe", url]:
            need_project(state, flags.get("project"))
            need_api(state, "storage.googleapis.com")
            return ["True" if url.removeprefix("gs://") in state["versioned"] else ""]
        case ["storage", "buckets", "update", url] if "versioning" in flags:
            need_project(state, flags.get("project"))
            need_api(state, "storage.googleapis.com")
            state["versioned"].append(url.removeprefix("gs://"))
            return []
        case ["artifacts", "repositories", "list"]:
            project = need_project(state, flags.get("project"))
            need_api(state, "artifactregistry.googleapis.com")
            location = flags["location"]
            return [f"projects/{project}/locations/{location}/repositories/{name}" for name in state["repositories"]]
        case ["artifacts", "repositories", "create", name]:
            need_project(state, flags.get("project"))
            need_api(state, "artifactregistry.googleapis.com")
            state["repositories"].append(name)
            return []
        case _:
            raise StubError(f"unexpected call: gcloud {' '.join(args)}")


def main() -> int:
    path = Path(os.environ["GCLOUD_STUB_STATE"])
    state = cast(State, json.loads(path.read_text()))
    args = sys.argv[1:]
    state["calls"].append(args)
    state["configs"].append(os.environ.get("CLOUDSDK_ACTIVE_CONFIG_NAME", ""))
    try:
        lines = run(state, args)
    except StubError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 1
    finally:
        path.write_text(json.dumps(state))
    for line in lines:
        print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
