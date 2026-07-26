"use strict";

const MAX_AVATAR_BYTES = 512 * 1024;
const MAX_GALLERY_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_NAME_LENGTH = 20;
const MAX_PHOTO_CAPTION_LENGTH = 80;
const MAX_COMPETITION_NAME_LENGTH = 40;
const MIN_MEMBER_YEAR = 2000;
const MAX_MEMBER_YEAR = 2099;

class ValidationError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
  }
}

const normalizeName = (
  value,
  { code = "INVALID_NAME", label = "姓名", maxLength = MAX_NAME_LENGTH } = {},
) => {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  const length = Array.from(name).length;

  if (length < 1 || length > maxLength) {
    throw new ValidationError(code, `${label}需为 1-${maxLength} 个字符。`);
  }

  if (/[\u0000-\u001f\u007f]/u.test(name) || /https?:\/\//iu.test(name)) {
    throw new ValidationError(code, `${label}包含不支持的内容。`);
  }

  return name;
};

const normalizeRealName = (value) =>
  normalizeName(value, { code: "INVALID_REAL_NAME", label: "真实姓名" });

const normalizeDisplayName = (value) =>
  normalizeName(value, { code: "INVALID_DISPLAY_NAME", label: "展示名称" });

const normalizeIdentityKey = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u200b-\u200d\ufeff]+/gu, "");

const normalizeMemberYear = (value, code, label) => {
  const raw = String(value || "")
    .trim()
    .replace(/\s+/g, "");

  if (!/^20\d{2}$/u.test(raw)) {
    throw new ValidationError(code, `${label}应填写四位数字，例如 2024。`);
  }

  const year = Number(raw);

  if (year < MIN_MEMBER_YEAR || year > MAX_MEMBER_YEAR) {
    throw new ValidationError(code, `${label}超出可用范围。`);
  }

  return String(year);
};

const normalizeEnrollmentYear = (value) =>
  normalizeMemberYear(value, "INVALID_ENROLLMENT_YEAR", "入学年份");

const normalizeJoinYear = (value) =>
  normalizeMemberYear(value, "INVALID_JOIN_YEAR", "入社年份");

const normalizeCompetitionYear = (value) => {
  const year = normalizeMemberYear(value, "INVALID_COMPETITION_YEAR", "首次参赛年份");

  if (Number(year) > new Date().getUTCFullYear()) {
    throw new ValidationError("INVALID_COMPETITION_YEAR", "首次参赛年份不能晚于今年。");
  }

  return year;
};

const normalizeCompetitionName = (value) => {
  const name = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  const length = Array.from(name).length;

  if (length < 2 || length > MAX_COMPETITION_NAME_LENGTH) {
    throw new ValidationError(
      "INVALID_COMPETITION_NAME",
      `比赛名称或备注需为 2-${MAX_COMPETITION_NAME_LENGTH} 个字符。`,
    );
  }

  if (/[\u0000-\u001f\u007f]/u.test(name) || /https?:\/\//iu.test(name)) {
    throw new ValidationError("INVALID_COMPETITION_NAME", "比赛名称或备注包含不支持的内容。");
  }

  return name;
};

const hasValidSignature = (buffer, mime) => {
  if (mime === "image/jpeg") {
    return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mime === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => buffer[index] === byte);
  }

  if (mime === "image/webp") {
    return (
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP"
    );
  }

  return false;
};

const parseImageDataUrl = (value, { maxBytes, code, label }) => {
  const dataUrl = String(value || "");
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([a-z0-9+/]+={0,2})$/iu);

  if (!match) {
    throw new ValidationError(code, `${label}格式不正确。`);
  }

  const mime = match[1].toLowerCase();
  const buffer = Buffer.from(match[2], "base64");

  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new ValidationError(code, `${label}压缩后不能超过 ${Math.round(maxBytes / 1024)} KB。`);
  }

  if (!hasValidSignature(buffer, mime)) {
    throw new ValidationError(code, `${label}内容与文件格式不匹配。`);
  }

  const extensionByMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
  };

  return {
    buffer,
    mime,
    extension: extensionByMime[mime],
  };
};

const parseAvatarDataUrl = (value) =>
  parseImageDataUrl(value, {
    maxBytes: MAX_AVATAR_BYTES,
    code: "INVALID_AVATAR",
    label: "头像",
  });

const parseGalleryPhotoDataUrl = (value) =>
  parseImageDataUrl(value, {
    maxBytes: MAX_GALLERY_PHOTO_BYTES,
    code: "INVALID_GALLERY_PHOTO",
    label: "照片",
  });

const normalizePhotoCaption = (value) => {
  const caption = String(value || "")
    .trim()
    .replace(/\s+/g, " ");
  const length = Array.from(caption).length;

  if (length < 1 || length > MAX_PHOTO_CAPTION_LENGTH) {
    throw new ValidationError(
      "INVALID_PHOTO_CAPTION",
      `照片说明需为 1-${MAX_PHOTO_CAPTION_LENGTH} 个字符。`,
    );
  }

  if (/[\u0000-\u001f\u007f]/u.test(caption) || /https?:\/\//iu.test(caption)) {
    throw new ValidationError("INVALID_PHOTO_CAPTION", "照片说明包含不支持的内容。");
  }

  return caption;
};

const normalizePhotoDate = (value) => {
  const date = String(value || "").trim();
  const match = date.match(/^(\d{4})-(\d{2})-(\d{2})$/u);

  if (!match) {
    throw new ValidationError("INVALID_PHOTO_DATE", "请选择正确的拍摄日期。");
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new ValidationError("INVALID_PHOTO_DATE", "请选择正确的拍摄日期。");
  }

  return date;
};

const validatePhotoSubmission = (payload = {}) => {
  if (payload.consent !== true) {
    throw new ValidationError("CONSENT_REQUIRED", "请同意将照片展示在公开图库中。");
  }

  return {
    caption: normalizePhotoCaption(payload.caption),
    creditName: normalizeDisplayName(payload.creditName),
    photoDate: normalizePhotoDate(payload.photoDate),
    image: parseGalleryPhotoDataUrl(payload.image),
  };
};

const validateDebutSubmission = (payload = {}) => {
  if (payload.consent !== true) {
    throw new ValidationError(
      "CONSENT_REQUIRED",
      "请确认该记录真实，并同意审核通过后展示首次比赛与入队年份。",
    );
  }

  return {
    realName: normalizeRealName(payload.realName),
    displayName: normalizeDisplayName(payload.displayName),
    competitionYear: normalizeCompetitionYear(payload.competitionYear),
    competitionName: normalizeCompetitionName(payload.competitionName),
  };
};

const validateSubmission = (payload = {}) => {
  if (payload.consent !== true) {
    throw new ValidationError(
      "CONSENT_REQUIRED",
      "请同意在公开名册中展示昵称、入学年份、入社年份和头像。",
    );
  }

  const enrollmentYear = normalizeEnrollmentYear(payload.enrollmentYear);
  const joinYear = normalizeJoinYear(payload.joinYear);
  const realName = normalizeRealName(payload.realName);
  const displayName = normalizeDisplayName(payload.displayName);

  if (Number(joinYear) < Number(enrollmentYear)) {
    throw new ValidationError("INVALID_JOIN_YEAR", "入社年份不能早于入学年份。");
  }

  if (normalizeIdentityKey(realName) === normalizeIdentityKey(displayName)) {
    throw new ValidationError(
      "DUPLICATE_MEMBER_NAMES",
      "真实姓名与展示昵称不能填写为相同内容。",
    );
  }

  return {
    realName,
    displayName,
    enrollmentYear,
    joinYear,
    avatar: parseAvatarDataUrl(payload.avatar),
  };
};

module.exports = {
  MAX_AVATAR_BYTES,
  MAX_COMPETITION_NAME_LENGTH,
  MAX_GALLERY_PHOTO_BYTES,
  ValidationError,
  normalizeCompetitionName,
  normalizeCompetitionYear,
  normalizeDisplayName,
  normalizeEnrollmentYear,
  normalizeIdentityKey,
  normalizeJoinYear,
  normalizeName,
  normalizePhotoCaption,
  normalizePhotoDate,
  normalizeRealName,
  parseAvatarDataUrl,
  parseGalleryPhotoDataUrl,
  validateDebutSubmission,
  validatePhotoSubmission,
  validateSubmission,
};
