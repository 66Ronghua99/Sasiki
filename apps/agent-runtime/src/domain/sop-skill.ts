/**
 * Deps: none
 * Used By: infrastructure/persistence/sop-skill-store.ts
 * Last Updated: 2026-03-27
 */
export interface SopSkillMetadata {
  name: string;
  description: string;
}

export interface SopSkillDocument extends SopSkillMetadata {
  body: string;
  path: string;
}

export interface SopSkillWriteInput extends SopSkillMetadata {
  body: string;
  sourceObserveRunId: string;
}

export interface SopSkillWriteResult {
  skillPath: string;
}

export type SopSkillStoreErrorCode =
  | "SOP_SKILL_INVALID_REFERENCE"
  | "SOP_SKILL_INVALID_DOCUMENT"
  | "SOP_SKILL_NOT_FOUND"
  | "SOP_SKILL_INVALID_FRONTMATTER"
  | "SOP_SKILL_NAME_MISMATCH";

export class SopSkillStoreError extends Error {
  readonly code: SopSkillStoreErrorCode;
  readonly detail?: Record<string, unknown>;

  constructor(code: SopSkillStoreErrorCode, message: string, detail?: Record<string, unknown>) {
    super(message);
    this.name = "SopSkillStoreError";
    this.code = code;
    this.detail = detail;
  }
}
