"""Stage completion verifier for evidence-based done decisions."""

from __future__ import annotations

import re
from dataclasses import dataclass

from sasiki.engine.replay_models import AgentAction

_STOPWORDS = {
    "the",
    "and",
    "for",
    "with",
    "this",
    "that",
    "from",
    "into",
    "then",
    "when",
    "where",
    "what",
    "your",
    "their",
    "have",
    "has",
    "had",
    "are",
    "was",
    "were",
    "been",
    "being",
    "is",
    "to",
    "of",
    "in",
    "on",
    "at",
    "a",
    "an",
}


@dataclass(frozen=True)
class StageVerification:
    """Verification result for a done decision."""

    verified: bool
    evidence: str | None = None
    reason: str | None = None


class StageVerifier:
    """Deterministic verifier for stage done evidence."""

    def verify_done(self, success_criteria: str, action: AgentAction) -> StageVerification:
        """Verify whether a done action satisfies stage success criteria."""
        criteria = success_criteria.strip()
        evidence = self._extract_evidence(action)

        if not criteria:
            return StageVerification(verified=True, evidence=evidence)
        if not evidence:
            return StageVerification(
                verified=False,
                reason="missing evidence for success criteria",
            )
        if self._criteria_matches(criteria, evidence):
            return StageVerification(verified=True, evidence=evidence)
        return StageVerification(
            verified=False,
            evidence=evidence,
            reason="evidence does not satisfy success criteria",
        )

    def _extract_evidence(self, action: AgentAction) -> str | None:
        """Extract concrete evidence from model response."""
        if action.evidence and action.evidence.strip():
            return action.evidence.strip()
        if action.message and action.message.strip():
            return action.message.strip()
        return None

    def _criteria_matches(self, criteria: str, evidence: str) -> bool:
        """Check whether evidence text semantically covers criteria text."""
        criteria_lower = criteria.lower()
        evidence_lower = evidence.lower()
        if criteria_lower in evidence_lower:
            return True

        tokens = self._keywords(criteria_lower)
        if not tokens:
            # Non-latin criteria fallback: if evidence is present, accept.
            return True

        matched = sum(1 for token in tokens if token in evidence_lower)
        required = max(1, (len(tokens) + 1) // 2)
        return matched >= required

    def _keywords(self, text: str) -> list[str]:
        """Extract meaningful english keywords."""
        words = re.findall(r"[a-z0-9]+", text)
        return sorted({w for w in words if len(w) >= 3 and w not in _STOPWORDS})
