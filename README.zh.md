<div align="center">

<img src="docs/logo.png" alt="" width="112" height="112">

# Live Interpreter

### 为网页版 Microsoft Teams、Google Meet、网页版 Zoom 以及任何视频或电台标签页提供实时语音翻译

[English](README.md) · [Türkçe](README.tr.md) · **中文**

通话中双向翻译：对方说西班牙语，你听到中文；你说中文，对方听到西班牙语，而且是你自己的声音。在 YouTube、X 或网络电台上：显示字幕，或在原声之上播放语音翻译，语言任你选择。支持 20 种语言中的任意两种；视频的语言可以自动识别。这是一个没有自有后端的浏览器扩展；翻译和语音可以使用 ElevenLabs 和 Claude，也可以完全运行在你自己的服务器上。

**[从 Chrome 网上应用店添加到 Chrome](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl)** · 免费且开源（MIT）

<table>
  <tr><td><b>通话</b></td><td>浏览器中的 Microsoft Teams（工作/学校账户和个人账户）、Google Meet、浏览器中的 Zoom</td></tr>
  <tr><td><b>其他标签页</b></td><td>YouTube、X、网络电台、任何有声音的网页</td></tr>
  <tr><td><b>浏览器</b></td><td>Chrome、Edge、Brave 以及其他 Chromium 浏览器</td></tr>
  <tr><td><b>语言</b></td><td>20 种，任意两种互译；首次启动时跟随浏览器语言；在视频标签页中可自动识别所说的语言</td></tr>
  <tr><td><b>翻译</b></td><td>Claude、OpenAI 或兼容服务器、OpenRouter、Google Gemini、你自己的 Ollama，或 Soniox；设置中会列出各服务的模型</td></tr>
  <tr><td><b>语音</b></td><td>ElevenLabs、兼容 OpenAI 的服务（OpenAI、Groq Whisper、LocalAI、Speaches、Kokoro），或你自己的语音服务器（faster-whisper 和 Piper）</td></tr>
  <tr><td><b>延迟</b></td><td>一句话结束后约 1.5–3 秒</td></tr>
  <tr><td><b>界面</b></td><td>英语（默认）、土耳其语、德语、西班牙语、中文</td></tr>
</table>

</div>

> **状态。** 已在 Chrome 网上应用店发布。网页版 Teams、Google Meet 和网页版 Zoom 已在真实通话中双向使用过（英语和土耳其语）；Teams 和 Zoom 中的静音检测和字幕区域仍在检查中。技术说明：[MEET.md](MEET.md)、[TEAMS.md](TEAMS.md)、[ZOOM.md](ZOOM.md)。翻译已在真实视频上使用过，包括中文，双向均可。重要会议前请先测试一次。
>
> 不支持 Teams 和 Zoom 桌面应用：浏览器扩展只能在浏览器中运行。加入 Teams 会议请选择 **“在此浏览器上继续”**，加入 Zoom 会议请选择 **“从浏览器加入”**。

---

## 功能

**在 Teams、Meet 或 Zoom 通话中**

- 通过标签页捕获收听通话，通过麦克风收听你自己，将双方的话转写、翻译并朗读出来。
- 你翻译后的声音代替你的麦克风进入通话。通话照常工作，在通话中静音会停止一切发往通话的声音。
- 每个方向可单独选择模式：语音翻译、仅字幕或关闭，通话中可随时在弹出窗口或页面上的面板中切换。语音模式下你只听到翻译；仅字幕或关闭时你照常听到对方。
- 你自己的声音克隆（ElevenLabs），在设置页面中录制。对方的声音只有在你确认对方同意后才会克隆，通话结束时克隆会被删除。
- 可选的通话录制：通话标签页的画面加上双方的声音，以 MP4 格式仅保存在这台电脑上。
- 每次通话和每个视频的文字记录：说了什么、谁说的、什么时候说的，以及译文，保存在这台电脑上，可另存为文本（`.txt`）或字幕（`.srt`）。
- 回声保护、适合不戴耳机的扬声器模式、自动重连，并自动跟随通话所用的麦克风。
- 在 Teams 中，通话失去所有连接 30 秒后翻译会自行停止；`Alt+Shift+T` 或弹出窗口可立即停止。

**在其他任何标签页上（YouTube、X、网络电台）**

- 在该标签页上点击扩展，然后点击 **翻译此标签页**。所说的语言会自动识别，也可以在设置中指定。声音会变成页面底部的字幕（全屏时移入 YouTube 播放器内），或者变成语音翻译，同时原声降到 20%。
- 扩展只接触这一个标签页，而且只在你点击之后；不会向它发送任何内容。在同一网站上切换到另一个视频时，翻译会继续。

**所有场景**

- 二十种语言，任意两种，双向互译：英语、土耳其语、德语、法语、西班牙语、意大利语、葡萄牙语、荷兰语、波兰语、俄语、乌克兰语、阿拉伯语、希腊语、罗马尼亚语、瑞典语、印尼语、印地语、中文、日语和韩语。
- 像电影一样的字幕：译文用大字显示，原文在下方；还有一个面板，显示双方内容、实时延迟以及带费用估算的用量计数。
- 一个服务出错不会丢掉一句话：翻译会从 Ollama 依次退到第二台 Ollama 服务器、Claude Haiku（设置了 Claude 密钥时）；从 OpenAI、OpenRouter 或 Gemini 退到 Claude Haiku（有密钥时）。

> **请先阅读。**
> - 这是交替传译：一句话结束后才开始翻译。语音识别等待 0.7 秒的静音（可设为 0.5 秒），翻译需要 0.3–2 秒，语音 0.2–0.5 秒。说话人讲得较长时，已经说完的句子会在其继续讲话时就开始翻译。
> - 想要最短的延迟：用 Ollama 或 **Claude Haiku 5.5** 翻译，把静音设为 **0.5 秒**，并用短句说话。
> - **请戴耳机。** 不戴耳机时，你听到的翻译会漏进麦克风，再被发回给对方。如果没有耳机，请在设置中打开 **扬声器模式**。
> - 同一台电脑上的两个参与者会互相干扰音频。请用第二台设备（手机）或请另一个人来测试。
> - 通话的音频和文字会发送到你选择的服务（ElevenLabs、Anthropic、OpenAI、Groq、Soniox）。用于工作会议时，请告知参与者并查看公司规定，或者全部使用你自己的服务器。克隆他人的声音需要对方同意。

---

## 选择服务

| | 语音识别和声音 | 翻译 |
| --- | --- | --- |
| **托管服务** | ElevenLabs（Scribe v2 Realtime、Flash v2.5 / v4 Turbo）；OpenAI（Whisper、gpt-4o-transcribe、gpt-4o-mini-tts）；Groq Whisper（识别，快且便宜） | Claude Opus、Sonnet 或 Haiku 5.5；OpenAI；OpenRouter（数百个模型，一个密钥）；Google Gemini |
| **识别和翻译合一** | Soniox（`stt-rt-v6`）：在同一个流中听和翻译，最快的配置；译文由 Soniox 自己的声音（`tts-rt-v2`）或上面任一种声音朗读 | Soniox |
| **你自己的服务器** | [speech-server/](speech-server/README.md) 中的语音服务器（faster-whisper 和 Piper），或任何提供 OpenAI 音频 API 的服务器（Speaches、LocalAI、Kokoro-FastAPI） | Ollama（例如 `gemma4:12b`），或任何提供 OpenAI API 的服务器（LM Studio、vLLM） |

两列分别选择。两列都用你自己的服务器时，通话内容不会离开你的电脑，也不会产生任何费用。

### Soniox：识别和翻译在同一个流中

在 **翻译** 下选择 **Soniox** 作为服务，并粘贴 [Soniox](https://soniox.com) API 密钥；**测试** 会打开一个流，并报告密钥被拒或余额用完。Soniox 在同一个流中逐词识别并翻译语音，因此翻译在句子结束前就开始了：不必等句子结束，也没有单独的翻译请求。因为它翻译自己听到的内容，识别也由 Soniox 完成；**语音识别和声音** 下的服务只负责朗读译文，设置页面会说明这一点。该服务也可以是 Soniox：约 230 个声音，每个都能说所有语言，通过一条保持打开的连接（一段语音的第一个声音约在请求后 0.35–0.5 秒）。Soniox 也可以在使用其他翻译服务时作为语音服务：此时它负责识别和朗读，由“翻译”中的服务翻译。Soniox 按音频时长收费（撰写本文时，带翻译的识别约 $0.12/小时，生成语音约 $0.70/小时）；通话的每一方各是一个流。面板会显示负责识别、翻译和朗读的服务。

### 速度

译文按分句朗读：译出的分句一旦够长（约 24 个字符后的逗号、分号或冒号，或句子结束；中文和日语没有空格，使用它们自己的标点 `，、。`，且一个字按两个拉丁字符计），就立即请求语音，语音以流的方式返回，所以在翻译完成整句之前就能听到开头。推理模型会被要求不做推理（`reasoning_effort: none`，只在模型要求时才逐级提高）；在 OpenRouter 上，所有模型都关闭推理，并选择最快的提供方（`provider.sort: latency`）。当语音落后超过 20 秒时，尚未播放的最早片段会被跳过（其文字仍留在屏幕上）。面板按环节显示延迟，取最近几句的平均值：等待说话结束、第一批译文、第一声语音。

### 外语词的正确读法

每个声音都按自己语言的规则朗读一切，所以土耳其语语音中的英语术语（“API”、“Apple”）或英语语音中的土耳其名字（“Şükrü”）可能会读错。朗读译文时，翻译器会给这类词标注读音，例如 `[[Apple|epıl]]` 或 `[[Şükrü|Shoo-kroo]]`。屏幕和文字记录中只显示 “Apple” 和 “Şükrü”。你自己的语音服务器（每个声音只会一种语言）读的是标注的读音；ElevenLabs 和 OpenAI 收到的是词本身，因为它们能处理混合文本，而且 OpenAI 的 `gpt-*-tts` 声音还会被告知按外语词本来的语言去读。没有标注的情况下（Soniox），内置的常用术语和品牌列表以及短缩写的逐字母拼读（SGK：“se ge ke”）会帮助本地声音；你自己的列表（**语音识别和声音 › 外语词的读法**，每行一个 `词 = 读音`）对所有声音都有效。在 Ollama 上用 `gemma4:12b` 实测：两个方向返回的标注格式都正确；小模型弄坏的标注会被清理掉，不会出现在屏幕上。

### 用 Google Gemini 翻译

选择 **Google Gemini** 作为翻译服务，并粘贴来自 [Google AI Studio](https://aistudio.google.com/apikey) 的密钥；该密钥可用的模型列表会自动填充（语音、图像、音乐和嵌入模型会被排除）。大多数 Gemini 模型会先思考再回答，而实时翻译等不起：扩展会把思考降到每个模型接受的最低级别，依次尝试预算 0、MINIMAL 和 LOW 级别、128 token 的预算，并记住模型接受的设置。2026 年 11 月 11 日实测，从请求到第一段文字：`gemini-3.5-flash-lite` 约 0.56 秒（默认），`gemini-3.1-flash-lite` 0.56 秒，`gemini-3.5-flash` 0.74 秒，`gemini-3.8-flash` 1.4–2 秒；`gemini-3.8-flash` 按自己的方式思考时用了 5.6 秒。设置了 Claude 密钥时，Claude Haiku 作为 Gemini 的后备。Gemini 的价格不在面板的估算中。

### 用 Ollama 翻译

在设置中选择 **Ollama** 作为翻译服务，并输入服务器地址（例如 `100.101.102.103`；未写端口时自动加上 11434）：浏览器会询问一次是否允许访问该地址，模型列表会自动填充（仅用于嵌入的模型会被排除）。点击 **测试** 可计时翻译一句话。在台式机 NVIDIA GPU 上通过 Tailscale 实测，模型加载后 `gemma4:12b` 和 `gemma4:26b` 翻译一句话需要 0.3–0.6 秒。另一台电脑上的第二台服务器可以作为它的后备，然后是 Claude Haiku（设置了密钥时）。

Ollama 会拒绝 `Origin` 请求头不认识的请求，而浏览器的每个 POST 都会带上它。扩展会从自己发往设置中服务器的请求里去掉这个请求头（一条仅限本扩展作为发起方的 `declarativeNetRequest` 规则），因此 **不需要设置 `OLLAMA_ORIGINS`**。网页向同一服务器发出的请求仍带有它的来源，会被拒绝。

### 用你自己的语音服务器代替 ElevenLabs

在一台带 NVIDIA GPU 的 Ubuntu 电脑上：

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter/speech-server && sudo ./install-ubuntu.sh
```

这会把 faster-whisper（`large-v3-turbo`）和 Piper 安装为 8765 端口上的服务，Piper 带有 20 种语言中 16 种的声音（希腊语、印尼语、日语和韩语除外，Piper 没有这些语言的声音），最后打印地址和密钥。在设置的 **语音识别和声音** 下选择 **我的自建语音服务器**，输入这两项并点击 **测试**；然后从服务器的列表中选择识别模型（Whisper）和声音。只懂英语的模型（`distil-large-v3`、`*.en`）会被标出，只用于英语语音；其他语言的语音交给 `large-v3-turbo`，因为只懂英语的模型会把它写成一段英语译写。通过 Tailscale 实测：一句话结束后约 1.1–1.3 秒识别完成（其中 0.7 秒是标志句子结束的静音），朗读不到 0.2 秒。语音由 Silero VAD 检测，它能把人声与音乐和音效区分开，所以电影配乐不会掩盖句子在哪里结束；6 秒内没有检测到人声的响亮声音也会交给 Whisper。中文和日语会带标点识别（服务器 2.0.1），这样说话人还在讲时，已说完的句子就能先翻译。此模式没有声音克隆。详情：[speech-server/README.md](speech-server/README.md)。

### 兼容 OpenAI 的语音

在 **语音识别和声音** 下选择 **兼容 OpenAI**，然后分别为识别和声音选择服务器（OpenAI、用于识别的 Groq，或其他服务器的地址）、密钥和模型；列表来自服务器。使用 OpenAI 或 Groq 时，密钥留空则使用“翻译”部分中同一服务的密钥。**测试** 会用声音服务器朗读一句话，再用识别服务器听回来。

这些服务接收完整的录音，而不是实时流：扩展自己把语音切成句子，每句结束时发送，所以没有实时草稿，长句会在 15 秒处切开。它们的价格不包含在面板的估算中。

---

## 要求

- Chrome 116 或更新版本、Edge 或 Brave
- Node.js 18 或更新版本，仅在从源码构建扩展时需要
- 语音：ElevenLabs API 密钥（声音克隆需要付费套餐）、OpenAI 或 Groq 密钥，或你自己的语音服务器；可选 Soniox 密钥，用一个流完成识别和翻译
- 翻译：Claude、OpenAI、OpenRouter、Google Gemini 或 Soniox 的 API 密钥，或你自己的服务器（Ollama、LM Studio、vLLM）
- 通话时戴耳机

---

## 安装

**从 Chrome 网上应用店**（Chrome、Edge、Brave）：打开 [商店页面](https://chromewebstore.google.com/detail/opaicinhommdnfhikkmlgjcalkohnkhl)，点击 **添加至 Chrome**。它会自动更新。设置页面会自动打开；分步指南见 [SETUP.md](SETUP.md)（英语）和 [SETUP.tr.md](SETUP.tr.md)（土耳其语）。设置页面右上角的菜单可以把界面切换为中文。

**从源码**，用于修改代码或运行尚未发布的版本：

```bash
git clone https://github.com/mbahcetepe/live-interpreter.git
cd live-interpreter
npm install
npm run build
```

在 Windows PowerShell、macOS 和 Linux 中操作相同。然后打开 `chrome://extensions`（`edge://extensions`、`brave://extensions`），打开开发者模式，选择 **加载已解压的扩展程序** 并选择 `dist` 文件夹。设置页面会自动打开。

只保留一个扩展副本：加载 `dist` 之前先移除商店版本，或关闭其中一个。两者之间的设置和密钥不互通，因为各自有不同的扩展 ID。拉取更新后，再次运行 `npm install` 和 `npm run build`，在扩展页面点击重新加载，并刷新通话标签页（F5）。

`npm run zip` 会构建并把 `dist` 打包为 `live-interpreter-<版本>.zip`，即上传到 Chrome 网上应用店的文件；在 macOS 和 Linux 上使用 `zip` 命令，在 Windows 上使用内置的 `tar`。

---

## 工作原理

```text
通话标签页的声音 -> 语音识别（对方的语言） -> 翻译 -> 语音 -> 你的耳机和字幕
你的麦克风       -> 语音识别（你的语言）   -> 翻译 -> 语音 -> 通话，代替你的麦克风
视频标签页的声音 -> 语音识别               -> 翻译 -> 字幕，或盖在原声之上的语音

语音识别和语音：ElevenLabs、兼容 OpenAI 的服务或语音服务器
翻译：所选服务（Claude、OpenAI/兼容、OpenRouter、Gemini、Ollama -> 第二台 Ollama）-> 设置了密钥时 Claude Haiku
使用 Soniox 时：Soniox 在一个流中听和翻译 -> 语音
```

| 部分 | 运行位置 | 作用 |
| --- | --- | --- |
| `src/shared/platforms.js` | 各处 | 所有与网站相关的内容：通话地址、从麦克风按钮读取静音状态、网站的字幕区域、哪些标签页算视频标签页 |
| `src/content/page-hook.js` | 通话页面 | 把页面 `RTCRtpSender` 上的麦克风轨道换成翻译轨道（在 Zoom 中，在页面请求麦克风的地方替换麦克风），并同步静音 |
| `src/content/bridge.js` | 内容脚本 | 连接页面和引擎，显示面板和字幕（只在点击后才注入视频标签页） |
| `src/offscreen/engine.js` | 离屏文档 | 标签页捕获、麦克风、语音识别、翻译、语音、声音克隆、录制 |
| `src/offscreen/stt.js` | 离屏文档 | 实时语音识别客户端（ElevenLabs 或语音服务器）：自动重连，重连期间保留音频 |
| `src/offscreen/soniox.js` | 离屏文档 | Soniox：识别和翻译在同一个流中 |
| `src/offscreen/openai-speech.js`、`segmenter.js` | 离屏文档 | 兼容 OpenAI 的识别和声音；为接收完整录音的服务把语音切成句子 |
| `src/offscreen/tts.js`、`pipeline.js` | 离屏文档 | 语音：按分句、按顺序朗读，并控制延迟 |
| `src/offscreen/fallback-translator.js` | 离屏文档 | 一个翻译器在另一个之前 |
| `src/offscreen/translator.js` | 离屏文档 | Claude，以及每个翻译服务都会收到的指令和示例 |
| `src/offscreen/openai-translator.js`、`gemini-translator.js`、`ollama-translator.js` | 离屏文档 | OpenAI、OpenRouter 和兼容服务器；按模型降低思考的 Google Gemini；Ollama，逐句流式返回 |
| `src/offscreen/voice-clone.js` | 离屏文档 | ElevenLabs 声音克隆：你的，以及经同意的对方的 |
| `src/shared/pronounce.js` | 各处 | 外语词的正确读法：标注、内置列表和你的列表 |
| `src/shared/transcript.js`、`recordings.js` | 各处 | 保存在这台电脑上的文字记录和通话录制 |
| `src/shared/settings.js` | 各处 | 设置、默认值，以及每种语言可以使用哪个 Whisper 模型 |
| `src/shared/servers.js` | 各处 | 你自己的服务器：地址、访问权限、Ollama 的 Origin 请求头规则 |
| `src/popup/`、`src/options/`、`src/recording/` | 扩展页面 | 工具栏窗口、设置页面，以及录音和文字记录页面 |
| `src/background/service-worker.js` | Service worker | 启动和停止会话，检查每条消息的发送者，为弹出窗口保存状态 |
| `speech-server/` | 你的电脑（Python） | 在扩展所用的那部分 ElevenLabs API 之后运行 faster-whisper 和 Piper |

---

## 测试

```bash
npm test                 # 单元测试
npm run test:e2e         # 构建测试版本，加载到 Chromium，驱动模拟通话、服务器和视频标签页
ONLY=soniox,local npm run test:e2e   # 只运行名称包含这些词之一的测试组
npm run test:scenarios   # 一次模拟通话，经历重启、故障、设置更改和离开
npm run test:api         # 实时检查 ElevenLabs 和 Claude（密钥在 .env 中）
npm run test:soniox      # 实时检查 Soniox 密钥（不到一美分；密钥在 .env 中）
node test/ollama/live.mjs 100.101.102.103 gemma4:12b   # 通过设置页面实时检查 Ollama 服务器
cd speech-server && python -m pytest tests           # 语音服务器：协议、切分、密钥、拒绝网页请求
```

- 端到端测试不需要密钥，也不产生费用。除了模拟的 Meet 和 Zoom 通话，还覆盖录制、模拟 Ollama 服务器（像真的一样拒绝任何 `Origin` 请求头）、模拟 OpenAI 翻译和语音、模拟 Soniox 流、带替身引擎的真实语音服务器、完全不用 ElevenLabs 和 Claude 的通话，以及视频标签页。`.env` 中有密钥时，还会对真实的 ElevenLabs 和 Claude 做一次往返；`SKIP_REAL=1` 可跳过。
- `test/meet/` 中是使用真实服务的较慢检查：真实的 Google Meet 通话（`live.mjs`）、四人替身通话（`group-call.mjs`）以及录制的双向演示（`mock-call-demo.mjs`）。
- 它们使用 `--test` 构建（`npm run build:test`），为测试打开面板的 shadow root，并允许访问 `127.0.0.1` 和模拟视频网站；正常构建两者都没有。
- 测试用的语音样本由 macOS 的 `say` 命令和 ffmpeg 生成，证书由 openssl 生成。在 Windows 上，请把现成的 `english.wav`、`turkish.wav` 和 `tone.wav`（48 kHz 单声道）放进 `test/e2e/fixtures`，并把 Git 的 `usr\bin` 加入 PATH 以使用 openssl。语音服务器测试组需要安装了 `speech-server/requirements-test.txt` 的 Python。
- 实时测试的密钥放在本地 `.env` 文件中（见 `.env.example`）。`.env` 已被 git 忽略；切勿提交它。
- 调试版本（`npm run build:debug`）在通话页面设置了 `localStorage['meet-tercuman-debug'] = '<端口>'` 且运行着 `node test/meet/debug-sink-server.mjs <端口>` 时，可以把发给语音识别的音频和转写复制到 `127.0.0.1`。正常构建会忽略这个设置。

---

## 安全

扩展如何处理你的数据：[隐私政策](PRIVACY.md)（英语）。

- 没有自有后端，没有统计分析，没有远程代码：一切都包含在扩展内。
- 源代码中没有任何 API 密钥。密钥在设置页面中输入，保存在 `chrome.storage.local` 中，只发送给它所属的服务。你自己的服务器只通过你输入的地址访问，而且浏览器会就每个地址征求你的许可；语音服务器还需要它自己的密钥，并拒绝来自网页的请求。
- 视频标签页只在你点击扩展后才会被访问（`activeTab`）；扩展不要求访问所有网站。只有在 Zoom 中第一次开始翻译时，才会请求访问 Zoom。
- 通话页面中的脚本不发出任何网络请求。音频通过私有的 `MessagePort` 到达，它只提供给页面自己的源，并且只在钩子应答之前提供。
- 通话页面报告的内容（是否静音、它的麦克风）会被缩减为已知字段和正确类型；任何不明确的情况都按静音处理。在你静音时、向对方的翻译关闭时或通话尚未开始时，不会有任何声音进入通话。
- Service worker 和引擎会检查每条消息的发送者：内容脚本只能打招呼和停止自己的会话，模式值会按列表检查。
- 面板和字幕使用封闭的 shadow root，页面的脚本无法读取文字记录。只有测试和调试版本才会打开它们。
- 只有在你勾选同意框之后才会克隆对方的声音，除非你更改该设置，克隆会在通话后删除。录音和文字记录保存在你电脑上的扩展存储中，直到你保存或删除它们；只保留最近 50 份文字记录。

---

## 费用

面板会统计一次通话的用量，并按标价（2026 年 10 月 28 日）估算费用：Scribe v2 Realtime 每个活跃方向每小时 $0.39，Flash v2.5 和 v4 Turbo 语音每 1,000 字符 $0.04，Claude 按 token 计费（Haiku 5.5 最便宜）。仅字幕模式不生成语音。Ollama 和你自己的语音服务器不产生费用，面板按 $0 计算。OpenAI 和 OpenRouter 也按 token 计费，Soniox 按音频时长计费，但它们的价格不在估算中。

---

## 版本

版本号显示在弹出窗口和设置页面顶部；每个版本的变化见 [CHANGELOG.md](CHANGELOG.md)（英语），每个版本都有 git 标签（`v2.5.0`）。Chrome 网上应用店的版本会自动更新；从源码构建的版本用 `git pull` 和 `npm run build` 更新。语音服务器会报告自己的版本和协议，服务器需要更新时扩展会提示。

---

## 致谢和许可

土耳其语界面中名为 Canlı Tercüman。基于 UfukNode 的 Google Meet 扩展。[MIT](LICENSE)。语音服务器使用 faster-whisper（MIT）和 piper-tts（较新版本为 GPL-3.0），需单独安装；每个 Piper 声音都有自己的许可。
