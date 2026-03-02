## 临时媒体存储（Cloudflare Worker + R2）

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/al01cn/Temporary-media-storage-cloudflare.git)

一个轻量的「临时媒体储存」小工具，专为 Cloudflare Worker 设计，使用 **Cloudflare R2** 作为存储后端，并在上传时严格控制总容量 **≤ 10GB**，避免超出免费存储空间。

默认提供一个简洁的 Web UI（支持中/英切换，默认跟随浏览器语言），支持上传、预览、复制链接、删除、统计容量，并会自动清理过期文件。

### 截图

中文界面：

![中文界面](images/cn/p1.jpg)

English UI:

![English UI](images/en/p1.jpg)

---

## 功能特性

- Web UI：上传 / 预览 / 复制链接（含兼容回退）/ 删除（含二次确认）/ 存储统计
- 文件类型限制：
  - 图片：png / jpg / jpeg / gif / webp
  - 视频：仅 mp4
- 命名规则：上传文件重命名为 `Image_<时间戳>.<ext>` / `Video_<时间戳>.<ext>`
- 容量上限：总容量限制为 **10GB**（上传前会计算已用空间并拒绝超额上传）
- 自动清理：定时任务自动删除 **超过 3 天**的文件
- 禁止收录：页面 meta 默认 `noindex, nofollow`，避免被搜索引擎抓取

---

## 绑定与配置

Worker 需要绑定一个 R2 Bucket（代码里使用的绑定名为 `aloss`）。

- R2 Bucket Binding：`aloss`

容量上限与单文件上限：

- 总容量上限：10GB（写死在代码中）
- 单文件上限：50MB（写死在代码中）

---

## 部署方式

### 一键部署（Deploy to Cloudflare）

一键部署前，请先在 Cloudflare 账号里开通 R2（Workers 需要绑定 R2 Bucket 才能正常工作）。未开通 R2 的账号会在部署/绑定阶段失败。

将本项目推送到 **GitHub / GitLab 公共仓库**后，把上方按钮链接里的 `https://github.com/al01cn/Temporary-media-storage-cloudflare.git` 替换为你的仓库地址，即可一键克隆并部署到你的 Cloudflare 账号。

按钮链接格式（官方）：

`https://deploy.workers.cloudflare.com/?url=https://github.com/al01cn/Temporary-media-storage-cloudflare.git`

### 方式 A：Cloudflare Dashboard（推荐）

1. 打开 Cloudflare Dashboard → Workers & Pages → Workers
2. 新建一个 Worker，将 [_worker.js](./_worker.js) 的内容粘贴进去并保存
3. 在 Worker 的 Settings → Bindings：
   - 添加 R2 Bucket，绑定名称填写 `aloss`，选择你创建/已有的 R2 Bucket
4. （可选）在 Triggers 里开启 Cron Trigger（用于 3 天过期清理）

### 方式 B：Wrangler（可选）

如果你习惯用 Wrangler，可以直接使用仓库内的 [wrangler.toml](./wrangler.toml)：

```toml
... 省略（请以 wrangler.toml 为准）
```

---

## 使用说明（API）

Worker 暴露了以下接口（同时供前端 UI 调用）：

- `GET /`：Web UI
- `PUT /upload/<key>`：上传（前端会自动生成 key）
- `GET /file/<key>`：读取文件（带 `cache-control: public, max-age=3600`）
- `DELETE /delete/<key>`：删除文件
- `GET /list`：列出所有 key（JSON 数组）
- `GET /stats`：统计（JSON：`totalFiles / totalGB / remainingGB`）

---

## 说明与注意事项

- 本项目默认**不做鉴权**：任何能访问到 Worker 域名的人，都能查看列表并删除文件。建议你在 Cloudflare Access、WAF、或 Worker 层加鉴权后再公开使用。
- 为了保证不超过 10GB，每次上传会 `list()` 统计总大小；当对象数量特别大时会增加请求开销（这是用“简单方案”换取“严格不超额”）。
