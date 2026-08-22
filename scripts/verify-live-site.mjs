import jsQR from "jsqr";
import sharp from "sharp";
import {
  ADMIN_URL,
  DEBUT_RECORD_URL,
  DEPLOYMENT_HOST_URL,
  PHOTO_UPLOAD_URL,
  PUBLIC_SITE_URL,
  RECRUITMENT_URL,
} from "./site-urls.mjs";
const RULES_URL = "https://www.sport.gov.cn/stzx/n5434/c28603165/content.html";
const deploymentOrigin = new URL(DEPLOYMENT_HOST_URL).origin;
let requestQueue = Promise.resolve();

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const requestWithRetry = async (url) => {
  const requestUrl = new URL(url);
  if (requestUrl.origin === deploymentOrigin) {
    requestUrl.searchParams.set("_verify", `${Date.now()}-${Math.random()}`);
  }

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(requestUrl, {
        headers: {
          "cache-control": "no-cache",
        },
      });
      assert(response.ok, `${requestUrl} 返回 HTTP ${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 400));
      }
    }
  }

  throw lastError;
};

const get = (url) => {
  const request = requestQueue.then(() => requestWithRetry(url));
  requestQueue = request.catch(() => undefined);
  return request;
};

const verifyHtml = async (path, markers, absentMarkers = []) => {
  const response = await get(new URL(path, DEPLOYMENT_HOST_URL));
  const html = await response.text();

  for (const marker of markers) {
    assert(html.includes(marker), `${path || "/"} 缺少内容：${marker}`);
  }

  for (const marker of absentMarkers) {
    assert(!html.includes(marker), `${path || "/"} 仍包含应移除内容：${marker}`);
  }
};

const verifyPdf = async (path) => {
  const response = await get(new URL(path, DEPLOYMENT_HOST_URL));
  assert(response.headers.get("content-type")?.includes("application/pdf"), `${path} 不是 PDF`);
  assert(Number(response.headers.get("content-length") || 0) > 100_000, `${path} 文件不完整`);
};

const decodeRemoteQr = async (path, expectedUrl) => {
  const response = await get(new URL(path, DEPLOYMENT_HOST_URL));
  assert(response.headers.get("content-type")?.startsWith("image/png"), `${path} 不是 PNG`);
  const image = Buffer.from(await response.arrayBuffer());
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "dontInvert",
  });

  assert(decoded?.data === expectedUrl, `${path} 解码结果不正确`);
};

await Promise.all([
  verifyHtml("", [
    "从第一次接盘到第一次得分",
    "每周五 17:00–19:00 · 田径场",
    "教学楼旁篮球场",
    "每学期最多 10 次",
    "参赛可获文体积分",
    "在每一次交接中，感受信任的传递",
    'name="realName"',
    'name="displayName"',
    "仅管理员可见",
    'name="enrollmentYear"',
    'name="joinYear"',
    "以第一次来参加训练的日期为准",
    ">届<",
    "TEAM MOMENTS",
    "点击照片即可查看完整大图",
    'id="photo-lightbox"',
    'id="photo-lightbox-image"',
    "在新窗口打开原图",
    "加入队员名册",
    RULES_URL,
    "飞盘专业术语速查词典",
    "术语与手势速查",
    "WFDF 官方手势原表",
    "登记首次比赛与入队年份",
    "已经参加过正式比赛？",
    "./debut.html",
  ], [
    "gallery-qr-card",
    "qr-download-link",
    "BLACK-ANTS-QQ群二维码.png",
    "已经首次代表社团参加正式比赛？",
  ]),
  verifyHtml("admin.html", [
    "管理员登录",
    "成员名册审核后台",
    'data-resource="photos"',
    'data-resource="debuts"',
    "日常照片",
    "首次比赛",
  ]),
  verifyHtml("photos.html", [
    "上传一张照片",
    'name="creditName"',
    'name="photoDate"',
    'name="caption"',
  ]),
  verifyHtml("debut.html", [
    "登记首次比赛",
    'name="realName"',
    'name="displayName"',
    'name="competitionYear"',
    'name="competitionName"',
    "黑蚁飞盘队",
    "参加过正式比赛后",
  ], ["代表社团参加正式比赛"]),
  verifyHtml(
    "recruit.html",
    [
      "你好，",
      "大连理工大学开发区极限飞盘协会招新啦",
      "950881587",
      "二维码无法识别或失效时",
      "本招新页面无需填写任何个人信息",
      '<span class="primary-action scroll-cue">',
      "下滑查看新生专属内容",
      '<a class="secondary-action" href="./">或者点击此处进入完整官网</a>',
      'class="beginner-promise"',
      "包教包会",
      "未参加过线下训练的同学",
      "先加入 QQ 群和微信群",
      "参加至少一次线下训练后",
      "每周五 · 田径场",
      "按群公告加入微信群",
    ],
    [
      "<form",
      'name="realName"',
      'name="displayName"',
      "先加入招新群",
      "查看活动安排",
    ],
  ),
  verifyHtml("qrcodes.html", [
    "招新简版",
    "recruitment-qr-themed.png",
    "飞盘队官网",
    "成员审核后台",
    "日常照片上传",
    "website-qr-themed.png",
    "admin-qr-themed.png",
    "photo-upload-qr-themed.png",
    "首次比赛登记",
    "参加过正式比赛的同学",
    "debut-record-qr-themed.png",
  ]),
  decodeRemoteQr("qrcodes/recruitment-qr.png", RECRUITMENT_URL),
  decodeRemoteQr("qrcodes/recruitment-qr-themed.png", RECRUITMENT_URL),
  decodeRemoteQr("qrcodes/website-qr.png", PUBLIC_SITE_URL),
  decodeRemoteQr("qrcodes/website-qr-themed.png", PUBLIC_SITE_URL),
  decodeRemoteQr("qrcodes/admin-qr.png", ADMIN_URL),
  decodeRemoteQr("qrcodes/admin-qr-themed.png", ADMIN_URL),
  decodeRemoteQr("qrcodes/photo-upload-qr.png", PHOTO_UPLOAD_URL),
  decodeRemoteQr("qrcodes/photo-upload-qr-themed.png", PHOTO_UPLOAD_URL),
  decodeRemoteQr("qrcodes/debut-record-qr.png", DEBUT_RECORD_URL),
  decodeRemoteQr("qrcodes/debut-record-qr-themed.png", DEBUT_RECORD_URL),
  verifyPdf("docs/wfdf-ultimate-hand-signals-2025.pdf"),
  get(RULES_URL),
]);

console.log("线上页面、术语词典、规则资料和十张二维码校验通过。");
