"""Stage completion verifier for evidence-based done decisions."""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from urllib.parse import parse_qs, unquote_plus, urlparse

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
        if self._match_url_containing_rule(criteria, evidence):
            return True
        if criteria_lower in evidence_lower:
            return True

        tokens = self._keywords(criteria_lower)
        if not tokens:
            # Non-latin criteria fallback: if evidence is present, accept.
            return True

        matched = sum(1 for token in tokens if token in evidence_lower)
        required = max(1, (len(tokens) + 1) // 2)
        return matched >= required

    def _match_url_containing_rule(self, criteria: str, evidence: str) -> bool:
        """Match criteria fragments like 'URL containing ...' against decoded evidence URL."""
        match = re.search(r"url\s+containing\s+(.+)", criteria, flags=re.IGNORECASE)
        if not match:
            return False

        expected = match.group(1).strip().strip(".'\"")
        if not expected:
            return False

        expected_lower = expected.lower()
        for url in self._extract_urls(evidence):
            decoded_url = unquote_plus(url).lower()
            if expected_lower in decoded_url:
                return True
            if expected_lower.startswith("keyword="):
                query = parse_qs(urlparse(url).query)
                keyword_values = query.get("keyword", [])
                if any(expected_lower.removeprefix("keyword=") in unquote_plus(value).lower() for value in keyword_values):
                    return True
        return False

    def _extract_urls(self, evidence: str) -> list[str]:
        """Extract URL candidates from raw evidence text or JSON string evidence."""
        candidates: list[str] = []
        stripped = evidence.strip()
        if stripped.startswith("{") and stripped.endswith("}"):
            try:
                payload = json.loads(stripped)
                if isinstance(payload, dict):
                    url_value = payload.get("url")
                    if isinstance(url_value, str) and url_value.strip():
                        candidates.append(url_value.strip())
            except Exception:
                pass

        candidates.extend(re.findall(r"https?://[^\s\"']+", evidence))
        # preserve order and remove duplicates
        unique: list[str] = []
        for item in candidates:
            if item and item not in unique:
                unique.append(item)
        return unique

    def _keywords(self, text: str) -> list[str]:
        """Extract meaningful english keywords."""
        words = re.findall(r"[a-z0-9]+", text)
        return sorted({w for w in words if len(w) >= 3 and w not in _STOPWORDS})
