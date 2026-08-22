import {
  callMemberApi,
  ensureAnonymousSession,
  isCloudConfigured,
} from "./cloudbase.js";
import { glossaryCategories, glossaryEntries } from "./glossary-data.js";

(() => {
  "use strict";

  const slideLabels = [
    "WELCOME",
    "OUR TEAM",
    "6 RULES",
    "WATCH",
    "GALLERY",
    "ROSTER",
    "JOIN US",
  ];
  const slides = Array.from(document.querySelectorAll(".slide"));
  const navButtons = Array.from(document.querySelectorAll(".chapter-nav [data-go]"));
  const goButtons = Array.from(document.querySelectorAll("[data-go]"));
  const nextTriggers = Array.from(document.querySelectorAll("[data-next]"));
  const prevButton = document.querySelector("#prev-button");
  const nextButton = document.querySelector("#next-button");
  const passTransition = document.querySelector("#pass-transition");
  const headerCurrent = document.querySelector("#header-current");
  const headerProgress = document.querySelector(".status-line i");
  const footerProgress = document.querySelector("#footer-progress");
  const footerLabel = document.querySelector("#footer-label");
  const toast = document.querySelector("#toast");
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const glossaryDialog = document.querySelector("#glossary-dialog");
  const glossaryOpen = document.querySelector("#glossary-open");
  const glossaryClose = document.querySelector("#glossary-close");
  const glossarySearch = document.querySelector("#glossary-search");
  const glossaryFilters = document.querySelector("#glossary-filters");
  const glossaryList = document.querySelector("#glossary-list");
  const glossaryResultCount = document.querySelector("#glossary-result-count");
  const glossaryEmpty = document.querySelector("#glossary-empty");

  let currentSlide = 0;
  let isTransitioning = false;
  let transitionTimer = 0;
  let toastTimer = 0;

  const clampSlide = (index) => {
    if (index < 0) return slides.length - 1;
    if (index >= slides.length) return 0;
    return index;
  };

  const updateInterface = (index) => {
    currentSlide = clampSlide(index);

    slides.forEach((slide, slideIndex) => {
      const active = slideIndex === currentSlide;
      slide.classList.toggle("is-active", active);
      slide.setAttribute("aria-hidden", String(!active));
    });

    navButtons.forEach((button) => {
      button.classList.toggle("is-current", Number(button.dataset.go) === currentSlide);
      if (Number(button.dataset.go) === currentSlide) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    const pageNumber = String(currentSlide + 1).padStart(2, "0");
    const progress = (currentSlide + 1) / slides.length;
    headerCurrent.textContent = pageNumber;
    headerProgress.style.transform = `scaleX(${progress})`;
    footerProgress.style.transform = `scaleX(${progress})`;
    footerLabel.textContent = slideLabels[currentSlide];
    nextButton.querySelector("span").textContent = currentSlide === slides.length - 1 ? "重新开盘" : "下一传";
    prevButton.querySelector("span").textContent = currentSlide === 0 ? "回到得分" : "上一传";
    document.body.classList.toggle("final-mode", currentSlide === slides.length - 1);
    document.title = `${slideLabels[currentSlide]}｜大工开发区极限飞盘协会`;
  };

  const finishTransition = () => {
    window.clearTimeout(transitionTimer);
    passTransition.classList.remove("is-flying", "is-scoring");
    isTransitioning = false;
  };

  const goToSlide = (targetIndex) => {
    const target = clampSlide(Number(targetIndex));
    if (isTransitioning || target === currentSlide) return;

    if (reducedMotion.matches) {
      updateInterface(target);
      return;
    }

    isTransitioning = true;
    const isScore = target === slides.length - 1 && currentSlide !== slides.length - 1;

    passTransition.classList.remove("is-flying", "is-scoring");
    void passTransition.offsetWidth;
    passTransition.classList.toggle("is-scoring", isScore);
    passTransition.classList.add("is-flying");

    window.setTimeout(() => updateInterface(target), 520);
    transitionTimer = window.setTimeout(finishTransition, 1160);
  };

  goButtons.forEach((button) => {
    button.addEventListener("click", () => goToSlide(button.dataset.go));
  });

  nextTriggers.forEach((button) => {
    button.addEventListener("click", () => goToSlide(currentSlide + 1));
  });

  prevButton.addEventListener("click", () => goToSlide(currentSlide - 1));
  nextButton.addEventListener("click", () => goToSlide(currentSlide + 1));

  document.addEventListener("keydown", (event) => {
    const tagName = document.activeElement?.tagName;
    const isEditing =
      tagName === "INPUT" ||
      tagName === "TEXTAREA" ||
      tagName === "SELECT" ||
      document.activeElement?.isContentEditable;

    if (glossaryDialog.open && event.key === "/" && !isEditing) {
      event.preventDefault();
      glossarySearch.focus();
      return;
    }

    if (glossaryDialog.open) return;
    if (isEditing) return;

    if (event.key === "ArrowRight" || event.key === "PageDown") {
      event.preventDefault();
      goToSlide(currentSlide + 1);
    }

    if (event.key === "ArrowLeft" || event.key === "PageUp") {
      event.preventDefault();
      goToSlide(currentSlide - 1);
    }
  });

  const glossaryCategoryLabels = new Map(
    glossaryCategories.map((category) => [category.id, category.label]),
  );
  let activeGlossaryCategory = "all";

  const normalizeGlossaryText = (value) =>
    String(value || "")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s·/()-]+/g, "");

  const createGlossaryCard = (entry) => {
    const card = document.createElement("article");
    const heading = document.createElement("header");
    const category = document.createElement("span");
    const term = document.createElement("code");
    const title = document.createElement("h3");
    const meaning = document.createElement("p");
    const tip = document.createElement("footer");
    const tipLabel = document.createElement("b");
    const tipText = document.createElement("span");

    card.className = `glossary-card glossary-card--${entry.category}`;
    heading.className = "glossary-card-heading";
    category.textContent = glossaryCategoryLabels.get(entry.category);
    term.textContent = entry.term;
    title.textContent = entry.zh;
    meaning.textContent = entry.meaning;
    tipLabel.textContent = entry.category === "signals" ? "动作要点" : "实战提示";
    tipText.textContent = entry.tip;

    heading.append(category, term);
    tip.append(tipLabel, tipText);
    card.append(heading, title, meaning, tip);
    return card;
  };

  const renderGlossary = () => {
    const query = normalizeGlossaryText(glossarySearch.value);
    const results = glossaryEntries.filter((entry) => {
      if (activeGlossaryCategory !== "all" && entry.category !== activeGlossaryCategory) {
        return false;
      }

      if (!query) return true;
      const searchable = normalizeGlossaryText(
        `${entry.term} ${entry.zh} ${entry.meaning} ${entry.tip}`,
      );
      return searchable.includes(query);
    });

    glossaryList.replaceChildren(...results.map(createGlossaryCard));
    glossaryResultCount.textContent = `找到 ${results.length} 条速查内容`;
    glossaryEmpty.hidden = results.length > 0;
  };

  glossaryCategories.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.category = category.id;
    button.textContent = category.label;
    button.setAttribute("aria-pressed", String(category.id === activeGlossaryCategory));
    button.addEventListener("click", () => {
      activeGlossaryCategory = category.id;
      Array.from(glossaryFilters.children).forEach((filter) => {
        filter.setAttribute(
          "aria-pressed",
          String(filter.dataset.category === activeGlossaryCategory),
        );
      });
      renderGlossary();
    });
    glossaryFilters.append(button);
  });

  glossarySearch.addEventListener("input", renderGlossary);
  glossaryOpen.addEventListener("click", () => {
    renderGlossary();
    glossaryDialog.showModal();
    document.body.classList.add("has-open-dialog");
  });
  glossaryClose.addEventListener("click", () => glossaryDialog.close());
  glossaryDialog.addEventListener("click", (event) => {
    if (event.target === glossaryDialog) glossaryDialog.close();
  });
  glossaryDialog.addEventListener("close", () => {
    document.body.classList.remove("has-open-dialog");
    glossaryOpen.focus({ preventScroll: true });
  });

  let touchStartPoint = null;
  const touchNavigationBlockers =
    "form, input, textarea, select, button, label, a, [contenteditable='true']";

  document.querySelector(".slide-deck").addEventListener(
    "touchstart",
    (event) => {
      if (event.target.closest(touchNavigationBlockers)) {
        touchStartPoint = null;
        return;
      }

      const touch = event.changedTouches[0];
      touchStartPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
    },
    { passive: true },
  );

  document.querySelector(".slide-deck").addEventListener(
    "touchend",
    (event) => {
      if (!touchStartPoint) return;

      const touch = event.changedTouches[0];
      const distanceX = (touch?.clientX ?? touchStartPoint.x) - touchStartPoint.x;
      const distanceY = (touch?.clientY ?? touchStartPoint.y) - touchStartPoint.y;
      touchStartPoint = null;

      if (Math.abs(distanceX) < 70 || Math.abs(distanceX) <= Math.abs(distanceY)) return;
      goToSlide(currentSlide + (distanceX < 0 ? 1 : -1));
    },
    { passive: true },
  );

  const showToast = (message) => {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2800);
  };

  const qrStage = document.querySelector("#qr-stage");
  const qrImage = document.querySelector("#qr-image");
  const showQr = () => qrStage.classList.add("has-qr");
  const hideQr = () => qrStage.classList.remove("has-qr");

  qrImage.addEventListener("load", showQr);
  qrImage.addEventListener("error", hideQr);

  if (qrImage.complete && qrImage.naturalWidth > 0) showQr();

  const photoGallery = document.querySelector("#photo-gallery");
  const galleryPhotoCount = document.querySelector("#gallery-photo-count");
  let galleryPhotos = [];

  const formatGalleryDate = (value) => {
    const parts = String(value || "").split("-");
    return parts.length === 3 ? `${parts[0]}.${parts[1]}.${parts[2]}` : "日期待补充";
  };

  const createGalleryPhotoCard = (photo) => {
    const card = document.createElement("article");
    const imageWrap = document.createElement("div");
    const image = document.createElement("img");
    const downloadBtn = document.createElement("button");
    const copy = document.createElement("div");
    const caption = document.createElement("strong");
    const meta = document.createElement("span");

    card.className = "gallery-photo-card";
    imageWrap.className = "gallery-photo-image-wrap";
    downloadBtn.type = "button";
    downloadBtn.className = "gallery-photo-download";
    downloadBtn.setAttribute("aria-label", "下载这张照片");
    downloadBtn.title = "下载原图";
    downloadBtn.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></svg>`;
    image.src = photo.image;
    image.alt = photo.caption;
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    imageWrap.append(image, downloadBtn);

    const downloadPhoto = async () => {
      if (!photo.image) return;
      try {
        const response = await fetch(photo.image);
        const blob = await response.blob();
        const extension =
          photo.image.startsWith("data:image/png") ? "png" :
          photo.image.startsWith("data:image/webp") ? "webp" : "jpg";
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const datePart = String(photo.photoDate || "").replace(/-/g, "") || "photo";
        a.download = `black-ants-${datePart}-${photo._id || "photo"}.${extension}`;
        document.body.append(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch {
        showToast("下载失败，请稍后重试。");
      }
    };

    downloadBtn.addEventListener("click", downloadPhoto);
    caption.textContent = photo.caption;
    meta.textContent = `${formatGalleryDate(photo.photoDate)} · ${photo.creditName}`;
    copy.append(caption, meta);
    card.append(imageWrap, copy);
    return card;
  };

  const renderGalleryMessage = (message, retry = false) => {
    const state = document.createElement("div");
    const copy = document.createElement("p");
    state.className = "gallery-message";
    copy.textContent = message;
    state.append(copy);

    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "重新加载";
      button.addEventListener("click", () => loadPhotos());
      state.append(button);
    }

    photoGallery.replaceChildren(state);
  };

  const renderPhotos = () => {
    photoGallery.replaceChildren(...galleryPhotos.map(createGalleryPhotoCard));
    galleryPhotoCount.textContent = String(galleryPhotos.length).padStart(2, "0");

    if (galleryPhotos.length === 0) {
      renderGalleryMessage("图库正在等待第一张队伍日常，欢迎你来记录这一刻。");
    }
  };

  const loadPhotos = async () => {
    photoGallery.setAttribute("aria-busy", "true");
    renderGalleryMessage("正在连接云端图库…");

    if (!isCloudConfigured) {
      galleryPhotos = [];
      galleryPhotoCount.textContent = "00";
      renderGalleryMessage("云端图库尚未配置，完成部署后照片会在这里展示。");
      photoGallery.setAttribute("aria-busy", "false");
      return;
    }

    try {
      await ensureAnonymousSession();
      const result = await callMemberApi("listPhotos");
      galleryPhotos = Array.isArray(result) ? result.filter((photo) => photo.image) : [];
      renderPhotos();
    } catch (error) {
      galleryPhotos = [];
      galleryPhotoCount.textContent = "00";
      renderGalleryMessage(error.message || "图库加载失败，请稍后重试。", true);
    } finally {
      photoGallery.setAttribute("aria-busy", "false");
    }
  };

  const memberForm = document.querySelector("#member-form");
  const memberList = document.querySelector("#member-list");
  const memberCount = document.querySelector("#member-count");
  const photoInput = memberForm.elements.photo;
  const fileName = document.querySelector("#file-name");
  const formSubmit = memberForm.querySelector(".form-submit");
  const formSubmitLabel = formSubmit.querySelector("span");
  const formStatus = document.querySelector("#member-form-status");
  let pendingPhoto = "";
  let isReadingPhoto = false;
  let isSubmittingMember = false;
  let members = [];

  const setFormStatus = (message, type = "") => {
    formStatus.textContent = message;
    formStatus.classList.toggle("is-success", type === "success");
    formStatus.classList.toggle("is-error", type === "error");
  };

  const setSubmitState = (isSubmitting) => {
    isSubmittingMember = isSubmitting;
    formSubmit.disabled = isSubmitting || !isCloudConfigured;
    formSubmitLabel.textContent = isSubmitting ? "正在提交…" : "加入队员名册";
  };

  const createInitial = (name) => {
    const initial = document.createElement("span");
    initial.textContent = String(name || "").trim().slice(0, 1) || "U";
    return initial;
  };

  const createMemberCard = (member) => {
    const card = document.createElement("article");
    const photo = document.createElement("div");
    const copy = document.createElement("div");
    const name = document.createElement("strong");
    const detail = document.createElement("span");
    const displayName = member.displayName || member.name || "新队友";
    const isTeamMember = member.rosterGroup === "black-ants" && member.teamJoinYear;

    card.className = `member-card${isTeamMember ? " is-team-member" : ""}`;
    photo.className = "member-card-photo";
    copy.className = "member-card-copy";
    name.textContent = displayName;
    detail.textContent = isTeamMember
      ? `${member.teamJoinYear}年入队 · 入社 ${member.joinYear}届`
      : member.joinYear
        ? `入学 ${member.enrollmentYear}届 · 入社 ${member.joinYear}届`
        : `入学 ${member.enrollmentYear}届`;

    if (member.photo) {
      const image = document.createElement("img");
      image.src = member.photo;
      image.alt = `${displayName}的队员头像`;
      image.loading = "lazy";
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

    if (isTeamMember) {
      const badge = document.createElement("small");
      const competition = document.createElement("span");
      badge.className = "team-member-badge";
      badge.textContent = "BLACK ANTS";
      competition.className = "team-member-competition";
      competition.textContent = "首次正式比赛已确认";
      copy.append(badge, name, detail, competition);
    } else {
      copy.append(name, detail);
    }
    card.append(photo, copy);
    return card;
  };

  const createRosterGroupHeader = (title, subtitle, count, teamGroup = false) => {
    const header = document.createElement("div");
    const copy = document.createElement("div");
    const heading = document.createElement("strong");
    const description = document.createElement("span");
    const total = document.createElement("b");

    header.className = `roster-group-heading${teamGroup ? " is-team-group" : ""}`;
    heading.textContent = title;
    description.textContent = subtitle;
    total.textContent = String(count).padStart(2, "0");
    copy.append(heading, description);
    header.append(copy, total);
    return header;
  };

  const createRosterGroupEmpty = (message) => {
    const empty = document.createElement("p");
    empty.className = "roster-group-empty";
    empty.textContent = message;
    return empty;
  };

  const createTeamGroupNote = () => {
    const note = document.createElement("p");
    note.className = "roster-team-note";
    note.textContent =
      "代表社团参加过正式比赛，即视为加入开发区校区黑蚁飞盘队；队员将拥有更多比赛机会与精美队服。";
    return note;
  };

  const renderRosterMessage = (message, retry = false) => {
    const state = document.createElement("div");
    const copy = document.createElement("p");
    state.className = "roster-message";
    copy.textContent = message;
    state.append(copy);

    if (retry) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = "重新加载";
      button.addEventListener("click", () => loadMembers());
      state.append(button);
    }

    memberList.replaceChildren(state);
  };

  const renderMembers = () => {
    const teamMembers = members.filter(
      (member) => member.rosterGroup === "black-ants" && member.teamJoinYear,
    );
    const clubMembers = members.filter(
      (member) => member.rosterGroup !== "black-ants" || !member.teamJoinYear,
    );
    const content = [
      createRosterGroupHeader(
        "黑蚁飞盘队",
        "首次代表社团参加正式比赛的队员",
        teamMembers.length,
        true,
      ),
      createTeamGroupNote(),
      ...(teamMembers.length
        ? teamMembers.map(createMemberCard)
        : [createRosterGroupEmpty("完成首次正式比赛登记后，队员会来到这里。")]),
      createRosterGroupHeader(
        "社团成员",
        "一起训练、持续成长中的队友",
        clubMembers.length,
      ),
      ...(clubMembers.length
        ? clubMembers.map(createMemberCard)
        : [createRosterGroupEmpty("所有公开成员都已进入黑蚁飞盘队。")]),
    ];

    memberList.replaceChildren(...content);
    memberCount.textContent = String(members.length).padStart(2, "0");

    if (members.length === 0) {
      renderRosterMessage("新队友正在陆续加入，期待在这里看到你的名字。");
    }
  };

  const loadMembers = async () => {
    memberList.setAttribute("aria-busy", "true");
    renderRosterMessage("正在连接云端名册…");

    if (!isCloudConfigured) {
      members = [];
      memberCount.textContent = "00";
      renderRosterMessage("云端环境尚未配置，完成部署设置后名册将在这里显示。");
      setFormStatus("云端名册尚未配置，当前无法提交资料。", "error");
      setSubmitState(false);
      memberList.setAttribute("aria-busy", "false");
      return;
    }

    try {
      await ensureAnonymousSession();
      const result = await callMemberApi("listMembers");
      members = Array.isArray(result) ? result : [];
      renderMembers();
    } catch (error) {
      members = [];
      memberCount.textContent = "00";
      renderRosterMessage(error.message || "名册加载失败，请稍后重试。", true);
    } finally {
      memberList.setAttribute("aria-busy", "false");
    }
  };

  const canvasToDataUrl = (canvas, quality) =>
    new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("encode"));
            return;
          }

          const reader = new FileReader();
          reader.onerror = () => reject(new Error("read"));
          reader.onload = () => resolve({ dataUrl: String(reader.result), size: blob.size });
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
        reject(new Error("image"));
      };
      image.onload = async () => {
        URL.revokeObjectURL(objectUrl);

        try {
          const cropSize = Math.min(image.naturalWidth, image.naturalHeight);
          const outputSize = Math.min(512, cropSize);
          const sourceX = Math.max(0, (image.naturalWidth - cropSize) / 2);
          const sourceY = Math.max(0, (image.naturalHeight - cropSize) / 2);
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context || outputSize < 1) throw new Error("canvas");

          canvas.width = outputSize;
          canvas.height = outputSize;
          context.drawImage(
            image,
            sourceX,
            sourceY,
            cropSize,
            cropSize,
            0,
            0,
            outputSize,
            outputSize,
          );

          let optimized = await canvasToDataUrl(canvas, 0.82);
          if (optimized.size > 500 * 1024) {
            optimized = await canvasToDataUrl(canvas, 0.68);
          }
          if (optimized.size > 500 * 1024) throw new Error("size");
          resolve(optimized.dataUrl);
        } catch (error) {
          reject(error);
        }
      };
      image.src = objectUrl;
    });

  photoInput.addEventListener("change", async () => {
    const file = photoInput.files?.[0];
    pendingPhoto = "";

    if (!file) {
      fileName.textContent = "选择一张头像";
      return;
    }

    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    if (!acceptedTypes.includes(file.type)) {
      photoInput.value = "";
      fileName.textContent = "选择一张头像";
      showToast("仅支持 JPG、PNG 或 WEBP 图片。");
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      photoInput.value = "";
      fileName.textContent = "选择一张头像";
      showToast("头像原图超过 2 MB，请压缩后重新选择。");
      return;
    }

    fileName.textContent = "正在处理头像…";
    isReadingPhoto = true;

    try {
      pendingPhoto = await optimizePhoto(file);
      fileName.textContent = file.name;
    } catch {
      photoInput.value = "";
      fileName.textContent = "选择一张头像";
      showToast("头像处理失败，请换一张图片重试。");
    } finally {
      isReadingPhoto = false;
    }
  });

  const normalizeYear = (value) => {
    const raw = String(value || "").trim().replace(/\s+/g, "");
    if (!/^20\d{2}$/.test(raw)) return "";
    const year = Number(raw);
    return year >= 2000 && year <= 2099 ? String(year) : "";
  };

  const normalizeMemberIdentity = (value) =>
    String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("zh-CN")
      .replace(/[\s\u200b-\u200d\ufeff]+/gu, "");

  memberForm
    .querySelectorAll('input[name="enrollmentYear"], input[name="joinYear"]')
    .forEach((input) => {
      input.addEventListener("input", () => {
        input.value = input.value.replace(/\D/g, "").slice(0, 4);
      });
    });

  memberForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (isSubmittingMember) return;

    if (!isCloudConfigured) {
      setFormStatus("云端名册尚未配置，当前无法提交资料。", "error");
      return;
    }

    if (isReadingPhoto) {
      showToast("头像仍在处理中，请稍等后再提交。");
      return;
    }

    const formData = new FormData(memberForm);
    const realName = String(formData.get("realName") || "").trim();
    const displayName = String(formData.get("displayName") || "").trim();
    const enrollmentYear = normalizeYear(formData.get("enrollmentYear"));
    const joinYear = normalizeYear(formData.get("joinYear"));

    if (!realName || !displayName || !enrollmentYear || !joinYear) {
      showToast("请填写真实姓名、展示名称和两个四位年份。");
      return;
    }

    if (normalizeMemberIdentity(realName) === normalizeMemberIdentity(displayName)) {
      showToast("真实姓名与展示昵称不能填写为相同内容。");
      return;
    }

    if (Number(joinYear) < Number(enrollmentYear)) {
      showToast("入社年份不能早于入学年份。");
      return;
    }

    if (!pendingPhoto) {
      showToast("请选择一张头像。");
      return;
    }

    setSubmitState(true);
    setFormStatus("正在安全上传资料…");

    try {
      await ensureAnonymousSession();
      await callMemberApi("submitMember", {
        realName,
        displayName,
        enrollmentYear,
        joinYear,
        avatar: pendingPhoto,
        consent: formData.get("consent") === "on",
        website: String(formData.get("website") || ""),
      });
      memberForm.reset();
      pendingPhoto = "";
      fileName.textContent = "选择一张头像";
      setFormStatus("收到啦！审核通过后，你的名字会出现在队员名册中。", "success");
      showToast(`欢迎你，${displayName}！资料已送达。`);
    } catch (error) {
      setFormStatus(error.message || "提交失败，请稍后重试。", "error");
    } finally {
      setSubmitState(false);
    }
  });

  if (isCloudConfigured) {
    setFormStatus("提交后会由管理员确认，再加入公开名册。");
  } else {
    setFormStatus("云端名册尚未配置，当前无法提交资料。", "error");
  }
  setSubmitState(false);
  loadMembers();
  loadPhotos();
  const requestedSlide = Number(new URLSearchParams(window.location.search).get("slide"));
  const initialSlide =
    Number.isInteger(requestedSlide) && requestedSlide >= 0 && requestedSlide < slides.length
      ? requestedSlide
      : 0;
  updateInterface(initialSlide);
})();
