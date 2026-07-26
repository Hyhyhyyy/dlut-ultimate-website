"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  MAX_AVATAR_BYTES,
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
  validateDebutSubmission,
  validatePhotoSubmission,
  validateSubmission,
} = require("../cloudfunctions/member-api/validation.cjs");

const jpegDataUrl = `data:image/jpeg;base64,${Buffer.from([
  0xff, 0xd8, 0xff, 0xd9,
]).toString("base64")}`;

test("姓名会去除首尾空白并合并连续空格", () => {
  assert.equal(normalizeName("  Black   Ants  "), "Black Ants");
});

test("姓名拒绝链接和超长内容", () => {
  assert.throws(() => normalizeName("https://example.com"), ValidationError);
  assert.throws(() => normalizeName("甲".repeat(21)), ValidationError);
});

test("真实姓名与公开展示名称分别校验", () => {
  assert.equal(normalizeRealName("  张 三  "), "张 三");
  assert.equal(normalizeDisplayName("  飞盘小蚂蚁  "), "飞盘小蚂蚁");
  assert.throws(() => normalizeRealName(""), ValidationError);
  assert.throws(() => normalizeDisplayName("https://example.com"), ValidationError);
});

test("姓名唯一键会统一大小写、全半角和空格", () => {
  assert.equal(normalizeIdentityKey("  Black　Ants "), "blackants");
  assert.equal(normalizeIdentityKey("ＢＬＡＣＫ ants"), "blackants");
});

test("入学与入社年份只接受四位数字", () => {
  assert.equal(normalizeEnrollmentYear(" 2024 "), "2024");
  assert.equal(normalizeJoinYear("2025"), "2025");
  assert.throws(() => normalizeEnrollmentYear("24级"), ValidationError);
  assert.throws(() => normalizeEnrollmentYear("大二"), ValidationError);
});

test("入社年份不能早于入学年份", () => {
  assert.throws(
    () =>
      validateSubmission({
        realName: "张三",
        displayName: "测试队员",
        enrollmentYear: "2025",
        joinYear: "2024",
        avatar: jpegDataUrl,
        consent: true,
      }),
    ValidationError,
  );
});

test("真实姓名与展示昵称不能填写为相同内容", () => {
  assert.throws(
    () =>
      validateSubmission({
        realName: "Black Ant",
        displayName: "ｂｌａｃｋ　ａｎｔ",
        enrollmentYear: "2024",
        joinYear: "2025",
        avatar: jpegDataUrl,
        consent: true,
      }),
    (error) => error instanceof ValidationError && error.code === "DUPLICATE_MEMBER_NAMES",
  );
});

test("头像 Data URL 校验 MIME、签名和体积", () => {
  const result = parseAvatarDataUrl(jpegDataUrl);
  assert.equal(result.mime, "image/jpeg");
  assert.equal(result.extension, "jpg");

  const invalid = `data:image/png;base64,${Buffer.from("not-png").toString("base64")}`;
  assert.throws(() => parseAvatarDataUrl(invalid), ValidationError);

  const oversized = Buffer.alloc(MAX_AVATAR_BYTES + 1, 0);
  oversized[0] = 0xff;
  oversized[1] = 0xd8;
  oversized[2] = 0xff;
  assert.throws(
    () => parseAvatarDataUrl(`data:image/jpeg;base64,${oversized.toString("base64")}`),
    ValidationError,
  );
});

test("成员提交必须包含公开展示同意项", () => {
  assert.throws(
    () =>
      validateSubmission({
        realName: "张三",
        displayName: "测试队员",
        enrollmentYear: "2024",
        joinYear: "2025",
        avatar: jpegDataUrl,
        consent: false,
      }),
    ValidationError,
  );

  const result = validateSubmission({
    realName: "张三",
    displayName: "测试队员",
    enrollmentYear: "2024",
    joinYear: "2025",
    avatar: jpegDataUrl,
    consent: true,
  });
  assert.equal(result.realName, "张三");
  assert.equal(result.displayName, "测试队员");
  assert.equal(result.enrollmentYear, "2024");
  assert.equal(result.joinYear, "2025");
});

test("图库照片会校验说明、日期、署名和公开同意", () => {
  assert.equal(normalizePhotoCaption("  第一次夜训  "), "第一次夜训");
  assert.equal(normalizePhotoDate("2026-07-26"), "2026-07-26");
  assert.throws(() => normalizePhotoDate("2026-02-30"), ValidationError);

  const result = validatePhotoSubmission({
    caption: "夏日训练合影",
    creditName: "飞盘小蚂蚁",
    photoDate: "2026-07-26",
    image: jpegDataUrl,
    consent: true,
  });

  assert.equal(result.caption, "夏日训练合影");
  assert.equal(result.creditName, "飞盘小蚂蚁");
  assert.equal(result.photoDate, "2026-07-26");
  assert.equal(result.image.mime, "image/jpeg");
  assert.throws(
    () => validatePhotoSubmission({ ...result, image: jpegDataUrl, consent: false }),
    ValidationError,
  );
});

test("首次比赛登记会校验身份、年份、比赛备注和公开同意", () => {
  const currentYear = String(new Date().getUTCFullYear());
  assert.equal(normalizeCompetitionYear(currentYear), currentYear);
  assert.equal(normalizeCompetitionName("  校 HAT 赛  "), "校 HAT 赛");
  assert.throws(() => normalizeCompetitionYear("2099"), ValidationError);
  assert.throws(() => normalizeCompetitionName("赛"), ValidationError);

  const result = validateDebutSubmission({
    realName: "张三",
    displayName: "小蚂蚁",
    competitionYear: currentYear,
    competitionName: `${currentYear}年新生赛`,
    consent: true,
  });

  assert.equal(result.realName, "张三");
  assert.equal(result.displayName, "小蚂蚁");
  assert.equal(result.competitionYear, currentYear);
  assert.equal(result.competitionName, `${currentYear}年新生赛`);
  assert.throws(
    () => validateDebutSubmission({ ...result, consent: false }),
    ValidationError,
  );
});
