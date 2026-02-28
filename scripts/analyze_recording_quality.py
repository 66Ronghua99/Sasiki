#!/usr/bin/env python3
"""
分析录制文件质量，统计 target_hint 字段完整性。

使用方法:
    python scripts/analyze_recording_quality.py [recording_file.jsonl]
    
如果不指定文件，自动分析最新的录制文件。
"""

import json
import sys
from pathlib import Path
from collections import defaultdict
from datetime import datetime


def get_latest_recording():
    """获取最新的录制文件"""
    recordings_dir = Path.home() / ".sasiki/recordings/browser"
    if not recordings_dir.exists():
        print(f"错误: 录制目录不存在: {recordings_dir}")
        sys.exit(1)
    
    jsonl_files = list(recordings_dir.glob("*.jsonl"))
    if not jsonl_files:
        print(f"错误: 没有找到录制文件")
        sys.exit(1)
    
    # 按修改时间排序
    latest = max(jsonl_files, key=lambda f: f.stat().st_mtime)
    return latest


def analyze_recording(filepath):
    """分析录制文件质量"""
    filepath = Path(filepath)
    print(f"分析文件: {filepath}")
    print(f"修改时间: {datetime.fromtimestamp(filepath.stat().st_mtime)}")
    print("=" * 60)
    
    stats = {
        "total_events": 0,
        "click_events": 0,
        "empty_name_clicks": 0,
        "null_parent_role": 0,
        "empty_siblings": 0,
        "has_testId": 0,
        "has_elementId": 0,
        "has_classNames": 0,
        "name_distribution": defaultdict(int),
    }
    
    with open(filepath) as f:
        for line in f:
            try:
                event = json.loads(line.strip())
            except json.JSONDecodeError:
                continue
            
            # 跳过 meta 信息
            if event.get("_meta"):
                continue
            
            stats["total_events"] += 1
            
            # 只分析有 target_hint 的事件
            target_hint = event.get("target_hint")
            if not target_hint:
                continue
            
            event_type = event.get("type", "unknown")
            
            if event_type == "click":
                stats["click_events"] += 1
                
                # 检查 name
                name = target_hint.get("name", "")
                if not name:
                    stats["empty_name_clicks"] += 1
                stats["name_distribution"][name or "(empty)"] += 1
                
                # 检查 parent_role
                if target_hint.get("parent_role") is None:
                    stats["null_parent_role"] += 1
                
                # 检查 sibling_texts
                siblings = target_hint.get("sibling_texts", [])
                if not siblings:
                    stats["empty_siblings"] += 1
                
                # 检查新增字段
                if target_hint.get("testId"):
                    stats["has_testId"] += 1
                if target_hint.get("elementId"):
                    stats["has_elementId"] += 1
                if target_hint.get("classNames"):
                    stats["has_classNames"] += 1
    
    # 打印统计结果
    print(f"\n📊 事件统计")
    print(f"  总事件数: {stats['total_events']}")
    print(f"  Click 事件: {stats['click_events']}")
    
    print(f"\n🎯 Click 事件质量分析")
    if stats["click_events"] > 0:
        empty_name_pct = stats["empty_name_clicks"] / stats["click_events"] * 100
        null_parent_pct = stats["null_parent_role"] / stats["click_events"] * 100
        empty_siblings_pct = stats["empty_siblings"] / stats["click_events"] * 100
        
        print(f"  name 为空: {stats['empty_name_clicks']}/{stats['click_events']} ({empty_name_pct:.1f}%)")
        print(f"  parent_role 为 null: {stats['null_parent_role']}/{stats['click_events']} ({null_parent_pct:.1f}%)")
        print(f"  sibling_texts 为空: {stats['empty_siblings']}/{stats['click_events']} ({empty_siblings_pct:.1f}%)")
        
        print(f"\n✨ 新增字段捕获")
        print(f"  有 testId: {stats['has_testId']}/{stats['click_events']}")
        print(f"  有 elementId: {stats['has_elementId']}/{stats['click_events']}")
        print(f"  有 classNames: {stats['has_classNames']}/{stats['click_events']}")
    
    print(f"\n🏷️  Name 分布 (Top 10)")
    sorted_names = sorted(stats["name_distribution"].items(), key=lambda x: -x[1])
    for name, count in sorted_names[:10]:
        display_name = name[:30] + "..." if len(name) > 30 else name
        print(f"  \"{display_name}\": {count}")
    
    # 质量评分
    print(f"\n📈 质量评分")
    if stats["click_events"] > 0:
        # 计算有 name 的 click 比例
        has_name_rate = (stats["click_events"] - stats["empty_name_clicks"]) / stats["click_events"]
        # 计算有新增字段的 click 比例
        has_new_fields_rate = (stats["has_testId"] + stats["has_elementId"] + stats["has_classNames"]) / (stats["click_events"] * 3)
        
        score = (has_name_rate * 0.6 + has_new_fields_rate * 0.4) * 100
        
        if score >= 80:
            grade = "🟢 优秀"
        elif score >= 60:
            grade = "🟡 良好"
        elif score >= 40:
            grade = "🟠 一般"
        else:
            grade = "🔴 需改进"
        
        print(f"  综合评分: {score:.1f}/100 {grade}")
        print(f"  - Name 完整度: {has_name_rate*100:.1f}%")
        print(f"  - 新增字段覆盖率: {has_new_fields_rate*100:.1f}%")


if __name__ == "__main__":
    if len(sys.argv) > 1:
        filepath = sys.argv[1]
    else:
        filepath = get_latest_recording()
    
    analyze_recording(filepath)
