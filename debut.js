import {
  callMemberApi,
  ensureAnonymousSession,
  isCloudConfigured,
} from "./cloudbase.js";

const debutForm = document.querySelector("#debut-form");
const competitionYearInput = debutForm.elements.competitionYear;
const submitButton = document.querySelector("#debut-submit");
const submitLabel = submitButton.querySelector("span");
const formStatus = document.querySelector("#debut-form-status");

let isSubmitting = false;

const setStatus = (message, type = "") => {
  formStatus.textContent = message;
  formStatus.classList.toggle("is-success", type === "success");
  formStatus.classList.toggle("is-error", type === "error");
};

const setSubmitState = (busy) => {
  isSubmitting = busy;
  submitButton.disabled = busy || !isCloudConfigured;
  submitLabel.textContent = busy ? "正在提交…" : "提交管理员确认";
};

const normalizeIdentity = (value) =>
  String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\u200b-\u200d\ufeff]+/gu, "");

const currentYear = new Date().getFullYear();
competitionYearInput.setAttribute("max", String(currentYear));
competitionYearInput.addEventListener("input", () => {
  competitionYearInput.value = competitionYearInput.value.replace(/\D/g, "").slice(0, 4);
});

debutForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  if (!isCloudConfigured) {
    setStatus("云端服务尚未配置，暂时无法提交记录。", "error");
    return;
  }

  const formData = new FormData(debutForm);
  const realName = String(formData.get("realName") || "").trim();
  const displayName = String(formData.get("displayName") || "").trim();
  const competitionYear = String(formData.get("competitionYear") || "").trim();
  const competitionName = String(formData.get("competitionName") || "").trim();

  if (!/^20\d{2}$/u.test(competitionYear) || Number(competitionYear) > currentYear) {
    setStatus("请填写不晚于今年的四位首次参赛年份。", "error");
    return;
  }

  if (normalizeIdentity(realName) === normalizeIdentity(displayName)) {
    setStatus("真实姓名与展示昵称不能填写为相同内容。", "error");
    return;
  }

  setSubmitState(true);
  setStatus("正在匹配公开名册并提交记录…");

  try {
    await ensureAnonymousSession();
    await callMemberApi("submitDebut", {
      realName,
      displayName,
      competitionYear,
      competitionName,
      consent: formData.get("consent") === "on",
      website: String(formData.get("website") || ""),
    });

    debutForm.reset();
    setStatus(
      "记录已送达！管理员确认后，你会进入“黑蚁飞盘队”分区并显示入队年份。",
      "success",
    );
  } catch (error) {
    setStatus(error.message || "提交失败，请稍后重试。", "error");
  } finally {
    setSubmitState(false);
  }
});

if (isCloudConfigured) {
  setStatus("姓名与昵称需同时匹配已审核成员；每位队员只需登记一次。");
} else {
  setStatus("云端服务尚未配置，暂时无法提交记录。", "error");
}
setSubmitState(false);
