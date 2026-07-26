"use strict";

const crypto = require("node:crypto");
const cloudbase = require("@cloudbase/node-sdk");
const {
  ValidationError,
  normalizeIdentityKey,
  validateDebutSubmission,
  validatePhotoSubmission,
  validateSubmission,
} = require("./validation.cjs");

const app = cloudbase.init();
const db = app.database();

const COLLECTION_NAME = process.env.MEMBERS_COLLECTION || "members";
const PHOTOS_COLLECTION_NAME = process.env.PHOTOS_COLLECTION || "team_photos";
const DEBUTS_COLLECTION_NAME = process.env.DEBUTS_COLLECTION || "team_debuts";
const IDENTITY_CLAIMS_COLLECTION_NAME =
  process.env.IDENTITY_CLAIMS_COLLECTION || "member_identity_claims";
const ADMIN_UID = String(process.env.ADMIN_UID || "").trim();

const members = db.collection(COLLECTION_NAME);
const photos = db.collection(PHOTOS_COLLECTION_NAME);
const debuts = db.collection(DEBUTS_COLLECTION_NAME);
const identityClaims = db.collection(IDENTITY_CLAIMS_COLLECTION_NAME);

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

const ok = (data, requestId) => ({
  ok: true,
  data,
  requestId,
});

const fail = (code, message, requestId) => ({
  ok: false,
  error: { code, message },
  requestId,
});

const getRequestId = (context = {}) =>
  context.request_id || context.requestId || crypto.randomUUID();

const getIdentity = async (context) => {
  try {
    const authContext = await app.auth().getAuthContext(context);
    const uid = String(authContext?.uid || "").trim();

    if (!uid) {
      throw new Error("missing uid");
    }

    return {
      uid,
      loginType: String(authContext?.loginType || ""),
    };
  } catch {
    throw new ApiError("UNAUTHENTICATED", "登录状态无效，请刷新页面后重试。");
  }
};

const requireAdmin = (identity) => {
  if (!ADMIN_UID || ADMIN_UID === "your-admin-user-uid") {
    throw new ApiError("ADMIN_NOT_CONFIGURED", "管理员账号尚未完成云端配置。");
  }

  if (identity.uid !== ADMIN_UID) {
    throw new ApiError("FORBIDDEN", "当前账号没有审核权限。");
  }
};

const hashUid = (uid) =>
  crypto.createHash("sha256").update(uid).digest("hex").slice(0, 24);

const getSingleRecord = (result) =>
  Array.isArray(result?.data) ? result.data[0] : result?.data;

const getIdentityClaimId = (kind, key) =>
  crypto.createHash("sha256").update(`${kind}:${key}`).digest("hex").slice(0, 48);

const createCompetitionLabel = (year, name) => {
  const normalizedName = String(name || "").trim();
  const containsYear = new RegExp(`(?:${year}|${String(year).slice(-2)})\\s*年`, "u").test(
    normalizedName,
  );
  return containsYear ? normalizedName : `${year}年${normalizedName}`;
};

const toTimestamp = (value) => {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const listAllMemberIdentityRecords = async () => {
  const pageSize = 100;
  const records = [];

  for (let offset = 0; offset < 1000; offset += pageSize) {
    const result = await members
      .field({
        _id: true,
        realName: true,
        displayName: true,
        name: true,
      })
      .skip(offset)
      .limit(pageSize)
      .get();
    const page = Array.isArray(result?.data) ? result.data : [];
    records.push(...page);
    if (page.length < pageSize) break;
  }

  return records;
};

const throwDuplicateName = (kind) => {
  if (kind === "realName") {
    throw new ApiError(
      "DUPLICATE_REAL_NAME",
      "该真实姓名已经登记，请勿重复提交；如确有同名，请联系管理员。",
    );
  }

  throw new ApiError("DUPLICATE_DISPLAY_NAME", "该展示昵称已被使用，请换一个昵称。");
};

const assertMemberNamesAvailable = async (submission) => {
  const realNameKey = normalizeIdentityKey(submission.realName);
  const displayNameKey = normalizeIdentityKey(submission.displayName);
  const [realClaimResult, displayClaimResult] = await Promise.all([
    identityClaims.doc(getIdentityClaimId("realName", realNameKey)).get(),
    identityClaims.doc(getIdentityClaimId("displayName", displayNameKey)).get(),
  ]);

  if (getSingleRecord(realClaimResult)) throwDuplicateName("realName");
  if (getSingleRecord(displayClaimResult)) throwDuplicateName("displayName");

  const legacyRecords = await listAllMemberIdentityRecords();
  if (
    legacyRecords.some(
      (record) => normalizeIdentityKey(record.realName || "") === realNameKey,
    )
  ) {
    throwDuplicateName("realName");
  }
  if (
    legacyRecords.some(
      (record) =>
        normalizeIdentityKey(record.displayName || record.name || "") === displayNameKey,
    )
  ) {
    throwDuplicateName("displayName");
  }

  return { realNameKey, displayNameKey };
};

const assertIdentityClaimsAvailable = async (
  transaction,
  { realNameKey, displayNameKey },
) => {
  const claims = transaction.collection(IDENTITY_CLAIMS_COLLECTION_NAME);
  const realClaimResult = await claims
    .doc(getIdentityClaimId("realName", realNameKey))
    .get();
  const displayClaimResult = await claims
    .doc(getIdentityClaimId("displayName", displayNameKey))
    .get();

  if (getSingleRecord(realClaimResult)) throwDuplicateName("realName");
  if (getSingleRecord(displayClaimResult)) throwDuplicateName("displayName");
};

const addTemporaryFileUrls = async (records, fileIdField, outputField) => {
  const fileIds = Array.from(
    new Set(records.map((record) => record[fileIdField]).filter(Boolean)),
  );

  if (fileIds.length === 0) {
    return records.map((record) => ({ ...record, [outputField]: "" }));
  }

  let fileList = [];

  try {
    const result = await app.getTempFileURL({ fileList: fileIds });
    fileList = Array.isArray(result?.fileList) ? result.fileList : [];
  } catch (error) {
    console.error("getTempFileURL failed", {
      message: error?.message,
      fileCount: fileIds.length,
    });
  }

  const urlById = new Map(
    fileList.map((item) => [
      item.fileID || item.fileId,
      item.tempFileURL || item.download_url || "",
    ]),
  );

  return records.map((record) => ({
    ...record,
    [outputField]: urlById.get(record[fileIdField]) || "",
  }));
};

const addTemporaryAvatarUrls = (records) =>
  addTemporaryFileUrls(records, "avatarFileId", "photo");

const addTemporaryPhotoUrls = (records) =>
  addTemporaryFileUrls(records, "photoFileId", "image");

const getDisplayName = (record) => String(record.displayName || record.name || "").trim();

const serializePublicMember = (record) => {
  const displayName = getDisplayName(record);
  return {
    name: displayName,
    displayName,
    enrollmentYear: record.enrollmentYear,
    joinYear: record.joinYear,
    rosterGroup: record.teamJoinYear ? "black-ants" : "club-members",
    teamJoinYear: record.teamJoinYear || "",
    photo: record.photo || "",
  };
};

const serializeAdminMember = (record) => {
  const displayName = getDisplayName(record);
  return {
    id: record._id,
    name: displayName,
    displayName,
    realName: String(record.realName || "").trim(),
    enrollmentYear: record.enrollmentYear,
    joinYear: record.joinYear,
    rosterGroup: record.teamJoinYear ? "black-ants" : "club-members",
    teamJoinYear: record.teamJoinYear || "",
    firstCompetition: record.firstCompetition || "",
    photo: record.photo || "",
    status: record.status,
    createdAt: record.createdAt || null,
  };
};

const serializePublicPhoto = (record) => ({
  id: record._id,
  caption: record.caption,
  creditName: record.creditName,
  photoDate: record.photoDate,
  image: record.image || "",
});

const serializeAdminPhoto = (record) => ({
  ...serializePublicPhoto(record),
  status: record.status,
  createdAt: record.createdAt || null,
});

const serializeAdminDebut = (record) => ({
  id: record._id,
  memberId: record.memberId,
  realName: record.realName,
  displayName: record.displayName,
  enrollmentYear: record.enrollmentYear,
  joinYear: record.joinYear,
  competitionYear: record.competitionYear,
  competitionName: record.competitionName,
  competitionLabel: record.competitionLabel,
  submitterMatchesMember: record.submitterMatchesMember === true,
  photo: record.photo || "",
  status: record.status,
  createdAt: record.createdAt || null,
  approvedAt: record.approvedAt || null,
});

const getMemberById = async (memberId) => {
  const id = String(memberId || "").trim();

  if (!/^[a-zA-Z0-9_-]{8,64}$/u.test(id)) {
    throw new ApiError("INVALID_MEMBER_ID", "成员记录编号无效。");
  }

  const result = await members.doc(id).get();
  const record = getSingleRecord(result);

  if (!record) {
    throw new ApiError("MEMBER_NOT_FOUND", "未找到该成员记录。");
  }

  return record;
};

const getPhotoById = async (photoId) => {
  const id = String(photoId || "").trim();

  if (!/^[a-zA-Z0-9_-]{8,64}$/u.test(id)) {
    throw new ApiError("INVALID_PHOTO_ID", "照片记录编号无效。");
  }

  const result = await photos.doc(id).get();
  const record = getSingleRecord(result);

  if (!record) {
    throw new ApiError("PHOTO_NOT_FOUND", "未找到该照片记录。");
  }

  return record;
};

const getDebutById = async (debutId) => {
  const id = String(debutId || "").trim();

  if (!/^[a-zA-Z0-9_-]{8,64}$/u.test(id)) {
    throw new ApiError("INVALID_DEBUT_ID", "首次比赛记录编号无效。");
  }

  const result = await debuts.doc(id).get();
  const record = getSingleRecord(result);

  if (!record) {
    throw new ApiError("DEBUT_NOT_FOUND", "未找到该首次比赛记录。");
  }

  return record;
};

const listApprovedMembers = async () => {
  const result = await members.where({ status: "approved" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => toTimestamp(b.approvedAt) - toTimestamp(a.approvedAt));
  const withUrls = await addTemporaryAvatarUrls(records);
  return withUrls.map(serializePublicMember);
};

const submitMember = async (payload, identity) => {
  if (String(payload?.website || "").trim()) {
    return { submitted: true, pendingReview: true };
  }

  let submission;

  try {
    submission = validateSubmission(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ApiError(error.code, error.message);
    }
    throw error;
  }

  const identityKeys = await assertMemberNamesAvailable(submission);
  const now = new Date();
  const memberId = crypto.randomUUID();
  const cloudPath = [
    "member-avatars",
    hashUid(identity.uid),
    `${now.getTime()}-${crypto.randomUUID()}.${submission.avatar.extension}`,
  ].join("/");

  let uploadedFileId = "";

  try {
    const uploaded = await app.uploadFile({
      cloudPath,
      fileContent: submission.avatar.buffer,
    });
    uploadedFileId = uploaded?.fileID || uploaded?.fileId || "";

    if (!uploadedFileId) {
      throw new Error("CloudBase did not return a file ID");
    }

    await db.runTransaction(async (transaction) => {
      await assertIdentityClaimsAvailable(transaction, identityKeys);
      const transactionMembers = transaction.collection(COLLECTION_NAME);
      const transactionClaims = transaction.collection(IDENTITY_CLAIMS_COLLECTION_NAME);

      await transactionMembers.doc(memberId).set({
        name: submission.displayName,
        displayName: submission.displayName,
        realName: submission.realName,
        realNameKey: identityKeys.realNameKey,
        displayNameKey: identityKeys.displayNameKey,
        enrollmentYear: submission.enrollmentYear,
        joinYear: submission.joinYear,
        avatarFileId: uploadedFileId,
        avatarMime: submission.avatar.mime,
        status: "pending",
        submitterUid: identity.uid,
        submitterLoginType: identity.loginType,
        consentAt: now,
        createdAt: now,
        updatedAt: now,
      });
      await transactionClaims
        .doc(getIdentityClaimId("realName", identityKeys.realNameKey))
        .set({
          kind: "realName",
          key: identityKeys.realNameKey,
          memberId,
          createdAt: now,
        });
      await transactionClaims
        .doc(getIdentityClaimId("displayName", identityKeys.displayNameKey))
        .set({
          kind: "displayName",
          key: identityKeys.displayNameKey,
          memberId,
          createdAt: now,
        });
    });

    return {
      submitted: true,
      pendingReview: true,
      id: memberId,
    };
  } catch (error) {
    if (uploadedFileId) {
      try {
        await app.deleteFile({ fileList: [uploadedFileId] });
      } catch (cleanupError) {
        console.error("orphan avatar cleanup failed", {
          message: cleanupError?.message,
          fileID: uploadedFileId,
        });
      }
    }
    throw error;
  }
};

const submitPhoto = async (payload, identity) => {
  if (String(payload?.website || "").trim()) {
    return { submitted: true, pendingReview: true };
  }

  let submission;

  try {
    submission = validatePhotoSubmission(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ApiError(error.code, error.message);
    }
    throw error;
  }

  const now = new Date();
  const cloudPath = [
    "gallery-photos",
    hashUid(identity.uid),
    `${now.getTime()}-${crypto.randomUUID()}.${submission.image.extension}`,
  ].join("/");
  let uploadedFileId = "";

  try {
    const uploaded = await app.uploadFile({
      cloudPath,
      fileContent: submission.image.buffer,
    });
    uploadedFileId = uploaded?.fileID || uploaded?.fileId || "";

    if (!uploadedFileId) {
      throw new Error("CloudBase did not return a file ID");
    }

    const created = await photos.add({
      caption: submission.caption,
      creditName: submission.creditName,
      photoDate: submission.photoDate,
      photoFileId: uploadedFileId,
      photoMime: submission.image.mime,
      status: "pending",
      submitterUid: identity.uid,
      submitterLoginType: identity.loginType,
      consentAt: now,
      createdAt: now,
      updatedAt: now,
    });

    return {
      submitted: true,
      pendingReview: true,
      id: created?.id || "",
    };
  } catch (error) {
    if (uploadedFileId) {
      try {
        await app.deleteFile({ fileList: [uploadedFileId] });
      } catch (cleanupError) {
        console.error("orphan gallery photo cleanup failed", {
          message: cleanupError?.message,
          fileID: uploadedFileId,
        });
      }
    }
    throw error;
  }
};

const findApprovedMemberByIdentity = async (realName, displayName) => {
  const realNameKey = normalizeIdentityKey(realName);
  const displayNameKey = normalizeIdentityKey(displayName);
  const pageSize = 100;

  for (let offset = 0; offset < 1000; offset += pageSize) {
    const result = await members
      .where({ status: "approved" })
      .skip(offset)
      .limit(pageSize)
      .get();
    const page = Array.isArray(result?.data) ? result.data : [];
    const matched = page.find(
      (record) =>
        normalizeIdentityKey(record.realName || "") === realNameKey &&
        normalizeIdentityKey(record.displayName || record.name || "") === displayNameKey,
    );

    if (matched) return matched;
    if (page.length < pageSize) break;
  }

  return null;
};

const submitDebut = async (payload, identity) => {
  if (String(payload?.website || "").trim()) {
    return { submitted: true, pendingReview: true };
  }

  let submission;

  try {
    submission = validateDebutSubmission(payload);
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new ApiError(error.code, error.message);
    }
    throw error;
  }

  const matchedMember = await findApprovedMemberByIdentity(
    submission.realName,
    submission.displayName,
  );

  if (!matchedMember) {
    throw new ApiError(
      "MEMBER_NOT_FOUND_FOR_DEBUT",
      "未找到姓名与昵称同时匹配的公开成员，请核对填写或先完成成员登记。",
    );
  }

  if (matchedMember.teamJoinYear) {
    throw new ApiError(
      "ALREADY_TEAM_MEMBER",
      `你已记录为 ${matchedMember.teamJoinYear} 年加入黑蚁飞盘队，无需重复提交。`,
    );
  }

  if (
    matchedMember.joinYear &&
    Number(submission.competitionYear) < Number(matchedMember.joinYear)
  ) {
    throw new ApiError(
      "INVALID_COMPETITION_YEAR",
      "首次代表社团参赛年份不能早于入社年份。",
    );
  }

  const now = new Date();
  const debutId = matchedMember._id;
  const competitionLabel = createCompetitionLabel(
    submission.competitionYear,
    submission.competitionName,
  );

  await db.runTransaction(async (transaction) => {
    const transactionMembers = transaction.collection(COLLECTION_NAME);
    const transactionDebuts = transaction.collection(DEBUTS_COLLECTION_NAME);
    const memberResult = await transactionMembers.doc(matchedMember._id).get();
    const existingDebutResult = await transactionDebuts.doc(debutId).get();
    const currentMember = getSingleRecord(memberResult);
    const existingDebut = getSingleRecord(existingDebutResult);

    if (!currentMember || currentMember.status !== "approved") {
      throw new ApiError(
        "MEMBER_NOT_FOUND_FOR_DEBUT",
        "该成员当前不在公开名册中，请先联系管理员。",
      );
    }
    if (currentMember.teamJoinYear) {
      throw new ApiError(
        "ALREADY_TEAM_MEMBER",
        `你已记录为 ${currentMember.teamJoinYear} 年加入黑蚁飞盘队，无需重复提交。`,
      );
    }
    if (existingDebut) {
      throw new ApiError(
        "DEBUT_ALREADY_SUBMITTED",
        "首次比赛记录已经提交，请等待管理员审核。",
      );
    }

    await transactionDebuts.doc(debutId).set({
      memberId: currentMember._id,
      realName: String(currentMember.realName || "").trim(),
      displayName: getDisplayName(currentMember),
      enrollmentYear: currentMember.enrollmentYear,
      joinYear: currentMember.joinYear,
      avatarFileId: currentMember.avatarFileId || "",
      competitionYear: submission.competitionYear,
      competitionName: submission.competitionName,
      competitionLabel,
      status: "pending",
      submitterUid: identity.uid,
      submitterLoginType: identity.loginType,
      submitterMatchesMember:
        Boolean(currentMember.submitterUid) && currentMember.submitterUid === identity.uid,
      consentAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  return {
    submitted: true,
    pendingReview: true,
    id: debutId,
  };
};

const listApprovedPhotos = async () => {
  const result = await photos.where({ status: "approved" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => {
    const dateOrder = String(b.photoDate || "").localeCompare(String(a.photoDate || ""));
    return dateOrder || toTimestamp(b.approvedAt) - toTimestamp(a.approvedAt);
  });
  const withUrls = await addTemporaryPhotoUrls(records);
  return withUrls.map(serializePublicPhoto);
};

const listPendingMembers = async () => {
  const result = await members.where({ status: "pending" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  const withUrls = await addTemporaryAvatarUrls(records);
  return withUrls.map(serializeAdminMember);
};

const listApprovedMembersForAdmin = async () => {
  const result = await members.where({ status: "approved" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => toTimestamp(b.approvedAt) - toTimestamp(a.approvedAt));
  const withUrls = await addTemporaryAvatarUrls(records);
  return withUrls.map(serializeAdminMember);
};

const listPendingPhotos = async () => {
  const result = await photos.where({ status: "pending" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => toTimestamp(b.createdAt) - toTimestamp(a.createdAt));
  const withUrls = await addTemporaryPhotoUrls(records);
  return withUrls.map(serializeAdminPhoto);
};

const listApprovedPhotosForAdmin = async () => {
  const result = await photos.where({ status: "approved" }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  records.sort((a, b) => toTimestamp(b.approvedAt) - toTimestamp(a.approvedAt));
  const withUrls = await addTemporaryPhotoUrls(records);
  return withUrls.map(serializeAdminPhoto);
};

const listDebutsForAdmin = async (status) => {
  const result = await debuts.where({ status }).limit(100).get();
  const records = Array.isArray(result?.data) ? result.data : [];
  const timeField = status === "pending" ? "createdAt" : "approvedAt";
  records.sort((a, b) => toTimestamp(b[timeField]) - toTimestamp(a[timeField]));
  const withUrls = await addTemporaryAvatarUrls(records);
  return withUrls.map(serializeAdminDebut);
};

const listPendingDebuts = () => listDebutsForAdmin("pending");

const listApprovedDebutsForAdmin = () => listDebutsForAdmin("approved");

const approveMember = async (memberId, identity) => {
  const record = await getMemberById(memberId);

  if (record.status === "approved") {
    return { id: record._id, status: "approved" };
  }

  if (record.status !== "pending") {
    throw new ApiError("INVALID_MEMBER_STATUS", "该记录当前不能通过审核。");
  }

  const now = new Date();
  await members.doc(record._id).update({
    status: "approved",
    approvedAt: now,
    reviewedAt: now,
    reviewedBy: identity.uid,
    updatedAt: now,
  });

  return { id: record._id, status: "approved" };
};

const approvePhoto = async (photoId, identity) => {
  const record = await getPhotoById(photoId);

  if (record.status === "approved") {
    return { id: record._id, status: "approved" };
  }

  if (record.status !== "pending") {
    throw new ApiError("INVALID_PHOTO_STATUS", "该照片当前不能通过审核。");
  }

  const now = new Date();
  await photos.doc(record._id).update({
    status: "approved",
    approvedAt: now,
    reviewedAt: now,
    reviewedBy: identity.uid,
    updatedAt: now,
  });

  return { id: record._id, status: "approved" };
};

const approveDebut = async (debutId, identity) => {
  const record = await getDebutById(debutId);

  if (record.status === "approved") {
    return { id: record._id, memberId: record.memberId, status: "approved" };
  }
  if (record.status !== "pending") {
    throw new ApiError("INVALID_DEBUT_STATUS", "该首次比赛记录当前不能通过审核。");
  }

  const now = new Date();
  await db.runTransaction(async (transaction) => {
    const transactionMembers = transaction.collection(COLLECTION_NAME);
    const transactionDebuts = transaction.collection(DEBUTS_COLLECTION_NAME);
    const debutResult = await transactionDebuts.doc(record._id).get();
    const currentDebut = getSingleRecord(debutResult);

    if (!currentDebut || currentDebut.status !== "pending") {
      throw new ApiError("INVALID_DEBUT_STATUS", "该首次比赛记录已被其他操作处理。");
    }

    const memberResult = await transactionMembers.doc(currentDebut.memberId).get();
    const currentMember = getSingleRecord(memberResult);

    if (!currentMember || currentMember.status !== "approved") {
      throw new ApiError("MEMBER_NOT_FOUND", "对应成员已不在公开名册中。");
    }
    if (currentMember.teamJoinYear) {
      throw new ApiError(
        "ALREADY_TEAM_MEMBER",
        `该成员已记录为 ${currentMember.teamJoinYear} 年加入黑蚁飞盘队。`,
      );
    }

    await transactionMembers.doc(currentMember._id).update({
      rosterGroup: "black-ants",
      teamJoinYear: currentDebut.competitionYear,
      firstCompetition: currentDebut.competitionLabel,
      firstCompetitionRecordId: currentDebut._id,
      teamPromotedAt: now,
      updatedAt: now,
    });
    await transactionDebuts.doc(currentDebut._id).update({
      status: "approved",
      approvedAt: now,
      reviewedAt: now,
      reviewedBy: identity.uid,
      updatedAt: now,
    });
  });

  return { id: record._id, memberId: record.memberId, status: "approved" };
};

const removeMember = async (memberId) => {
  const record = await getMemberById(memberId);

  if (record.avatarFileId) {
    try {
      await app.deleteFile({ fileList: [record.avatarFileId] });
    } catch (error) {
      console.error("avatar delete failed", {
        message: error?.message,
        fileID: record.avatarFileId,
      });
    }
  }

  const realNameKey = record.realNameKey || normalizeIdentityKey(record.realName || "");
  const displayNameKey =
    record.displayNameKey || normalizeIdentityKey(record.displayName || record.name || "");

  await db.runTransaction(async (transaction) => {
    const transactionMembers = transaction.collection(COLLECTION_NAME);
    const transactionClaims = transaction.collection(IDENTITY_CLAIMS_COLLECTION_NAME);
    const transactionDebuts = transaction.collection(DEBUTS_COLLECTION_NAME);
    await transactionMembers.doc(record._id).remove();
    await transactionDebuts.doc(record._id).remove();
    if (realNameKey) {
      await transactionClaims
        .doc(getIdentityClaimId("realName", realNameKey))
        .remove();
    }
    if (displayNameKey) {
      await transactionClaims
        .doc(getIdentityClaimId("displayName", displayNameKey))
        .remove();
    }
  });
  return { id: record._id, removed: true };
};

const removePhoto = async (photoId) => {
  const record = await getPhotoById(photoId);

  if (record.photoFileId) {
    try {
      await app.deleteFile({ fileList: [record.photoFileId] });
    } catch (error) {
      console.error("gallery photo delete failed", {
        message: error?.message,
        fileID: record.photoFileId,
      });
    }
  }

  await photos.doc(record._id).remove();
  return { id: record._id, removed: true };
};

const removeDebut = async (debutId) => {
  const record = await getDebutById(debutId);

  await db.runTransaction(async (transaction) => {
    const transactionMembers = transaction.collection(COLLECTION_NAME);
    const transactionDebuts = transaction.collection(DEBUTS_COLLECTION_NAME);
    const debutResult = await transactionDebuts.doc(record._id).get();
    const currentDebut = getSingleRecord(debutResult);

    if (!currentDebut) {
      throw new ApiError("DEBUT_NOT_FOUND", "该首次比赛记录已被删除。");
    }

    if (currentDebut.status === "approved") {
      const memberResult = await transactionMembers.doc(currentDebut.memberId).get();
      const currentMember = getSingleRecord(memberResult);

      if (
        currentMember &&
        currentMember.firstCompetitionRecordId === currentDebut._id
      ) {
        await transactionMembers.doc(currentMember._id).update({
          rosterGroup: "club-members",
          teamJoinYear: "",
          firstCompetition: "",
          firstCompetitionRecordId: "",
          teamPromotedAt: "",
          updatedAt: new Date(),
        });
      }
    }

    await transactionDebuts.doc(currentDebut._id).remove();
  });

  return { id: record._id, memberId: record.memberId, removed: true };
};

const routeRequest = async (event, context) => {
  const action = String(event?.action || "");
  const payload = event?.payload && typeof event.payload === "object" ? event.payload : {};
  const identity = await getIdentity(context);

  switch (action) {
    case "listMembers":
      return listApprovedMembers();
    case "submitMember":
      return submitMember(payload, identity);
    case "listPhotos":
      return listApprovedPhotos();
    case "submitPhoto":
      return submitPhoto(payload, identity);
    case "submitDebut":
      return submitDebut(payload, identity);
    case "adminStatus":
      requireAdmin(identity);
      return { authorized: true };
    case "listPending":
      requireAdmin(identity);
      return listPendingMembers();
    case "listApprovedForAdmin":
      requireAdmin(identity);
      return listApprovedMembersForAdmin();
    case "listPendingPhotos":
      requireAdmin(identity);
      return listPendingPhotos();
    case "listApprovedPhotosForAdmin":
      requireAdmin(identity);
      return listApprovedPhotosForAdmin();
    case "listPendingDebuts":
      requireAdmin(identity);
      return listPendingDebuts();
    case "listApprovedDebutsForAdmin":
      requireAdmin(identity);
      return listApprovedDebutsForAdmin();
    case "approveMember":
      requireAdmin(identity);
      return approveMember(payload.memberId, identity);
    case "approvePhoto":
      requireAdmin(identity);
      return approvePhoto(payload.photoId, identity);
    case "approveDebut":
      requireAdmin(identity);
      return approveDebut(payload.debutId, identity);
    case "rejectMember":
    case "deleteMember":
      requireAdmin(identity);
      return removeMember(payload.memberId);
    case "rejectPhoto":
    case "deletePhoto":
      requireAdmin(identity);
      return removePhoto(payload.photoId);
    case "rejectDebut":
    case "deleteDebut":
      requireAdmin(identity);
      return removeDebut(payload.debutId);
    default:
      throw new ApiError("UNKNOWN_ACTION", "不支持的请求类型。");
  }
};

exports.main = async (event, context) => {
  const requestId = getRequestId(context);

  try {
    const data = await routeRequest(event, context);
    return ok(data, requestId);
  } catch (error) {
    if (error instanceof ApiError) {
      return fail(error.code, error.message, requestId);
    }

    console.error("member-api failed", {
      requestId,
      name: error?.name,
      message: error?.message,
      stack: error?.stack,
    });

    return fail("SERVICE_UNAVAILABLE", "名册服务暂时不可用，请稍后重试。", requestId);
  }
};
