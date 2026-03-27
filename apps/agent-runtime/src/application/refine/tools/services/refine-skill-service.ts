import type { SopSkillDocument, SopSkillMetadata } from "../../../../domain/sop-skill.js";

export interface RefineSkillReaderRequest {
  skillName: string;
}

export interface RefineSkillReaderResponse {
  name: string;
  description: string;
  body: string;
}

export interface RefineSkillStorePort {
  listMetadata(): Promise<SopSkillMetadata[]>;
  readSkill(name: string): Promise<SopSkillDocument>;
}

export interface RefineSkillService {
  listSkills(): Promise<SopSkillMetadata[]>;
  readSkill(request: RefineSkillReaderRequest): Promise<RefineSkillReaderResponse>;
}

export interface RefineSkillServiceOptions {
  skillStore: RefineSkillStorePort;
}

export class RefineSkillServiceImpl implements RefineSkillService {
  private readonly skillStore: RefineSkillStorePort;

  constructor(options: RefineSkillServiceOptions) {
    this.skillStore = options.skillStore;
  }

  async listSkills(): Promise<SopSkillMetadata[]> {
    return this.skillStore.listMetadata();
  }

  async readSkill(request: RefineSkillReaderRequest): Promise<RefineSkillReaderResponse> {
    const skillName = request.skillName.trim();
    if (!skillName) {
      throw new Error("skill.reader.skillName is required");
    }
    const skill = await this.skillStore.readSkill(skillName);
    return {
      name: skill.name,
      description: skill.description,
      body: skill.body,
    };
  }
}
