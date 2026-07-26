import cloudbase from "@cloudbase/js-sdk";

const envId = String(import.meta.env.VITE_CLOUDBASE_ENV_ID || "").trim();
const accessKey = String(import.meta.env.VITE_CLOUDBASE_ACCESS_KEY || "").trim();
const functionName = String(import.meta.env.VITE_MEMBER_FUNCTION_NAME || "member-api").trim();

export const isCloudConfigured =
  Boolean(envId && accessKey) &&
  !envId.startsWith("your-") &&
  !accessKey.startsWith("your-");

export class CloudServiceError extends Error {
  constructor(code, message, requestId = "") {
    super(message);
    this.name = "CloudServiceError";
    this.code = code;
    this.requestId = requestId;
  }
}

let app;
let auth;
let anonymousSessionPromise;

const requireCloudApp = () => {
  if (!isCloudConfigured) {
    throw new CloudServiceError(
      "CLOUD_NOT_CONFIGURED",
      "云端名册尚未配置，请联系网站管理员。",
    );
  }

  if (!app) {
    app = cloudbase.init({
      env: envId,
      accessKey,
      region: "ap-shanghai",
      timeout: 15000,
    });
    auth = app.auth({ persistence: "local" });
  }

  return app;
};

const requireAuth = () => {
  requireCloudApp();
  return auth;
};

const throwAuthError = (response, fallbackMessage) => {
  if (response?.error) {
    throw new CloudServiceError(
      response.error.code || "AUTH_FAILED",
      response.error.message || fallbackMessage,
    );
  }
};

export const getCurrentUser = async () => {
  const authClient = requireAuth();
  return authClient.getCurrentUser();
};

export const ensureAnonymousSession = async () => {
  const authClient = requireAuth();
  const currentUser = await authClient.getCurrentUser();

  if (currentUser) return currentUser;

  if (!anonymousSessionPromise) {
    anonymousSessionPromise = (async () => {
      const response = await authClient.signInAnonymously();
      throwAuthError(response, "访客身份初始化失败，请刷新页面重试。");
      return response?.data?.user || authClient.getCurrentUser();
    })().finally(() => {
      anonymousSessionPromise = undefined;
    });
  }

  return anonymousSessionPromise;
};

export const signInAdmin = async (username, password) => {
  const authClient = requireAuth();
  const response = await authClient.signInWithPassword({
    username,
    password,
  });
  throwAuthError(response, "管理员登录失败。");
  return response?.data?.user || authClient.getCurrentUser();
};

export const signOut = async () => {
  if (!isCloudConfigured) return;
  const authClient = requireAuth();
  await authClient.signOut();
};

const parseFunctionResult = (response) => {
  if (response?.error) {
    throw new CloudServiceError(
      response.error.code || "FUNCTION_CALL_FAILED",
      response.error.message || "云端请求失败。",
    );
  }

  let result = response?.result ?? response?.data?.result ?? response?.data;

  if (typeof result === "string") {
    try {
      result = JSON.parse(result);
    } catch {
      throw new CloudServiceError("INVALID_RESPONSE", "云端返回了无法识别的数据。");
    }
  }

  if (!result || typeof result !== "object") {
    throw new CloudServiceError("INVALID_RESPONSE", "云端返回内容为空。");
  }

  if (result.ok !== true) {
    throw new CloudServiceError(
      result.error?.code || "REQUEST_FAILED",
      result.error?.message || "请求未能完成。",
      result.requestId || "",
    );
  }

  return result.data;
};

export const callMemberApi = async (action, payload = {}) => {
  const cloudApp = requireCloudApp();

  try {
    const response = await cloudApp.callFunction({
      name: functionName,
      data: { action, payload },
      parse: true,
    });
    return parseFunctionResult(response);
  } catch (error) {
    if (error instanceof CloudServiceError) throw error;

    throw new CloudServiceError(
      error?.code || "NETWORK_ERROR",
      error?.message || "网络连接失败，请稍后重试。",
    );
  }
};
