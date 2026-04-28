[English](./README.md) | 简体中文

<p align="center">
  <img src="./docs/assets/typrism-icon.svg" alt="Typrism 图标" width="96" height="96">
</p>

# Typrism

Typrism 是一个面向 Typora 的独立 AI 写作助手。

## 项目定位

这个项目不是把一个通用聊天网页塞进 Typora。
它的重点是围绕写作流程做增强：

- 多轮对话
- 选区改写
- 文档问答
- 带引用的资料搜索
- 文档结构、AI 批注、写作检查和笔记整理等写作工作流

## 当前能力

- 右侧 AI 面板
- 一键写作工作流：文档结构、引用搜索、AI 批注、写作检查、整理笔记
- 选区悬浮工具条
- 中英文运行时切换
- 与当前文档绑定的会话历史
- 服务商卡片、常用模型建议和连接测试
- 替换前预览、可选自动应用改写，并支持撤销
- 重新生成 / 重试
- 可复制搜索来源
- 工作流斜杠命令：`/outline`、`/cite`、`/comment`、`/check`、`/organize`
- Typora Shell 适配层
- Windows 安装、卸载和图形安装器

## Provider 状态

- `OpenAI-compatible` 已接上真实 HTTP `chat/completions` 传输
- `Gemini` 已接上 Google Generative Language API 真实传输
- 联网搜索已接上 Tavily Search API 真实适配器

设置面板里可以配置服务商凭据、常用模型建议、连接测试和 Tavily 搜索凭据。
如果已经填写模型，测试按钮会发起一次轻量生成请求，而不是只拉取模型列表。

## 目录结构

- `src/`：运行时代码、界面、provider、Typora 适配层
- `bin/`：Windows 安装 / 卸载脚本和 GUI 安装器
- `demo/`：浏览器侧演示
- `docs/`：产品说明和架构文档
- `scripts/`：本地检查脚本

## Windows 安装

最推荐直接使用图形安装器：

```bat
.\bin\install_windows_gui.bat
```

图形安装器可以直接：

- 选择 Typora 目录
- 选择插件文件存放目录
- 点按钮安装、卸载，或恢复原始 `window.html` 备份

命令行方式：

```bat
.\bin\install_windows.bat
```

```powershell
.\bin\install_windows.bat -TyporaPath "C:\Program Files\Typora"
```

```powershell
.\bin\install_windows.bat -TyporaPath "C:\Program Files\Typora" -PluginHome "D:\TyporaPlugins\Typrism"
```

参数说明：

- `-TyporaPath`：Typora 安装目录、包含 `window.html` 的目录，或 `window.html` 完整路径
- `-PluginHome`：插件运行文件存放目录

如果你用了自定义 `-PluginHome`，卸载时也传同一个值给 `uninstall_windows.bat`。

## 手动开发态注入

如果你仍然想用临时注入的开发方式，可以打开 Typora DevTools 执行：

```js
import("file:///C:/path/to/typrism/src/entry-typora.js")
```

这种方式只影响当前 Typora 窗口，重启后失效。

## 本地开发

当前轻量检查直接运行：

```powershell
npm run check
```

## 说明

- Provider 配置目前保存在本地浏览器存储里，还没有切到系统密钥库。
- 系统密钥库仍然需要后续本地 helper；Typora 页面本身不能安全地直接读取 Windows Credential Manager。
- Tavily 联网搜索需要在设置里单独填写搜索 API Key。
- 这个仓库设计成独立项目使用，不依赖上层插件平台。
- 发布前请另外检查你本机运行时存储；API key 不应保存在被跟踪的仓库文件里。
