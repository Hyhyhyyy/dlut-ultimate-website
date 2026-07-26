const normalizeBaseUrl = (value, label) => {
  const url = new URL(value);

  if (url.protocol !== "https:") {
    throw new Error(`${label} 必须使用 HTTPS。`);
  }

  url.hash = "";
  url.search = "";
  url.pathname = `${url.pathname.replace(/\/+$/u, "")}/`;
  return url.href;
};

export const PUBLIC_SITE_URL = normalizeBaseUrl(
  process.env.PUBLIC_SITE_URL || "https://dutultimate.club/",
  "长期宣传域名",
);

export const DEPLOYMENT_HOST_URL = normalizeBaseUrl(
  process.env.DEPLOYMENT_HOST_URL ||
    "https://dut-ultimate-website-black-ants-prod-d7flfzzv4b3a8f70.webapps.tcloudbase.com/",
  "CloudBase 部署地址",
);

export const ADMIN_URL = new URL("admin.html", PUBLIC_SITE_URL).href;
export const PHOTO_UPLOAD_URL = new URL("photos.html", PUBLIC_SITE_URL).href;
export const DEBUT_RECORD_URL = new URL("debut.html", PUBLIC_SITE_URL).href;
