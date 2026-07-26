import {
  callMemberApi,
  getCurrentUser,
  isCloudConfigured,
  signInAdmin,
  signOut,
} from "./cloudbase.js";

const loginPanel = document.querySelector("#login-panel");
const reviewPanel = document.querySelector("#review-panel");
const loginForm = document.querySelector("#login-form");
const loginStatus = document.querySelector("#login-status");
const reviewStatus = document.querySelector("#review-status");
const reviewList = document.querySelector("#review-list");
const queueCount = document.querySelector("#queue-count");
const reviewTitle = document.querySelector("#review-title");
const refreshButton = document.querySelector("#refresh-button");
const logoutButton = document.querySelector("#logout-button");
const tabs = Array.from(document.querySelectorAll("[data-status]"));
const resourceTabs = Array.from(document.querySelectorAll("[data-resource]"));
const approvedStatusTab = document.querySelector("#approved-tab");

let activeStatus = "pending";
let activeResource = "members";
let queueRequest = 0;

const safelySignOut = async () => {
  try {
    await signOut();
  } catch {
    // 本地登录态仍会在下一次登录时被覆盖。
  }
};

const setStatus = (element, message, type = "") => {
  element.textContent = message;
  element.classList.toggle("is-error", type === "error");
  element.classList.toggle("is-success", type === "success");
};

const setLoginBusy = (busy) => {
  const button = loginForm.querySelector("button");
  button.disabled = busy || !isCloudConfigured;
  button.textContent = busy ? "正在验证…" : "安全登录";
};

const showLogin = () => {
  loginPanel.hidden = false;
  reviewPanel.hidden = true;
};

const showReview = () => {
  loginPanel.hidden = true;
  reviewPanel.hidden = false;
};

const createInitial = (name) => {
  const initial = document.createElement("span");
  initial.textContent = String(name || "").trim().slice(0, 1) || "U";
  return initial;
};

const getDisplayName = (member) => member.displayName || member.name || "未命名队员";

const getReviewName = (member) => {
  const displayName = getDisplayName(member);
  return member.realName ? `${member.realName}（展示：${displayName}）` : displayName;
};

const formatDate = (value) => {
  if (!value) return "时间未知";
  const source = value?.$date || value;
  const date = new Date(source);
  if (Number.isNaN(date.getTime())) return "时间未知";
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
};

const runMemberAction = async (member, action, card) => {
  const isDestructive = action === "rejectMember" || action === "deleteMember";
  if (
    isDestructive &&
    !window.confirm(
      action === "rejectMember"
        ? `确认拒绝 ${getReviewName(member)} 的申请并删除头像吗？`
        : `确认从公开名册删除 ${getReviewName(member)} 吗？`,
    )
  ) {
    return;
  }

  const buttons = Array.from(card.querySelectorAll("button"));
  buttons.forEach((button) => {
    button.disabled = true;
  });
  setStatus(reviewStatus, "正在处理成员记录…");

  try {
    await callMemberApi(action, { memberId: member.id });
    setStatus(
      reviewStatus,
      action === "approveMember"
        ? `${getDisplayName(member)} 已公开。`
        : `${getDisplayName(member)} 已移除。`,
      "success",
    );
    await loadQueue();
  } catch (error) {
    setStatus(reviewStatus, error.message || "操作失败，请稍后重试。", "error");
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const runPhotoAction = async (photo, action, card) => {
  const isDestructive = action === "rejectPhoto" || action === "deletePhoto";
  if (
    isDestructive &&
    !window.confirm(
      action === "rejectPhoto"
        ? `确认拒绝照片“${photo.caption}”并删除文件吗？`
        : `确认从公开图库删除照片“${photo.caption}”吗？`,
    )
  ) {
    return;
  }

  const buttons = Array.from(card.querySelectorAll("button"));
  buttons.forEach((button) => {
    button.disabled = true;
  });
  setStatus(reviewStatus, "正在处理照片记录…");

  try {
    await callMemberApi(action, { photoId: photo.id });
    setStatus(
      reviewStatus,
      action === "approvePhoto" ? "照片已加入公开图库。" : "照片已移除。",
      "success",
    );
    await loadQueue();
  } catch (error) {
    setStatus(reviewStatus, error.message || "操作失败，请稍后重试。", "error");
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const runDebutAction = async (debut, action, card) => {
  const isDestructive = action === "rejectDebut" || action === "deleteDebut";
  if (
    isDestructive &&
    !window.confirm(
      action === "rejectDebut"
        ? `确认拒绝 ${debut.displayName} 的首次比赛记录吗？`
        : `确认撤销 ${debut.displayName} 的黑蚁飞盘队入队记录吗？`,
    )
  ) {
    return;
  }

  const buttons = Array.from(card.querySelectorAll("button"));
  buttons.forEach((button) => {
    button.disabled = true;
  });
  setStatus(reviewStatus, "正在处理首次比赛记录…");

  try {
    await callMemberApi(action, { debutId: debut.id });
    setStatus(
      reviewStatus,
      action === "approveDebut"
        ? `${debut.displayName} 已进入“黑蚁飞盘队”分区。`
        : `${debut.displayName} 的首次比赛记录已移除。`,
      "success",
    );
    await loadQueue();
  } catch (error) {
    setStatus(reviewStatus, error.message || "操作失败，请稍后重试。", "error");
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
};

const createMemberReviewCard = (member) => {
  const card = document.createElement("article");
  const photo = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const time = document.createElement("time");
  const actions = document.createElement("div");
  const displayName = getDisplayName(member);
  const realName = member.realName || "未提供（旧记录）";

  card.className = "review-card";
  photo.className = "review-photo";
  copy.className = "review-copy";
  actions.className = "review-card-actions";
  title.textContent = displayName;
  const teamDetail = member.teamJoinYear
    ? ` · 黑蚁飞盘队 ${member.teamJoinYear}年入队`
    : "";
  detail.textContent = member.joinYear
    ? `真实姓名：${realName} · 入学 ${member.enrollmentYear}届 · 入社 ${member.joinYear}届${teamDetail}`
    : `真实姓名：${realName} · 入学 ${member.enrollmentYear}届${teamDetail}`;
  time.className = "review-time";
  time.textContent =
    activeStatus === "pending" ? `提交于 ${formatDate(member.createdAt)}` : "已在公开名册展示";

  if (member.photo) {
    const image = document.createElement("img");
    image.src = member.photo;
    image.alt = `${displayName}的头像`;
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => photo.replaceChildren(createInitial(displayName)),
      { once: true },
    );
    photo.append(image);
  } else {
    photo.append(createInitial(displayName));
  }

  if (activeStatus === "pending") {
    const approve = document.createElement("button");
    const reject = document.createElement("button");
    approve.type = "button";
    reject.type = "button";
    approve.className = "member-action approve";
    reject.className = "member-action reject";
    approve.textContent = "通过并公开";
    reject.textContent = "拒绝";
    approve.addEventListener("click", () => runMemberAction(member, "approveMember", card));
    reject.addEventListener("click", () => runMemberAction(member, "rejectMember", card));
    actions.append(approve, reject);
  } else {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "member-action delete";
    remove.textContent = "从公开名册删除";
    remove.addEventListener("click", () => runMemberAction(member, "deleteMember", card));
    actions.append(remove);
  }

  copy.append(title, detail, time);
  card.append(photo, copy, actions);
  return card;
};

const createPhotoReviewCard = (photoRecord) => {
  const card = document.createElement("article");
  const photo = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const time = document.createElement("time");
  const actions = document.createElement("div");

  card.className = "review-card is-photo";
  photo.className = "review-photo";
  copy.className = "review-copy";
  actions.className = "review-card-actions";
  title.textContent = photoRecord.caption;
  detail.textContent = `${photoRecord.photoDate} · 上传者：${photoRecord.creditName}`;
  time.className = "review-time";
  time.textContent =
    activeStatus === "pending"
      ? `提交于 ${formatDate(photoRecord.createdAt)}`
      : "已在公开图库展示";

  if (photoRecord.image) {
    const image = document.createElement("img");
    image.src = photoRecord.image;
    image.alt = photoRecord.caption;
    image.referrerPolicy = "no-referrer";
    photo.append(image);
  }

  if (activeStatus === "pending") {
    const approve = document.createElement("button");
    const reject = document.createElement("button");
    approve.type = "button";
    reject.type = "button";
    approve.className = "member-action approve";
    reject.className = "member-action reject";
    approve.textContent = "通过并公开";
    reject.textContent = "拒绝";
    approve.addEventListener("click", () =>
      runPhotoAction(photoRecord, "approvePhoto", card),
    );
    reject.addEventListener("click", () => runPhotoAction(photoRecord, "rejectPhoto", card));
    actions.append(approve, reject);
  } else {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "member-action delete";
    remove.textContent = "从公开图库删除";
    remove.addEventListener("click", () => runPhotoAction(photoRecord, "deletePhoto", card));
    actions.append(remove);
  }

  copy.append(title, detail, time);
  card.append(photo, copy, actions);
  return card;
};

const createDebutReviewCard = (debut) => {
  const card = document.createElement("article");
  const photo = document.createElement("div");
  const copy = document.createElement("div");
  const title = document.createElement("h2");
  const detail = document.createElement("p");
  const identityCheck = document.createElement("p");
  const time = document.createElement("time");
  const actions = document.createElement("div");

  card.className = "review-card is-debut";
  photo.className = "review-photo";
  copy.className = "review-copy";
  actions.className = "review-card-actions";
  title.textContent = `${debut.displayName} · ${debut.competitionLabel}`;
  detail.textContent =
    `真实姓名：${debut.realName} · 入学 ${debut.enrollmentYear}届 · ` +
    `入社 ${debut.joinYear}届 · 审核后记录 ${debut.competitionYear}年入队`;
  identityCheck.className = `debut-identity-check${
    debut.submitterMatchesMember ? " is-matched" : " is-unmatched"
  }`;
  identityCheck.textContent = debut.submitterMatchesMember
    ? "登记身份与成员申请时一致，仍请核实比赛信息。"
    : "登记身份与成员申请时不同，请向队员本人核实后再确认。";
  time.className = "review-time";
  time.textContent =
    activeStatus === "pending"
      ? `提交于 ${formatDate(debut.createdAt)}`
      : `已于 ${formatDate(debut.approvedAt)}进入黑蚁飞盘队分区`;

  if (debut.photo) {
    const image = document.createElement("img");
    image.src = debut.photo;
    image.alt = `${debut.displayName}的头像`;
    image.referrerPolicy = "no-referrer";
    image.addEventListener(
      "error",
      () => photo.replaceChildren(createInitial(debut.displayName)),
      { once: true },
    );
    photo.append(image);
  } else {
    photo.append(createInitial(debut.displayName));
  }

  if (activeStatus === "pending") {
    const approve = document.createElement("button");
    const reject = document.createElement("button");
    approve.type = "button";
    reject.type = "button";
    approve.className = "member-action approve";
    reject.className = "member-action reject";
    approve.textContent = "确认入队";
    reject.textContent = "拒绝";
    approve.addEventListener("click", () => runDebutAction(debut, "approveDebut", card));
    reject.addEventListener("click", () => runDebutAction(debut, "rejectDebut", card));
    actions.append(approve, reject);
  } else {
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "member-action delete";
    remove.textContent = "撤销入队记录";
    remove.addEventListener("click", () => runDebutAction(debut, "deleteDebut", card));
    actions.append(remove);
  }

  copy.append(title, detail, identityCheck, time);
  card.append(photo, copy, actions);
  return card;
};

const renderQueue = (records) => {
  queueCount.textContent = String(records.length);

  if (records.length === 0) {
    const empty = document.createElement("p");
    empty.className = "review-empty";
    if (activeResource === "photos") {
      empty.textContent =
        activeStatus === "pending" ? "当前没有待审核照片。" : "公开图库暂时为空。";
    } else if (activeResource === "debuts") {
      empty.textContent =
        activeStatus === "pending"
          ? "当前没有待审核的首次比赛记录。"
          : "还没有已确认的黑蚁飞盘队入队记录。";
    } else {
      empty.textContent =
        activeStatus === "pending" ? "当前没有待审核申请。" : "公开名册暂时为空。";
    }
    reviewList.replaceChildren(empty);
    return;
  }

  const createCard =
    activeResource === "photos"
      ? createPhotoReviewCard
      : activeResource === "debuts"
        ? createDebutReviewCard
        : createMemberReviewCard;
  reviewList.replaceChildren(...records.map(createCard));
};

async function loadQueue() {
  const requestId = ++queueRequest;
  reviewList.setAttribute("aria-busy", "true");
  refreshButton.disabled = true;
  setStatus(reviewStatus, "正在读取云端记录…");

  try {
    const actions = {
      members: {
        pending: "listPending",
        approved: "listApprovedForAdmin",
      },
      photos: {
        pending: "listPendingPhotos",
        approved: "listApprovedPhotosForAdmin",
      },
      debuts: {
        pending: "listPendingDebuts",
        approved: "listApprovedDebutsForAdmin",
      },
    };
    const action = actions[activeResource][activeStatus];
    const result = await callMemberApi(action);
    if (requestId !== queueRequest) return;
    const records = Array.isArray(result) ? result : [];
    renderQueue(records);
    setStatus(reviewStatus, records.length > 0 ? "数据已更新。" : "");
  } catch (error) {
    if (requestId !== queueRequest) return;
    renderQueue([]);
    setStatus(reviewStatus, error.message || "读取失败，请稍后重试。", "error");

    if (error.code === "FORBIDDEN" || error.code === "UNAUTHENTICATED") {
      await safelySignOut();
      showLogin();
      setStatus(loginStatus, "登录状态已失效，请重新登录。", "error");
    }
  } finally {
    if (requestId === queueRequest) {
      reviewList.setAttribute("aria-busy", "false");
      refreshButton.disabled = false;
    }
  }
}

const setActiveStatus = (status) => {
  activeStatus = status;
  tabs.forEach((tab) => {
    const active = tab.dataset.status === status;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  loadQueue();
};

const setActiveResource = (resource) => {
  activeResource = resource;
  const titles = {
    members: "成员名册",
    photos: "日常照片",
    debuts: "首次比赛",
  };
  reviewTitle.textContent = titles[resource];
  approvedStatusTab.textContent = resource === "debuts" ? "已入队" : "已公开";
  resourceTabs.forEach((tab) => {
    const active = tab.dataset.resource === resource;
    tab.classList.toggle("is-active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  setActiveStatus("pending");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const username = String(formData.get("username") || "").trim();
  const password = String(formData.get("password") || "");

  setLoginBusy(true);
  setStatus(loginStatus, "正在验证管理员身份…");

  try {
    await signInAdmin(username, password);
    await callMemberApi("adminStatus");
    loginForm.reset();
    showReview();
    await loadQueue();
  } catch (error) {
    await safelySignOut();
    setStatus(loginStatus, error.message || "登录失败，请检查用户名和密码。", "error");
  } finally {
    setLoginBusy(false);
  }
});

refreshButton.addEventListener("click", () => loadQueue());

logoutButton.addEventListener("click", async () => {
  await safelySignOut();
  showLogin();
  setStatus(loginStatus, "已安全退出。", "success");
});

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveStatus(tab.dataset.status));
});

resourceTabs.forEach((tab) => {
  tab.addEventListener("click", () => setActiveResource(tab.dataset.resource));
});

const initialize = async () => {
  if (!isCloudConfigured) {
    setLoginBusy(false);
    setStatus(loginStatus, "CloudBase 环境尚未配置，审核后台暂不可用。", "error");
    return;
  }

  setLoginBusy(false);

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return;
    await callMemberApi("adminStatus");
    showReview();
    await loadQueue();
  } catch {
    await safelySignOut();
    showLogin();
  }
};

initialize();
