"""Unit tests for stage done verification."""

from sasiki.engine.replay_models import AgentAction
from sasiki.engine.stage_verifier import StageVerifier


def test_verify_done_accepts_json_evidence_with_encoded_keyword_url() -> None:
    verifier = StageVerifier()
    action = AgentAction(
        thought="done",
        action_type="done",
        evidence=(
            '{"url":"https://www.xiaohongshu.com/search_result/?keyword='
            '%E6%98%A5%E5%AD%A3%E7%A9%BF%E6%90%AD+%E7%94%B7%E7%94%9F%E5%A5%B3%E7%94%9F&type=51"}'
        ),
    )

    result = verifier.verify_done(
        "Search results page loads with URL containing keyword=春季穿搭 男生女生",
        action,
    )

    assert result.verified is True
    assert result.evidence is not None


def test_verify_done_rejects_unmatched_url_containing_criteria() -> None:
    verifier = StageVerifier()
    action = AgentAction(
        thought="done",
        action_type="done",
        evidence='{"url":"https://www.xiaohongshu.com/search_result/?keyword=%E8%A1%97%E6%8B%8D"}',
    )

    result = verifier.verify_done(
        "Search results page loads with URL containing keyword=春季穿搭 男生女生",
        action,
    )

    assert result.verified is False
    assert result.reason == "evidence does not satisfy success criteria"
