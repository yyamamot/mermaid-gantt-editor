import { describe, expectTypeOf, it } from "vitest";
import type {
  EditorAction,
  EditorActionResult,
  EditorState,
  ProjectionIssue,
  ResolvedDiagnostic,
  ResolvedDocument,
  SemanticDocument,
  TaskGridRow
} from "../../src/core";

describe("public core types", () => {
  it("exports semantic and resolved model contracts", () => {
    expectTypeOf<SemanticDocument>().toHaveProperty("kind").toEqualTypeOf<"SemanticDocument">();
    expectTypeOf<SemanticDocument>().toHaveProperty("projectionIssues").toEqualTypeOf<ProjectionIssue[]>();
    expectTypeOf<ResolvedDocument>().toHaveProperty("kind").toEqualTypeOf<"ResolvedDocument">();
    expectTypeOf<ResolvedDocument>().toHaveProperty("diagnostics").toEqualTypeOf<ResolvedDiagnostic[]>();
  });

  it("exports Task Grid editor state contracts", () => {
    expectTypeOf<EditorState>().toHaveProperty("mode").toEqualTypeOf<"structured" | "fallback">();
    expectTypeOf<EditorState>().toHaveProperty("grid");
    expectTypeOf<TaskGridRow>().toHaveProperty("kind").toEqualTypeOf<"task" | "section">();
    expectTypeOf<TaskGridRow>().toHaveProperty("nodeId").toEqualTypeOf<string>();
    expectTypeOf<{ type: "select-document" }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "update-task-label"; nodeId: string; label: string }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "update-task-until"; nodeId: string; ref: string }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "update-task-tags"; nodeId: string; tags: string[] }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "update-task-click-href"; nodeId: string; href: string }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "move-task"; nodeId: string; direction: "up" }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "move-task-to-section"; nodeId: string; sectionId: string }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<{ type: "delete-section"; sectionId: string }>().toMatchTypeOf<EditorAction>();
    expectTypeOf<EditorActionResult>().toHaveProperty("sourceChanged").toEqualTypeOf<boolean>();
  });
});
