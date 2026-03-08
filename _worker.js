export default {
  async fetch(request, env) {
    if (!env.aloss) return new Response("R2 not bound", { status: 500 })

    const url = new URL(request.url)
    const path = url.pathname

    // ===== 首页 =====
    if (request.method === "GET" && path === "/") {
      return new Response(HTML, {
        headers: { "content-type": "text/html; charset=UTF-8" }
      })
    }

    // ===== 上传 =====
    if (request.method === "PUT" && path.startsWith("/upload/")) {
      const key = path.replace("/upload/", "")
      const contentType = request.headers.get("content-type") || ""
      const contentLength = Number(request.headers.get("Content-Length") || "0")
      const headerFileSize = Number(request.headers.get("x-file-size") || "0")
      const fileSize = headerFileSize || contentLength

      const MAX_FILE_SIZE = 50 * 1024 * 1024 // 50MB
      if (!fileSize || Number.isNaN(fileSize)) return new Response("Missing file size", { status: 400 })
      if (fileSize > MAX_FILE_SIZE) return new Response("File too large. Max 50MB.", { status: 400 })

      const normalizedContentType = contentType.split(";")[0].trim().toLowerCase()
      const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"])
      const isAllowedVideo = normalizedContentType === "video/mp4"
      const isAllowedImage = allowedImageTypes.has(normalizedContentType)
      if (!isAllowedImage && !isAllowedVideo) {
        return new Response("只允许上传 png/jpg/jpeg/gif/webp 图片或 mp4 视频", { status: 400 })
      }

      // ===== 可用空间检查 =====
      const listed = await env.aloss.list()
      const usedBytes = listed.objects.reduce((sum, obj) => sum + (obj.size || 0), 0)
      const FREE_QUOTA = 10 * 1024 * 1024 * 1024 // 10GB
      const remainingBytes = Math.max(FREE_QUOTA - usedBytes, 0)
      if (fileSize > remainingBytes) {
        return new Response("Insufficient storage space", { status: 400 })
      }

      await env.aloss.put(key, request.body, {
        httpMetadata: { contentType },
        customMetadata: { createdAt: Date.now().toString(), size: fileSize.toString() }
      })

      return new Response("OK")
    }

    // ===== 获取文件 =====
    if (request.method === "GET" && path.startsWith("/file/")) {
      const key = path.replace("/file/", "")
      const object = await env.aloss.get(key)
      if (!object) return new Response("Not Found", { status: 404 })
      const headers = new Headers()
      object.writeHttpMetadata(headers)
      headers.set("cache-control", "public, max-age=3600")
      return new Response(object.body, { headers })
    }

    // ===== 删除文件 =====
    if (request.method === "DELETE" && path.startsWith("/delete/")) {
      const key = path.replace("/delete/", "")
      await env.aloss.delete(key)
      return new Response("Deleted")
    }

    // ===== 列出文件 =====
    if (request.method === "GET" && path === "/list") {
      const listed = await env.aloss.list()
      const keys = listed.objects.map(obj => obj.key)
      return new Response(JSON.stringify(keys), { headers: { "content-type": "application/json" } })
    }

    // ===== 存储统计 =====
    if (request.method === "GET" && path === "/stats") {
      const listed = await env.aloss.list()
      const totalFiles = listed.objects.length
      const totalBytes = listed.objects.reduce((sum,obj)=>sum+(obj.size||0),0)
      const FREE_QUOTA = 10 * 1024 * 1024 * 1024
      const remainingBytes = Math.max(FREE_QUOTA - totalBytes, 0)
      return new Response(JSON.stringify({
        totalFiles,
        totalGB: (totalBytes / 1024 / 1024 / 1024).toFixed(2),
        remainingGB: (remainingBytes / 1024 / 1024 / 1024).toFixed(2)
      }), { headers: { "content-type": "application/json" } })
    }

    return new Response("Not Found", { status: 404 })
  },

  // ===== 每天自动清理（3 天过期） =====
  async scheduled(event, env, ctx) {
    if (!env.aloss) return
    const EXPIRE_MS = 3 * 24 * 60 * 60 * 1000
    const now = Date.now()
    let cursor
    do {
      const listed = await env.aloss.list({ cursor })
      cursor = listed.cursor
      for (const obj of listed.objects) {
        const createdAt = Number(obj.customMetadata?.createdAt)
        if (!createdAt) continue
        if (now - createdAt > EXPIRE_MS) {
          await env.aloss.delete(obj.key)
        }
      }
    } while (cursor)
  }
}

// ===== 前端 HTML =====
const HTML = `
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<meta name="googlebot" content="noindex, nofollow, noarchive, nosnippet, noimageindex">
<title>临时媒体存储 - Temporary-media-storage-cloudflare</title>
<style>
:root {
    --color-main-1: #cfc8d3; 
    --color-main-2: #9efbfb; 
    --color-main-3: #d5f8f9; 
    --color-main-4: #0deef5; 
    --color-main-5: #5ff4f8; 
    --color-main-6: #7b8dbb; 
    --color-accent-1: #0ab5dc; 

    --primary: var(--color-accent-1);
    --primary-hover: var(--color-main-4);
    --secondary: var(--color-main-6);
    --bg-body: #f8fbff;
    --bg-card: #ffffff;
    --text-main: #2c3e50;
    --text-muted: #7f8c8d;
    --border-light: rgba(207, 200, 211, 0.4);
    
    --radius-sm: 6px;
    --radius-md: 12px;
    --radius-lg: 20px;
    --radius-full: 9999px;
    --shadow: 0 8px 24px rgba(10, 181, 220, 0.1);
    --transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
}

* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    background: var(--bg-body);
    color: var(--text-main);
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100vh;
    padding: 40px 20px;
}

h2 { 
    margin-bottom: 30px; 
    color: var(--primary); 
    font-size: 1.8rem; 
    display: flex; 
    align-items: center; 
    font-weight: 800;
}
h2::before { 
    content: ''; 
    width: 6px; 
    height: 24px; 
    background: var(--primary); 
    margin-right: 12px; 
    border-radius: var(--radius-sm); 
}

.container {
    max-width: 1000px;
    width: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.header {
    width: 100%;
    max-width: 600px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
}

.header h2 { margin-bottom: 0; }

.lang-toggle {
    appearance: none;
    border: 1px solid var(--border-light);
    background: rgba(255, 255, 255, 0.9);
    color: var(--text-main);
    padding: 8px 12px;
    border-radius: var(--radius-full);
    box-shadow: 0 6px 18px rgba(10, 181, 220, 0.08);
    font-weight: 700;
    font-size: 0.85rem;
}
.lang-toggle:hover { background: var(--color-main-3); }

#uploadProgress {
    width: 100%;
    max-width: 600px;
    background: rgba(255, 255, 255, 0.92);
    border: 1px solid var(--border-light);
    border-radius: var(--radius-md);
    box-shadow: 0 6px 18px rgba(10, 181, 220, 0.08);
    padding: 12px 14px;
    margin: 0 0 22px;
}

.upload-progress-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
}

#uploadProgressText {
    font-size: 0.9rem;
    font-weight: 800;
    color: var(--text-main);
}

#uploadProgressPercent {
    font-size: 0.85rem;
    font-weight: 700;
    color: var(--secondary);
}

.upload-progress-detail {
    margin-top: 10px;
    font-size: 0.85rem;
    color: var(--text-muted);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
}

.upload-progress-bar {
    width: 100%;
    height: 8px;
    background: var(--color-main-3);
    border-radius: 9999px;
    overflow: hidden;
}

#uploadProgressFill {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, var(--primary), var(--primary-hover));
    border-radius: 9999px;
    transition: width 0.25s ease-out;
}

#storageStats { 
    background: var(--color-main-3); 
    color: var(--text-main); 
    padding: 15px 25px; 
    border-radius: var(--radius-md); 
    margin-bottom: 30px; 
    font-weight: 600;
    text-align: center;
    border: 1px solid var(--color-main-2);
    width: 100%;
    max-width: 600px;
}

#drop { 
    border: 2px dashed var(--primary); 
    background: var(--bg-card); 
    padding: 60px; 
    margin-bottom: 30px; 
    border-radius: var(--radius-lg); 
    cursor: pointer; 
    transition: var(--transition);
    text-align: center;
    color: var(--text-muted);
    font-size: 1.1rem;
    box-shadow: var(--shadow);
    width: 100%;
    max-width: 600px;
}
#drop:hover { 
    background: var(--color-main-3); 
    transform: translateY(-2px);
}

button { 
    padding: 10px 24px; 
    border-radius: var(--radius-full); 
    border: none; 
    cursor: pointer; 
    transition: var(--transition); 
    font-weight: 600; 
    display: inline-flex; 
    align-items: center; 
    justify-content: center; 
    gap: 8px; 
    font-size: 0.95rem; 
    margin: 5px;
}

#uploadBtn {
    background: var(--primary); 
    color: #fff; 
    box-shadow: 0 4px 12px rgba(10, 181, 220, 0.25);
    font-size: 1.1rem;
    padding: 12px 32px;
    margin-bottom: 40px;
}
#uploadBtn:hover { 
    background: var(--primary-hover); 
    transform: translateY(-2px); 
}

#list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 25px;
    width: 100%;
}

.media { 
    background: var(--bg-card); 
    padding: 15px; 
    border-radius: var(--radius-md); 
    box-shadow: var(--shadow); 
    border: 1px solid var(--border-light);
    display: flex;
    flex-direction: column;
    align-items: center;
    transition: var(--transition);
}
.media:hover {
    transform: translateY(-5px);
    box-shadow: 0 12px 30px rgba(10, 181, 220, 0.15);
}

img, video { 
    max-width: 100%; 
    height: auto;
    border-radius: var(--radius-sm); 
    margin-bottom: 15px;
    object-fit: cover;
    max-height: 200px;
    width: 100%;
}

.media button {
    font-size: 0.85rem;
    padding: 8px 16px;
    width: 100%;
    margin: 5px 0;
}

.media button:first-of-type {
    background: var(--color-main-3); 
    color: var(--primary);
}
.media button:first-of-type:hover {
    background: var(--color-main-2);
}

.media button:last-of-type {
    background: transparent;
    border: 1px solid #ff6b6b;
    color: #ff6b6b;
}
.media button:last-of-type:hover {
    background: #fff5f5;
}

.drop-icon {
    width: 52px;
    height: 52px;
    margin: 0 auto 14px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    background: var(--color-main-3);
    border: 1px solid var(--color-main-2);
    color: var(--primary);
}

#toastContainer {
    position: fixed;
    top: 24px;
    right: 24px;
    z-index: 9999;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.toast {
    background: #fff;
    border-left: 4px solid var(--primary);
    padding: 12px 14px;
    border-radius: var(--radius-md);
    box-shadow: var(--shadow);
    min-width: 240px;
    max-width: 320px;
    animation: toastIn 0.25s ease-out;
}
.toast.error { border-left-color: #ff6b6b; }
.toast-title { font-size: 0.9rem; font-weight: 800; color: var(--text-main); margin-bottom: 2px; }
.toast-msg { font-size: 0.85rem; color: var(--text-muted); word-break: break-word; }

@keyframes toastIn {
    from { transform: translateX(16px); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
}

</style>
</head>
<body>

<div class="container">
    <div class="header">
        <h2 id="pageTitle">临时媒体存储</h2>
        <button id="langToggle" class="lang-toggle" type="button">EN</button>
    </div>

    <div id="storageStats">正在加载统计...</div>

    <div id="drop">
        <div class="drop-icon" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
                <path d="M7 18h9a4 4 0 0 0 .6-7.96A6 6 0 0 0 5.3 12.2 3.5 3.5 0 0 0 7 18Z" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
                <path d="M12 14v5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M9.8 16.2 12 14l2.2 2.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <div id="dropText">拖拽图片或视频到这里</div>
    </div>
    
    <div style="text-align: center;">
        <button id="uploadBtn">选择媒体文件</button>
        <input id="fileInput" type="file" multiple accept="image/png,image/jpeg,image/jpg,image/gif,image/webp,video/mp4" hidden />
    </div>

    <div id="uploadProgress" hidden>
        <div class="upload-progress-row">
            <div id="uploadProgressText">上传进度：0/0</div>
            <div id="uploadProgressPercent">0%</div>
        </div>
        <div class="upload-progress-bar">
            <div id="uploadProgressFill"></div>
        </div>
        <div class="upload-progress-detail">
            <div id="uploadProgressBytes">0 B / 0 B</div>
            <div id="uploadProgressSpeed"></div>
        </div>
    </div>

    <div id="list"></div>
</div>

<div id="toastContainer" aria-live="polite" aria-atomic="true"></div>

<script>
const drop=document.getElementById("drop")
const list=document.getElementById("list")
const fileInput=document.getElementById("fileInput")
const uploadBtn=document.getElementById("uploadBtn")
const storageStats=document.getElementById("storageStats")
const toastContainer=document.getElementById("toastContainer")
const langToggle=document.getElementById("langToggle")
const pageTitle=document.getElementById("pageTitle")
const dropText=document.getElementById("dropText")
const uploadProgress=document.getElementById("uploadProgress")
const uploadProgressText=document.getElementById("uploadProgressText")
const uploadProgressFill=document.getElementById("uploadProgressFill")
const uploadProgressPercent=document.getElementById("uploadProgressPercent")
const uploadProgressBytes=document.getElementById("uploadProgressBytes")
const uploadProgressSpeed=document.getElementById("uploadProgressSpeed")

const TITLE_SUFFIX=" - Temporary-media-storage-cloudflare"

const I18N={
  zh:{
    title:"临时媒体存储",
    storageLoading:"正在加载统计...",
    dropHint:"拖拽图片或视频到这里",
    uploadButton:"选择媒体文件",
    copied:"已复制",
    copy:"复制链接",
    delete:"删除",
    toastSuccess:"成功",
    toastError:"失败",
    copySuccess:"链接已复制",
    copyFail:"复制失败",
    copyPrompt:"复制下面链接：",
    deleteConfirm:"确认删除该媒体？",
    deleteSuccess:"删除成功",
    deleteFail:"删除失败",
    uploadSuccess:"上传成功",
    uploadFail:"上传失败",
    uploadProgressText:(current,total)=>"上传进度："+current+"/"+total,
    uploadProgressDone:"上传完成",
    etaLabel:"剩余",
    invalidMedia:"只允许上传 png/jpg/jpeg/gif/webp 图片或 mp4 视频",
    fileTooLarge:"文件过大，最大50MB",
    insufficientSpace:"可用空间不足，无法上传",
    statsUnavailable:"无法获取存储统计",
    statsText:(s)=>"文件数量: "+s.totalFiles+" 个，已用空间: "+s.totalGB+" GB，可用空间: "+s.remainingGB+" GB"
  },
  en:{
    title:"Temporary Media Storage",
    storageLoading:"Loading stats...",
    dropHint:"Drop an image or mp4 video here",
    uploadButton:"Choose media files",
    copied:"Copied",
    copy:"Copy link",
    delete:"Delete",
    toastSuccess:"Success",
    toastError:"Error",
    copySuccess:"Link copied",
    copyFail:"Copy failed",
    copyPrompt:"Copy the link below:",
    deleteConfirm:"Delete this media?",
    deleteSuccess:"Deleted",
    deleteFail:"Delete failed",
    uploadSuccess:"Uploaded",
    uploadFail:"Upload failed",
    uploadProgressText:(current,total)=>"Upload: "+current+"/"+total,
    uploadProgressDone:"Upload complete",
    etaLabel:"ETA",
    invalidMedia:"Only png/jpg/jpeg/gif/webp images or mp4 videos are allowed",
    fileTooLarge:"File too large (max 50MB)",
    insufficientSpace:"Insufficient storage space",
    statsUnavailable:"Unable to load storage stats",
    statsText:(s)=>"Files: "+s.totalFiles+", Used: "+s.totalGB+" GB, Free: "+s.remainingGB+" GB"
  }
}

let currentLang="zh"
let lastStats=null
let uploadQueue=[]
let uploadTotal=0
let uploadDone=0
let uploading=false
let uploadBytesTotal=0
let uploadBytesDone=0
let currentFileLoaded=0
let currentSpeedBps=0

function resolveDefaultLang(){
  const saved=localStorage.getItem("lang")
  if(saved==="zh"||saved==="en") return saved
  const langs=(navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).filter(Boolean).map(s=>String(s).toLowerCase())
  const prefersZh=langs.some(l=>l.startsWith("zh"))
  return prefersZh ? "zh" : "en"
}

function t(key){
  const dict=I18N[currentLang]||I18N.zh
  const value=dict[key]
  return typeof value==="function" ? value : (value||key)
}

function setLang(lang){
  currentLang=lang==="en" ? "en" : "zh"
  localStorage.setItem("lang", currentLang)
  if(pageTitle) pageTitle.innerText=t("title")
  if(dropText) dropText.innerText=t("dropHint")
  if(uploadBtn) uploadBtn.innerText=t("uploadButton")
  updateUploadProgressUI()
  if(storageStats){
    if(lastStats){
      storageStats.innerText=I18N[currentLang].statsText(lastStats)
    }else{
      storageStats.innerText=t("storageLoading")
    }
  }
  document.title=t("title")+TITLE_SUFFIX
  document.documentElement.lang=currentLang==="zh" ? "zh" : "en"
  if(langToggle) langToggle.innerText=currentLang==="zh" ? "EN" : "中文"
  document.querySelectorAll("[data-role='copy']").forEach(btn=>{
    const b=btn
    if(!b.disabled) b.innerText=t("copy")
    b.dataset.labelDefault=t("copy")
    b.dataset.labelCopied=t("copied")
  })
  document.querySelectorAll("[data-role='delete']").forEach(btn=>{
    btn.innerText=t("delete")
  })
}

function setUploadProgressVisible(visible){
  if(!uploadProgress) return
  uploadProgress.hidden=!visible
}

function updateUploadProgressUI(){
  if(!uploadProgress || uploadProgress.hidden) return
  if(!uploadProgressText || !uploadProgressFill || !uploadProgressPercent) return
  if(!uploadProgressBytes || !uploadProgressSpeed) return
  if(uploadTotal<=0 || uploadBytesTotal<=0){
    uploadProgressText.innerText=I18N[currentLang].uploadProgressText(0, 0)
    uploadProgressFill.style.width="0%"
    uploadProgressPercent.innerText="0%"
    uploadProgressBytes.innerText="0 B / 0 B"
    uploadProgressSpeed.innerText=""
    return
  }

  const uploadedBytes=Math.max(0, Math.min(uploadBytesTotal, uploadBytesDone + currentFileLoaded))
  const percent=Math.max(0, Math.min(100, Math.floor((uploadedBytes / uploadBytesTotal) * 100)))
  uploadProgressFill.style.width=percent+"%"
  uploadProgressPercent.innerText=percent+"%"

  const up=formatBytes(uploadedBytes)
  const total=formatBytes(uploadBytesTotal)
  uploadProgressBytes.innerText=up.value+" "+up.unit+" / "+total.value+" "+total.unit

  let speedText=""
  if(uploading && currentSpeedBps>0){
    speedText=formatSpeed(currentSpeedBps)
    const remainingBytes=Math.max(0, uploadBytesTotal - uploadedBytes)
    const etaSeconds=remainingBytes / currentSpeedBps
    if(isFinite(etaSeconds) && etaSeconds>=0){
      speedText=speedText+" · "+t("etaLabel")+" "+formatDuration(etaSeconds)
    }
  }
  uploadProgressSpeed.innerText=speedText

  if(uploading){
    const current=Math.min(uploadDone+1, Math.max(uploadTotal, 1))
    uploadProgressText.innerText=I18N[currentLang].uploadProgressText(current, uploadTotal)
  }else if(uploadDone>=uploadTotal){
    uploadProgressText.innerText=t("uploadProgressDone")
  }else{
    uploadProgressText.innerText=I18N[currentLang].uploadProgressText(uploadDone, uploadTotal)
  }
}

function formatBytes(bytes){
  const b=Math.max(0, Number(bytes)||0)
  const units=["B","KB","MB","GB","TB"]
  let value=b
  let unitIndex=0
  while(value>=1024 && unitIndex<units.length-1){
    value=value/1024
    unitIndex++
  }
  const fixed=value>=100 ? 0 : (value>=10 ? 1 : 2)
  return { value: value.toFixed(fixed), unit: units[unitIndex] }
}

function formatSpeed(bytesPerSecond){
  const f=formatBytes(bytesPerSecond)
  return f.value+" "+f.unit+"/s"
}

function formatDuration(seconds){
  const s=Math.max(0, Math.floor(Number(seconds)||0))
  const h=Math.floor(s/3600)
  const m=Math.floor((s%3600)/60)
  const sec=s%60
  const pad=(n)=>String(n).padStart(2,"0")
  if(h>0) return h+":"+pad(m)+":"+pad(sec)
  return m+":"+pad(sec)
}

async function enqueueUploads(fileList){
  const files=Array.from(fileList||[])
  if(files.length===0) return

  if(!uploading){
    uploadQueue=[]
    uploadTotal=0
    uploadDone=0
    uploadBytesTotal=0
    uploadBytesDone=0
    currentFileLoaded=0
    currentSpeedBps=0
  }

  for(const file of files){
    uploadQueue.push(file)
    uploadTotal++
    uploadBytesTotal+=Number(file.size||0)
  }

  setUploadProgressVisible(true)
  updateUploadProgressUI()
  if(!uploading) await processUploadQueue()
}

async function processUploadQueue(){
  uploading=true
  updateUploadProgressUI()
  try{
    while(uploadQueue.length){
      const file=uploadQueue.shift()
      currentFileLoaded=0
      currentSpeedBps=0
      updateUploadProgressUI()
      const ok=await uploadFile(file)
      if(ok){
        uploadDone++
        uploadBytesDone+=Number(file.size||0)
      }else{
        uploadTotal=Math.max(0, uploadTotal-1)
        uploadBytesTotal=Math.max(0, uploadBytesTotal-Number(file.size||0))
      }
      currentFileLoaded=0
      currentSpeedBps=0
      updateUploadProgressUI()
    }
  }finally{
    uploading=false
    updateUploadProgressUI()
    setTimeout(()=>{
      if(!uploading && uploadQueue.length===0){
        setUploadProgressVisible(false)
      }
    },2500)
  }
}

function isAllowedMedia(file){
  const mime=(file.type||"").toLowerCase()
  if(mime==="video/mp4") return true
  if(mime==="image/png"||mime==="image/jpeg"||mime==="image/jpg"||mime==="image/gif"||mime==="image/webp") return true

  const name=(file.name||"").toLowerCase()
  if(name.endsWith(".mp4")) return true
  if(name.endsWith(".png")||name.endsWith(".jpg")||name.endsWith(".jpeg")||name.endsWith(".gif")||name.endsWith(".webp")) return true
  return false
}

function getMediaPrefix(file){
  const mime=(file.type||"").toLowerCase()
  if(mime.startsWith("image/")) return "Image"
  if(mime.startsWith("video/")) return "Video"
  const name=(file.name||"").toLowerCase()
  if(name.endsWith(".mp4")) return "Video"
  return "File"
}

function getFileExtension(file){
  const name=file.name||""
  const dotIndex=name.lastIndexOf(".")
  if(dotIndex>=0 && dotIndex<name.length-1){
    return name.slice(dotIndex+1).toLowerCase()
  }

  const mime=file.type||""
  const parts=mime.split("/")
  const subtype=(parts[1]||"").split(";")[0].toLowerCase()
  if(subtype==="jpeg") return "jpg"
  if(subtype==="svg+xml") return "svg"
  return subtype||"bin"
}

function genKey(file){
  const prefix=getMediaPrefix(file)
  const ext=getFileExtension(file)
  return prefix+"_"+Date.now()+"."+ext
}

function showToast(message,type="success"){
  if(!toastContainer) return
  const toast=document.createElement("div")
  toast.className="toast"+(type==="error"?" error":"")
  const title=document.createElement("div")
  title.className="toast-title"
  title.innerText=type==="error"?t("toastError"):t("toastSuccess")
  const msg=document.createElement("div")
  msg.className="toast-msg"
  msg.innerText=message
  toast.append(title,msg)
  toastContainer.appendChild(toast)
  setTimeout(()=>{
    toast.style.opacity="0"
    toast.style.transform="translateX(16px)"
    setTimeout(()=>toast.remove(),250)
  },3000)
}

async function copyTextToClipboard(text){
  try{
    if(window.isSecureContext && navigator.clipboard && typeof navigator.clipboard.writeText==="function"){
      await navigator.clipboard.writeText(text)
      return true
    }
  }catch(e){}

  try{
    const textarea=document.createElement("textarea")
    textarea.value=text
    textarea.setAttribute("readonly","")
    textarea.style.position="fixed"
    textarea.style.left="-9999px"
    textarea.style.top="0"
    textarea.style.opacity="0"
    document.body.appendChild(textarea)
    textarea.focus()
    textarea.select()
    textarea.setSelectionRange(0, textarea.value.length)
    const ok=document.execCommand("copy")
    textarea.remove()
    return !!ok
  }catch(e){
    return false
  }
}

async function uploadFile(file){
  if(!isAllowedMedia(file)){alert(t("invalidMedia"));return false}

  const MAX_FILE_SIZE = 50*1024*1024
  if(file.size>MAX_FILE_SIZE){alert(t("fileTooLarge"));return false}

  // ===== 检查可用空间 =====
  const statsRes = await fetch("/stats")
  const stats = await statsRes.json()
  const remainingBytes = stats.remainingGB * 1024 * 1024 * 1024
  if(file.size > remainingBytes){alert(t("insufficientSpace"));return false}

  const key=genKey(file)
  const contentType=getUploadContentType(file)
  const ok=await uploadViaXHR("/upload/"+key, file, contentType, (loaded, total, speedBps)=>{
    currentFileLoaded=loaded
    if(speedBps>0){
      currentSpeedBps=currentSpeedBps>0 ? (currentSpeedBps*0.7 + speedBps*0.3) : speedBps
    }
    updateUploadProgressUI()
  })
  if(!ok){showToast(t("uploadFail"),"error");return false}
  showFile(key)
  loadStats()
  showToast(t("uploadSuccess"))
  return true
}

function getUploadContentType(file){
  const mime=String(file.type||"").split(";")[0].trim().toLowerCase()
  if(mime) return mime
  const name=String(file.name||"").toLowerCase()
  if(name.endsWith(".png")) return "image/png"
  if(name.endsWith(".jpg")||name.endsWith(".jpeg")) return "image/jpeg"
  if(name.endsWith(".gif")) return "image/gif"
  if(name.endsWith(".webp")) return "image/webp"
  if(name.endsWith(".mp4")) return "video/mp4"
  return "application/octet-stream"
}

function uploadViaXHR(url, file, contentType, onProgress){
  return new Promise(resolve=>{
    const xhr=new XMLHttpRequest()
    let lastTime=performance.now()
    let lastLoaded=0

    xhr.open("PUT", url, true)
    if(contentType) xhr.setRequestHeader("Content-Type", contentType)
    xhr.setRequestHeader("X-File-Size", String(file.size||0))

    xhr.upload.onprogress=(e)=>{
      if(!e || !e.lengthComputable) return
      const now=performance.now()
      const dt=(now-lastTime)/1000
      let speed=0
      if(dt>0){
        speed=(e.loaded-lastLoaded)/dt
      }
      lastTime=now
      lastLoaded=e.loaded
      if(typeof onProgress==="function") onProgress(e.loaded, e.total, speed)
    }

    xhr.onload=()=>{
      resolve(xhr.status>=200 && xhr.status<300)
    }
    xhr.onerror=()=>resolve(false)
    xhr.onabort=()=>resolve(false)
    xhr.send(file)
  })
}

// ===== 文件列表 =====
async function loadList(){
  const res=await fetch("/list")
  const keys=await res.json()
  keys.sort((a,b)=>b.localeCompare(a))
  for(const key of keys){ showFile(key) }
}

// ===== 存储统计 =====
async function loadStats(){
  try{
    const res = await fetch("/stats")
    const stats = await res.json()
    lastStats=stats
    storageStats.innerText = I18N[currentLang].statsText(stats)
  }catch(e){
    storageStats.innerText=t("statsUnavailable")
  }
}

// ===== 拖拽上传 =====
drop.ondragover=e=>e.preventDefault()
drop.ondrop=e=>{
  e.preventDefault()
  enqueueUploads(e.dataTransfer.files)
}

// ===== 按钮上传 =====
uploadBtn.onclick=()=>fileInput.click()
fileInput.onchange=()=>{
  enqueueUploads(fileInput.files)
  fileInput.value=""
}

// ===== 展示文件 =====
function showFile(key){
  const url="/file/"+key
  const div=document.createElement("div")
  div.className="media"
  if(key.match(/\\.(mp4)$/i)){div.innerHTML='<video controls src="'+url+'"></video>'}
  else{div.innerHTML='<img src="'+url+'" />'}
  const copy=document.createElement("button")
  copy.innerText=t("copy")
  copy.dataset.role="copy"
  copy.dataset.labelDefault=t("copy")
  copy.dataset.labelCopied=t("copied")
  copy.onclick=async()=>{
    const originalText=copy.innerText
    try{
      const text=location.origin+url
      const ok=await copyTextToClipboard(text)
      if(!ok){
        try{ window.prompt(t("copyPrompt"), text) }catch(e){}
        showToast(t("copyFail"),"error")
        return
      }
      copy.innerText=copy.dataset.labelCopied||t("copied")
      copy.disabled=true
      showToast(t("copySuccess"))
      setTimeout(()=>{
        copy.disabled=false
        copy.innerText=copy.dataset.labelDefault||originalText
      },1200)
    }catch(e){
      showToast(t("copyFail"),"error")
    }
  }
  const del=document.createElement("button")
  del.innerText=t("delete")
  del.dataset.role="delete"
  del.onclick=async()=>{
    if(!confirm(t("deleteConfirm"))) return
    const delRes=await fetch("/delete/"+key,{method:"DELETE"})
    if(!delRes.ok){showToast(t("deleteFail"),"error");return}
    div.remove()
    loadStats()
    showToast(t("deleteSuccess"))
  }
  div.append(copy,del)
  list.appendChild(div)
}

// ===== 初始化 =====
setLang(resolveDefaultLang())
if(langToggle){
  langToggle.onclick=()=>setLang(currentLang==="zh" ? "en" : "zh")
}
loadList()
loadStats()
</script>

</body>
</html>
`
