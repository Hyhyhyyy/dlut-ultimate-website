import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import jsQR from "jsqr";
import QRCode from "qrcode";
import sharp from "sharp";
import {
  ADMIN_URL,
  DEBUT_RECORD_URL,
  PHOTO_UPLOAD_URL,
  PUBLIC_SITE_URL,
  RECRUITMENT_URL,
} from "./site-urls.mjs";
const outputDirectory = resolve("public", "qrcodes");
const logoPath = resolve("assets", "team-logo.png");

const colors = {
  navy: "#071b35",
  blue: "#1f4fd1",
  yellow: "#ffd43b",
  cream: "#f4f0e6",
  white: "#ffffff",
};

const escapeXml = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");

const createQrBuffer = (url) =>
  QRCode.toBuffer(url, {
    type: "png",
    errorCorrectionLevel: "H",
    margin: 4,
    scale: 10,
    color: {
      dark: colors.navy,
      light: colors.white,
    },
  });

const verifyQrBuffer = async (qr, expectedUrl) => {
  const { data, info } = await sharp(qr)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const decoded = jsQR(new Uint8ClampedArray(data), info.width, info.height, {
    inversionAttempts: "dontInvert",
  });

  if (decoded?.data !== expectedUrl) {
    throw new Error(`二维码校验失败：${expectedUrl}`);
  }
};

const createPosterSvg = ({
  title,
  label,
  url,
  subtitle = "扫码打开 · 长按图片保存",
  detail = "",
  qrWidth,
  qrHeight,
  est = "EST. 2024",
}) => {
  const width = 1080;
  const height = 1350;
  const qrLeft = Math.round((width - qrWidth) / 2);
  const qrTop = 265;
  const panelPadding = 24;
  const panelLeft = qrLeft - panelPadding;
  const panelTop = qrTop - panelPadding;
  const panelWidth = qrWidth + panelPadding * 2;
  const panelHeight = qrHeight + panelPadding * 2;
  const copyTop = panelTop + panelHeight + 70;
  const detailMarkup = detail
    ? `<text x="64" y="${copyTop + 198}" fill="${colors.cream}"
          font-family="'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
          font-size="20" font-weight="600">${escapeXml(detail)}</text>`
    : "";
  const urlTop = detail ? copyTop + 238 : copyTop + 213;

  return {
    qrLeft,
    qrTop,
    svg: Buffer.from(`
      <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"
        xmlns="http://www.w3.org/2000/svg">
        <rect width="${width}" height="${height}" fill="${colors.navy}"/>
        <path d="M0 210H1080M0 1140H1080" stroke="${colors.blue}" stroke-width="3"/>
        <path d="M100 0V1350M980 0V1350" stroke="${colors.blue}" stroke-width="2"
          stroke-dasharray="10 18" opacity=".72"/>
        <path d="M782 102C861 77 946 82 1022 116" fill="none" stroke="${colors.yellow}"
          stroke-width="13" stroke-linecap="round"/>
        <ellipse cx="777" cy="104" rx="70" ry="24" fill="${colors.yellow}"
          transform="rotate(-9 777 104)"/>
        <path d="M725 103C752 114 806 113 830 99" fill="none" stroke="${colors.navy}"
          stroke-width="5" stroke-linecap="round"/>

        <rect x="64" y="54" width="118" height="118" rx="59" fill="${colors.white}"/>
        <text x="214" y="92" fill="${colors.yellow}" font-family="Arial, sans-serif"
          font-size="26" font-weight="800" letter-spacing="5">BLACK ANTS</text>
        <text x="214" y="135" fill="${colors.white}" font-family="Arial, sans-serif"
          font-size="20" font-weight="600" letter-spacing="3">FLYING DISC TEAM</text>
        <text x="1018" y="181" text-anchor="end" fill="${colors.white}"
          font-family="Arial, sans-serif" font-size="18" font-weight="700"
          letter-spacing="2">SCAN · PASS · PLAY</text>

        <rect x="${panelLeft}" y="${panelTop}" width="${panelWidth}" height="${panelHeight}"
          fill="${colors.white}" stroke="${colors.yellow}" stroke-width="12"/>
        <path d="M${panelLeft - 22} ${panelTop + 100}V${panelTop - 22}H${panelLeft + 100}"
          fill="none" stroke="${colors.yellow}" stroke-width="10"/>
        <path d="M${panelLeft + panelWidth - 100} ${panelTop - 22}H${panelLeft + panelWidth + 22}V${panelTop + 100}"
          fill="none" stroke="${colors.yellow}" stroke-width="10"/>
        <path d="M${panelLeft - 22} ${panelTop + panelHeight - 100}V${panelTop + panelHeight + 22}H${panelLeft + 100}"
          fill="none" stroke="${colors.yellow}" stroke-width="10"/>
        <path d="M${panelLeft + panelWidth - 100} ${panelTop + panelHeight + 22}H${panelLeft + panelWidth + 22}V${panelTop + panelHeight - 100}"
          fill="none" stroke="${colors.yellow}" stroke-width="10"/>

        <rect x="64" y="${copyTop - 24}" width="236" height="44" fill="${colors.yellow}"/>
        <text x="80" y="${copyTop + 8}" fill="${colors.navy}"
          font-family="'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
          font-size="22" font-weight="800" letter-spacing="2">${escapeXml(label)}</text>
        <text x="64" y="${copyTop + 94}" fill="${colors.white}"
          font-family="'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
          font-size="56" font-weight="900">${escapeXml(title)}</text>
        <text x="64" y="${copyTop + 152}" fill="${colors.cream}"
          font-family="'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif"
          font-size="24" font-weight="500">${escapeXml(subtitle)}</text>
        ${detailMarkup}
        <text x="64" y="${urlTop}" fill="${colors.white}" opacity=".62"
          font-family="Arial, sans-serif" font-size="16">${escapeXml(url)}</text>

        <circle cx="950" cy="${copyTop + 100}" r="74" fill="none" stroke="${colors.yellow}"
          stroke-width="10"/>
        <ellipse cx="950" cy="${copyTop + 100}" rx="55" ry="19" fill="none"
          stroke="${colors.white}" stroke-width="7" transform="rotate(-12 950 ${copyTop + 100})"/>
        <path d="M880 ${copyTop + 143}L812 ${copyTop + 186}" stroke="${colors.blue}"
          stroke-width="8" stroke-linecap="round"/>
        <path d="M892 ${copyTop + 159}L845 ${copyTop + 203}" stroke="${colors.yellow}"
          stroke-width="8" stroke-linecap="round"/>

        <text x="64" y="1300" fill="${colors.white}" font-family="Arial, sans-serif"
          font-size="18" font-weight="700" letter-spacing="4">DUT DEVELOPMENT ZONE CAMPUS</text>
        <text x="1016" y="1300" text-anchor="end" fill="${colors.yellow}"
          font-family="Arial, sans-serif" font-size="18" font-weight="800">${escapeXml(est)}</text>
      </svg>
    `),
  };
};

const createPoster = async ({
  fileStem,
  label,
  title,
  url,
  subtitle,
  detail,
  logo,
  est,
}) => {
  const qr = await createQrBuffer(url);
  await verifyQrBuffer(qr, url);
  const { width: qrWidth, height: qrHeight } = await sharp(qr).metadata();

  if (!qrWidth || !qrHeight) {
    throw new Error(`无法读取 ${fileStem} 二维码尺寸。`);
  }

  const poster = createPosterSvg({
    title,
    label,
    url,
    subtitle,
    detail,
    qrWidth,
    qrHeight,
    est,
  });
  const logoSize = 102;
  const logoMask = Buffer.from(`
    <svg width="${logoSize}" height="${logoSize}" xmlns="http://www.w3.org/2000/svg">
      <circle cx="${logoSize / 2}" cy="${logoSize / 2}" r="${logoSize / 2}" fill="#fff"/>
    </svg>
  `);
  const logoBuffer = await sharp(logo)
    .resize(logoSize, logoSize, { fit: "cover" })
    .composite([{ input: logoMask, blend: "dest-in" }])
    .png()
    .toBuffer();

  const themedPoster = await sharp(poster.svg)
    .composite([
      { input: qr, left: poster.qrLeft, top: poster.qrTop },
      { input: logoBuffer, left: 72, top: 62 },
    ])
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 220 })
    .toBuffer();
  await verifyQrBuffer(themedPoster, url);
  await writeFile(resolve(outputDirectory, `${fileStem}-themed.png`), themedPoster);

  const standardQr = await sharp(qr)
    .png({ compressionLevel: 9 })
    .withMetadata({ density: 220 })
    .toBuffer();
  await verifyQrBuffer(standardQr, url);
  await writeFile(resolve(outputDirectory, `${fileStem}.png`), standardQr);
};

await mkdir(outputDirectory, { recursive: true });
const logo = await readFile(logoPath);

await Promise.all([
  createPoster({
    fileStem: "recruitment-qr",
    est: "EST. 2021",
    label: "2026 招新",
    title: "你好，新同学",
    subtitle: "每周五 17:00–19:00 · 田径场",
    detail: "QQ群 950881587 · 零基础可来 · 参加一次训练后登记",
    url: RECRUITMENT_URL,
    logo,
  }),
  createPoster({
    fileStem: "website-qr",
    label: "官方网站",
    title: "把飞盘传给下一位队友",
    url: PUBLIC_SITE_URL,
    logo,
  }),
  createPoster({
    fileStem: "admin-qr",
    label: "审核入口",
    title: "成员名册审核后台",
    url: ADMIN_URL,
    logo,
  }),
  createPoster({
    fileStem: "photo-upload-qr",
    label: "照片上传",
    title: "分享队伍日常瞬间",
    url: PHOTO_UPLOAD_URL,
    logo,
  }),
  createPoster({
    fileStem: "debut-record-qr",
    label: "首次比赛",
    title: "记录第一次正式上场",
    url: DEBUT_RECORD_URL,
    logo,
  }),
]);

console.log(`二维码已生成：${outputDirectory}`);
