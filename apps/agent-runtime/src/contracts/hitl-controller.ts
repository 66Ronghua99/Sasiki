import type { HitlInterventionRequest, HitlInterventionResponse } from "../domain/intervention-learning.js";

export interface HitlController {
  requestIntervention(request: HitlInterventionRequest): Promise<HitlInterventionResponse>;
}
