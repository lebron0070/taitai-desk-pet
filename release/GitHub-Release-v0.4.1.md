# 今天也没离职 v0.4.1 Beta

会站在当前软件窗口边缘、自己摸鱼的像素桌面宠物。

## 本次修复

- 修复部分窗口切换、最小化或拖动过程中偶发的 JavaScript 主进程错误弹窗
- 严格校验 macOS 与 Windows 返回的窗口坐标，无效坐标会自动回到安全位置
- 移动动画遇到异常时会安全停止，不再影响桌宠继续运行

## 下载

Apple 芯片 Mac（M1 / M2 / M3 / M4）请下载：

`Taitai-0.4.1-arm64.dmg`

Windows 10/11 x64 请下载：

`Taitai-0.4.1-win-x64.exe`

不想安装的 Windows 用户可以下载：

`Taitai-0.4.1-win-x64.zip`

当前暂不支持 Intel Mac 和 32 位 Windows。

## 安装前请看

当前公开测试包尚未完成商业代码签名。macOS 可能显示 Gatekeeper 提醒，Windows 可能显示 Microsoft Defender SmartScreen 提醒。请只从本项目的 GitHub Releases 页面下载。

Mac 安装包 SHA-256：

`58bc918300397588369e9962d0cd2f3e15a1c89ba741d05e57b713d2ef29b27b`

## 反馈

遇到问题时，请在 Issues 中附上系统版本、发生问题的软件名称，以及截图或录屏。
