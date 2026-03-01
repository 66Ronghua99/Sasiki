"""Tests for action formatter module."""

from sasiki.workflow.action_formatter import ActionFormatter


class TestActionFormatter:
    """Tests for ActionFormatter."""

    def test_format_action_text_prefers_normalized_target(self):
        """Click summaries should prefer normalized target over raw node."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {"role": "generic", "tag_name": "svg", "name": ""},
            "normalized_target_hint": {"role": "button", "tag_name": "button", "name": "收藏"},
            "page_context": {"url": "https://example.com"},
        }
        assert formatter.format_action_text(action_detail) == 'Click "收藏"'

    def test_format_action_text_with_hex_id_uses_sibling_text(self):
        """When target_name is a hex ID, should use sibling_texts instead."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "67c42e99000000000e005734",  # hex ID
                "role": "link",
                "tag_name": "a",
                "sibling_texts": ["男生必看‼️衣品差的男生进来照着抄"],
            },
        }
        result = formatter.format_action_text(action_detail)
        assert "男生必看" in result
        assert "67c42e99000000000e005734" not in result

    def test_format_action_text_like_button_with_count(self):
        """Should identify like button and include count."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "",  # empty name
                "role": "generic",
                "tag_name": "svg",
                "class_name": "like-wrapper",
                "sibling_texts": ["83"],  # like count
            },
        }
        result = formatter.format_action_text(action_detail)
        assert "like button" in result.lower()
        assert "83" in result

    def test_format_action_text_collect_button(self):
        """Should identify collect button with count."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "1万",  # numeric-like name
                "role": "generic",
                "tag_name": "span",
                "class_name": "collect-wrapper",
                "sibling_texts": ["1万"],
            },
        }
        result = formatter.format_action_text(action_detail)
        assert "collect button" in result.lower()
        assert "1万" in result

    def test_format_action_text_share_button(self):
        """Should identify share button."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "",
                "role": "generic",
                "tag_name": "svg",
                "class_name": "share-wrapper",
                "sibling_texts": ["分享"],
            },
        }
        result = formatter.format_action_text(action_detail)
        assert "share button" in result.lower()

    def test_format_action_text_generic_link(self):
        """Should format regular link with target name."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {
                "name": "Home",
                "role": "link",
                "tag_name": "a",
            },
        }
        result = formatter.format_action_text(action_detail)
        assert result == 'Click link "Home"'

    def test_looks_like_id_detects_hex(self):
        """Should detect hex IDs (24+ characters)."""
        formatter = ActionFormatter()
        assert formatter._looks_like_id("67c42e99000000000e005734") is True
        assert formatter._looks_like_id("abc123def4567890abcdef12") is True

    def test_looks_like_id_detects_numbers(self):
        """Should detect short numbers as IDs."""
        formatter = ActionFormatter()
        assert formatter._looks_like_id("83") is True
        assert formatter._looks_like_id("1234") is True

    def test_looks_like_id_allows_meaningful_text(self):
        """Should allow meaningful text through."""
        formatter = ActionFormatter()
        assert formatter._looks_like_id("Search") is False
        assert formatter._looks_like_id("Submit button") is False
        assert formatter._looks_like_id("男生必看") is False

    def test_extract_meaningful_text_filters_ids(self):
        """Should filter out IDs from sibling texts."""
        formatter = ActionFormatter()
        siblings = ["83", "男生必看‼️衣品差的男生进来照着抄"]
        result = formatter._extract_meaningful_text(siblings)
        assert result == "男生必看‼️衣品差的男生进来照着抄"

    def test_extract_meaningful_text_returns_none_for_only_ids(self):
        """Should return None if only IDs in siblings."""
        formatter = ActionFormatter()
        siblings = ["83", "67c42e99000000000e005734"]
        result = formatter._extract_meaningful_text(siblings)
        assert result is None

    def test_infer_element_type_from_class(self):
        """Should infer type from class_name."""
        formatter = ActionFormatter()
        assert formatter._infer_element_type({"class_name": "like-wrapper"}) == "like button"
        assert formatter._infer_element_type({"class_name": "collect-btn"}) == "collect button"
        assert formatter._infer_element_type({"class_name": "share-wrapper"}) == "share button"

    def test_infer_element_type_from_role(self):
        """Should infer type from role."""
        formatter = ActionFormatter()
        assert formatter._infer_element_type({"role": "link"}) == "link"
        assert formatter._infer_element_type({"role": "button"}) == "button"
        assert formatter._infer_element_type({"role": "textbox"}) == "text input"

    def test_infer_element_type_from_tag(self):
        """Should infer type from tag_name."""
        formatter = ActionFormatter()
        assert formatter._infer_element_type({"tag_name": "a"}) == "link"
        assert formatter._infer_element_type({"tag_name": "svg"}) == "icon"
        assert formatter._infer_element_type({"tag_name": "img"}) == "image"

    def test_format_count_suffix_extracts_numbers(self):
        """Should format count suffix from siblings."""
        formatter = ActionFormatter()
        assert formatter._format_count_suffix(["83"]) == " (83)"
        assert formatter._format_count_suffix(["1万"]) == " (1万)"
        assert formatter._format_count_suffix(["2,345"]) == " (2,345)"
        assert formatter._format_count_suffix(["text"]) == ""

    def test_format_action_text_fallback_when_no_context(self):
        """Should fallback gracefully when no context available."""
        formatter = ActionFormatter()
        action_detail = {
            "action_type": "click",
            "target_hint": {"name": "67c42e99000000000e005734"},
        }
        result = formatter.format_action_text(action_detail)
        # Should fallback to generic description since name is ID and no siblings
        assert "Click" in result
