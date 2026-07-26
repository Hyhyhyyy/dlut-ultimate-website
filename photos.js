import {
  callMemberApi,
  ensureAnonymousSession,
  isCloudConfigured,
} from "./cloudbase.js";

const photoForm = document.querySelector("#photo-form");
const photoInput = document.querySelector("#gallery-photo-input");
const photoPreview = document.querySelector("#photo-preview");
const previewImage = document.querySelector("#photo-preview-image");
const fileName = document.querySelector("#photo-file-name");
const photoDateInput = photoForm.elements.photoDate;
const submitButton = document.querySelector("#photo-submit");
const submitLabel = submitButton.querySelector("span");
const formStatus = document.querySelector("#photo-form-status");

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1.8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];

let pendingImage = "";
let isProcessing = false;
let isSubmitting = false;

const today = new Date().toISOString().slice(0, 10);
photoDateInput.max = today;
photoDateInput.value = today;

const setStatus = (message, type = "") => {
  formStatus.textContent = message;
  formStatus.classList.toggle("is-success", type === "success");
  formStatus.classList.toggle("is-error", type === "error");
};

const setSubmitState = (busy) => {
  isSubmitting = busy;
  submitButton.disabled = busy || !isCloudConfigured;
  submitLabel.textContent = busy ? "正在提交…" : "提交照片审核";
};

const canvasToDataUrl = (canvas, quality) =>
  new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("照片压缩失败。"));
          return;
        }

        const reader = new FileReader();
        reader.onerror = () => reject(new Error("照片读取失败。"));
        reader.onload = () =>
          resolve({
            dataUrl: String(reader.result),
            size: blob.size,
          });
        reader.readAsDataURL(blob);
      },
      "image/jpeg",
      quality,
    );
  });

const optimizePhoto = (file) =>
  new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("无法读取这张照片，请换一张重试。"));
    };

    image.onload = async () => {
      URL.revokeObjectURL(objectUrl);

      try {
        const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
        const scale = Math.min(1, MAX_DIMENSION / longestSide);
        const width = Math.max(1, Math.round(image.naturalWidth * scale));
        const height = Math.max(1, Math.round(image.naturalHeight * scale));
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        if (!context) throw new Error("浏览器暂时无法处理照片。");

        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        let optimized = null;
        for (const quality of [0.86, 0.74, 0.62, 0.5]) {
          optimized = await canvasToDataUrl(canvas, quality);
          if (optimized.size <= MAX_OUTPUT_BYTES) break;
        }

        if (!optimized || optimized.size > MAX_OUTPUT_BYTES) {
          throw new Error("照片压缩后仍然较大，请换一张重试。");
        }

        resolve(optimized.dataUrl);
      } catch (error) {
        reject(error);
      }
    };

    image.src = objectUrl;
  });

const clearPreview = () => {
  pendingImage = "";
  previewImage.removeAttribute("src");
  photoPreview.hidden = true;
  fileName.textContent = "";
};

photoInput.addEventListener("change", async () => {
  const file = photoInput.files?.[0];
  clearPreview();

  if (!file) return;

  if (!acceptedTypes.includes(file.type)) {
    photoInput.value = "";
    setStatus("请选择 JPG、PNG 或 WEBP 格式的照片。", "error");
    return;
  }

  if (file.size > MAX_ORIGINAL_BYTES) {
    photoInput.value = "";
    setStatus("照片原图不能超过 10 MB。", "error");
    return;
  }

  isProcessing = true;
  setStatus("正在压缩照片，请稍候…");

  try {
    pendingImage = await optimizePhoto(file);
    previewImage.src = pendingImage;
    fileName.textContent = file.name;
    photoPreview.hidden = false;
    setStatus("照片准备完成，可以提交审核。", "success");
  } catch (error) {
    photoInput.value = "";
    clearPreview();
    setStatus(error.message || "照片处理失败，请换一张重试。", "error");
  } finally {
    isProcessing = false;
  }
});

photoForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (isSubmitting) return;

  if (!isCloudConfigured) {
    setStatus("云端图库尚未配置，暂时无法提交照片。", "error");
    return;
  }

  if (isProcessing) {
    setStatus("照片仍在处理中，请稍候。", "error");
    return;
  }

  if (!pendingImage) {
    setStatus("请先选择一张照片。", "error");
    return;
  }

  const formData = new FormData(photoForm);
  setSubmitState(true);
  setStatus("正在安全上传照片…");

  try {
    await ensureAnonymousSession();
    await callMemberApi("submitPhoto", {
      creditName: String(formData.get("creditName") || "").trim(),
      caption: String(formData.get("caption") || "").trim(),
      photoDate: String(formData.get("photoDate") || ""),
      image: pendingImage,
      consent: formData.get("consent") === "on",
      website: String(formData.get("website") || ""),
    });

    photoForm.reset();
    photoDateInput.value = today;
    clearPreview();
    setStatus("照片已送达！管理员审核通过后会出现在公开图库中。", "success");
  } catch (error) {
    setStatus(error.message || "照片提交失败，请稍后重试。", "error");
  } finally {
    setSubmitState(false);
  }
});

if (isCloudConfigured) {
  setStatus("照片提交后会由管理员确认，再加入公开图库。");
} else {
  setStatus("云端图库尚未配置，暂时无法提交照片。", "error");
}
setSubmitState(false);
