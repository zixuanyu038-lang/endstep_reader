# Endstep 回放阅读器

在浏览器中将 Endstep `.esreplay` 文件转换为中文战报或原始 JSONL。纯静态页面，不需要后端、账号或 API Key；导入文件在浏览器本地处理。

## 使用

打开网页，选择或拖入回放文件。支持按局、回合和阶段阅读、搜索牌名、查看局面快照与牌面文字，以及导出 HTML、Markdown、TXT、JSON 和原始 JSONL。原始 JSONL 视图支持类型筛选与关键词搜索。

## 发布到 GitHub Pages

1. 创建一个 GitHub 仓库。
2. 将本目录中的文件上传到仓库根目录，确保 `index.html` 就在根目录。
3. 在仓库的 **Settings → Pages**，选择 **Deploy from a branch**。
4. 选择默认分支（通常是 `main`），目录选择 **/(root)**，保存。
5. 部署完成后，在 Pages 页面打开显示的网址。

## 本地使用与开发

无需安装依赖。可直接用较新版浏览器打开 `index.html`。也可以在本目录启动仅供开发使用的本地服务器：

```powershell
python -m http.server 8000 --bind 127.0.0.1
```

然后打开 `http://127.0.0.1:8000`。

需要打包成单个离线 HTML 时，使用 Node.js：

```powershell
node build.js
```

生成 `dist/Endstep对局档案.html`，双击即可打开。修改源码后重新运行构建。

解析测试：

```powershell
node --test tests/replay.test.js
```

## 语义范围

已验证 Endstep Replay v1。以游戏事件为依据，区分施放、结算、异能和区域移动；保留隐藏信息，不使用后续揭示内容补全历史手牌。牌名保留英文，部分效应保留原文。不是全卡牌中文数据库、规则引擎或自动策略评分器。

术语参考 [万智牌官方规则](https://magic.wizards.com/en/rules)。牌面文字来自回放文件，可能与最新 Oracle 不同。

本发布包不包含示例对局或玩家回放数据。软件不会上传用户导入的文件。
