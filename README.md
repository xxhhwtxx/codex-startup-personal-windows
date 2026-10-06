# Codex 角色主题开屏 · Windows

给官方 Codex 主窗口加入一段个人角色主题启动动画：头像花形光环 → 花瓣与碎片散开 → 描线显现 → 庭院背景 → 六瓣晶核收尾。

默认欢迎语：**哈哈，我们又见面了呢，现在又想干嘛呢？**

基于 [panding999/codex-startup-animation](https://github.com/panding999/codex-startup-animation) 改造，来源说明见 [NOTICE.md](NOTICE.md)。

![角色与花形光环](docs/opening.png)

![六瓣晶核收尾](docs/finale.png)

## 安装

要求 Windows 10/11、Microsoft Store 版官方 Codex。启动器优先使用 Codex 自带的 Node.js；若自带运行时缺失，可安装 Node.js 22 或更高版本。本项目没有 npm 依赖。

1. 下载并解压整个项目到一个固定位置。
2. 保存当前工作，完全退出 Codex。
3. 双击 **Install.cmd**。
4. 从桌面的 **Codex** 快捷方式打开。

安装会备份已有的桌面 Codex 快捷方式，并保留它原来的自定义图标。安装后请保留项目文件夹。移动文件夹后重新运行 Install.cmd。

动画显示在官方 Codex 主窗口，约 12 秒播放后停留 1.2 秒并自动进入应用。默认附带 150 fps 的完整动画缓存，直接播放不需要安装 FFmpeg 或浏览器依赖。

任务栏、开始菜单以及直接运行官方 exe 的入口不经过本启动器。要看到开屏，请使用安装后的桌面入口。

## 修改自己的角色和文字

- **Ctrl + Alt + B**：打开图片与文字设置。
- **Esc**：跳过开屏。
- 更换头像、横屏背景或欢迎语后，点击「保存并预览」。新背景会自动生成描线。
- 关闭「展示标题和欢迎语」，可只展示图案。

展示画面隐藏设置按钮、时间轴及说明文字。设置保存在官方应用的本机 IndexedDB 中。

保存修改后的即时预览使用实时渲染。下次从桌面入口启动时，启动器会在后台为新设置生成视频缓存；首次仍使用新设置实时播放，缓存生成完成后的启动使用新视频。缓存只在主题匹配时播放，避免显示旧头像或旧文字。

生成新缓存需要 Chrome 或 Edge，以及支持 H.264 编码的 FFmpeg。FFmpeg 可通过 PATH 查找、放在 `tools/ffmpeg.exe`，或用 `CODEX_STARTUP_FFMPEG` 环境变量指定。优先使用 NVIDIA 编码，不可用时使用 libx264。无需这些工具也能使用预置缓存和实时预览。

## 卸载

双击 **Uninstall.cmd** 恢复桌面入口，然后完全退出并重新打开 Codex。项目文件夹可在卸载后删除。

## 源码与本地检查

前端源码位于 `index.html`、`style.css`、`cinematic.css`、`animation.js`、`effects.js` 等文件。`extension/` 包含窗口注入、缓存播放构建及刷新工具；`assets/` 包含图片、轮廓和默认视频。

安装 Node.js 22 或更高版本后可执行：

```powershell
npm run check
npm run cache:probe
npm run cache:build
```

没有 npm 依赖，无需执行 npm install。`cache:probe` 只导出短片进行检查；`cache:build` 为默认主题重新生成完整缓存。自定义主题可用 `node extension/bake-movie.mjs --background --settings theme.json` 构建。

前端源码变更后，缓存指纹会失效，启动器会回到实时播放；重新生成缓存即可恢复缓存播放。

## 实现与兼容性

这是一份第三方启动器，不是官方插件。沿用原项目的临时 iframe 注入方式，不改写官方安装包。动画结束后移除覆盖层，启动辅助进程确认接入后退出。缓存生成工具只在需要更新时运行。

本机调试端口绑定到 `127.0.0.1`，并检查端口归属、当前用户以及官方可执行文件。完全退出 Codex 后，该端口随进程关闭。

窗口结构和内置运行时可能随 Codex 更新而改变。分享包包含完整源码与默认素材；适配过 26.928.3736.0，并在 26.930.4958.0 完成了开屏播放和自动退出验证，其他版本需实际验证。

## 上传 GitHub

解压分享 ZIP，把本目录里的源码、README 和 assets 等文件上传到仓库根目录。ZIP 本身可附在 GitHub Release 中供其他人下载安装。不要提交安装后生成的 `.lnk`、`runtime-state.json`、`startup-events.jsonl`、`.cache/` 或本机主题请求文件；`.gitignore` 已排除这些内容。

GitHub 网页上传的单文件上限为 25 MiB，本分享包的每个文件均在此范围内。可在仓库点击 Add file → Upload files，拖入解压后的文件与文件夹，再提交。[GitHub 官方上传说明](https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository)
