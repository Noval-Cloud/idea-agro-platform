"""Read and move a story on the IDEA-Agro project board.

Usage:
    scripts/board.py show <story>
    scripts/board.py move <story> [--status NAME] [--phase NAME] [--iteration current|TITLE]

Field and option ids are looked up by name. Requires an authenticated `gh` with the `project` scope.
"""

import argparse
import json
import subprocess
import sys
from datetime import date, timedelta
from typing import Any

OWNER = "Noval-Cloud"
PROJECT_NUMBER = 1

FIELDS_QUERY = """
query($owner: String!, $number: Int!) {
  organization(login: $owner) {
    projectV2(number: $number) {
      id
      fields(first: 50) {
        nodes {
          ... on ProjectV2SingleSelectField { id name options { id name } }
          ... on ProjectV2IterationField { id name configuration { iterations { id title startDate duration } } }
        }
      }
    }
  }
}
"""

ITEM_QUERY = """
query($owner: String!, $number: Int!, $cursor: String) {
  organization(login: $owner) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        pageInfo { hasNextPage endCursor }
        nodes {
          id
          content { ... on Issue { number } }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue { name field { ... on ProjectV2FieldCommon { name } } }
              ... on ProjectV2ItemFieldIterationValue { title field { ... on ProjectV2FieldCommon { name } } }
            }
          }
        }
      }
    }
  }
}
"""

UPDATE_MUTATION = """
mutation($project: ID!, $item: ID!, $field: ID!, $value: ProjectV2FieldValue!) {
  updateProjectV2ItemFieldValue(input: {projectId: $project, itemId: $item, fieldId: $field, value: $value}) {
    projectV2Item { id }
  }
}
"""


def graphql(query: str, **variables: Any) -> dict[str, Any]:
    payload = json.dumps({"query": query, "variables": variables})
    result = subprocess.run(
        ["gh", "api", "graphql", "--input", "-"], input=payload, capture_output=True, text=True, check=False
    )
    data: dict[str, Any] = json.loads(result.stdout or "{}")
    if result.returncode or "errors" in data:
        sys.exit(f"GitHub API error: {result.stdout or result.stderr}")
    return data["data"]


def load_project() -> tuple[str, dict[str, dict[str, Any]]]:
    project = graphql(FIELDS_QUERY, owner=OWNER, number=PROJECT_NUMBER)["organization"]["projectV2"]
    fields = {field["name"]: field for field in project["fields"]["nodes"] if field}
    return project["id"], fields


def find_item(story: int) -> dict[str, Any]:
    cursor = None
    while True:
        page = graphql(ITEM_QUERY, owner=OWNER, number=PROJECT_NUMBER, cursor=cursor)
        items = page["organization"]["projectV2"]["items"]
        for item in items["nodes"]:
            content: dict[str, Any] = item.get("content") or {}
            if content.get("number") == story:
                return item
        if not items["pageInfo"]["hasNextPage"]:
            sys.exit(f"Story #{story} is not on the board.")
        cursor = items["pageInfo"]["endCursor"]


def current_iteration(field: dict[str, Any]) -> dict[str, Any] | None:
    today = date.today()
    for iteration in field["configuration"]["iterations"]:
        start = date.fromisoformat(iteration["startDate"])
        if start <= today < start + timedelta(days=iteration["duration"]):
            return iteration
    return None


def show(story: int) -> None:
    _, fields = load_project()
    values = {
        value["field"]["name"]: value.get("name") or value.get("title")
        for value in find_item(story)["fieldValues"]["nodes"]
        if value and "field" in value
    }
    iteration = current_iteration(fields["Iteration"])
    values["Current iteration"] = iteration["title"] if iteration else None
    print(json.dumps({"story": story, **values}, indent=2, ensure_ascii=False))


def move(story: int, status: str | None, phase: str | None, iteration: str | None) -> None:
    project_id, fields = load_project()
    item_id = find_item(story)["id"]
    for name, wanted in (("Status", status), ("Phase", phase)):
        if wanted is None:
            continue
        options = {option["name"]: option["id"] for option in fields[name]["options"]}
        if wanted not in options:
            sys.exit(f"{name} has no option '{wanted}'. Options: {', '.join(options)}")
        value = {"singleSelectOptionId": options[wanted]}
        graphql(UPDATE_MUTATION, project=project_id, item=item_id, field=fields[name]["id"], value=value)
        print(f"#{story} {name}: {wanted}")
    if iteration is not None:
        field = fields["Iteration"]
        chosen = (
            current_iteration(field)
            if iteration == "current"
            else next((i for i in field["configuration"]["iterations"] if i["title"] == iteration), None)
        )
        if chosen is None:
            sys.exit(f"No iteration matches '{iteration}'.")
        value = {"iterationId": chosen["id"]}
        graphql(UPDATE_MUTATION, project=project_id, item=item_id, field=field["id"], value=value)
        print(f"#{story} Iteration: {chosen['title']}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Read and move a story on the project board.")
    commands = parser.add_subparsers(dest="command", required=True)
    show_parser = commands.add_parser("show", help="Print the story's board fields")
    show_parser.add_argument("story", type=int)
    move_parser = commands.add_parser("move", help="Set the story's Status, Phase or Iteration")
    move_parser.add_argument("story", type=int)
    move_parser.add_argument("--status")
    move_parser.add_argument("--phase")
    move_parser.add_argument("--iteration", help="'current' or an iteration title")
    args = parser.parse_args()
    if args.command == "show":
        show(args.story)
    else:
        move(args.story, args.status, args.phase, args.iteration)


if __name__ == "__main__":
    main()
