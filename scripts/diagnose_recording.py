#!/usr/bin/env python3
"""诊断录制流程中的问题."""

import asyncio
import json
import sys
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

import websockets


async def diagnose():
    """诊断从 CLI 到 Extension 的完整链路."""
    
    print("=" * 60)
    print("Sasiki 录制链路诊断工具")
    print("=" * 60)
    
    # 1. 检查服务器是否运行
    print("\n[1/5] 检查 WebSocket 服务器...")
    try:
        ws = await websockets.connect("ws://localhost:8766")
        print("  ✅ 服务器已启动 (ws://localhost:8766)")
    except Exception as e:
        print(f"  ❌ 无法连接服务器: {e}")
        print("     请先运行: sasiki server start")
        return
    
    # 2. 注册为 CLI
    await ws.send(json.dumps({"type": "register", "client": "cli"}))
    print("  ✅ CLI 已注册")
    
    # 3. 检查 extension 是否连接
    print("\n[2/5] 检查 Extension 连接状态...")
    # 等待服务器状态更新
    await asyncio.sleep(0.5)
    
    # 4. 发送启动命令
    print("\n[3/5] 发送 START_RECORDING 命令...")
    test_session = "diagnose_test_001"
    
    # 模拟 CLI 发送的消息
    start_cmd = {
        "type": "control",
        "command": "start",
        "session_id": test_session
    }
    await ws.send(json.dumps(start_cmd))
    print(f"  📤 已发送: {json.dumps(start_cmd, indent=2)}")
    
    # 5. 等待响应
    print("\n[4/5] 等待服务器响应...")
    try:
        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(response)
        print(f"  📥 收到响应: {json.dumps(data, indent=2)}")
        
        if data.get("type") == "control_response":
            if data.get("success"):
                print("  ✅ 服务器确认启动成功")
            else:
                print(f"  ❌ 服务器返回错误: {data.get('error')}")
    except asyncio.TimeoutError:
        print("  ⚠️  等待响应超时")
    
    # 6. 停止录制
    print("\n[5/5] 发送 STOP_RECORDING 命令...")
    stop_cmd = {"type": "control", "command": "stop"}
    await ws.send(json.dumps(stop_cmd))
    print(f"  📤 已发送: {json.dumps(stop_cmd)}")
    
    try:
        response = await asyncio.wait_for(ws.recv(), timeout=5.0)
        data = json.loads(response)
        if data.get("success"):
            print("  ✅ 停止成功")
    except asyncio.TimeoutError:
        pass
    
    await ws.close()
    
    print("\n" + "=" * 60)
    print("诊断完成")
    print("=" * 60)
    print("""
如果上述步骤都显示 ✅，但网页没有实际录制，请检查：

1. 打开 Chrome 扩展后台页面：
   chrome://extensions/ → 找到 Sasiki → 点击"背景页"(service worker)
   
2. 在 Console 中查看是否有这些日志：
   - "WebSocket connected" （确认扩展连上服务器）
   - "Received from WebSocket:" （确认收到 START_RECORDING 命令）
   - "Recording started:" （确认开始录制）
   - "Ensuring content script injected..." （确认注入 content script）

3. 在目标网页的 F12 Console 中查看：
   - "[Sasiki] Attaching recording listeners" （确认 content script 开始监听）
   
常见问题和解决方案：
- 如果看不到 "Attaching recording listeners"，说明 content script 没有收到消息
  → 尝试刷新网页后再启动录制
  → 检查 background script 是否有报错
  
- 如果看到 "Could not establish connection" 错误
  → content script 可能没有被注入
  → 尝试切换标签页或刷新页面
""")


if __name__ == "__main__":
    asyncio.run(diagnose())
