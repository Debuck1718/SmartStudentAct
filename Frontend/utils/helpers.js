export const redirectPaths = {
  web: {
    global_overseer: "/global_overseer.html",
    overseer: "/overseer.html",
    admin: "/admins.html",
    teacher: "/teachers.html",
    student: "/students.html",
    payment: "/payment.html",
    resetPassword: "/reset-password.html",
    login: "/login.html",
    contact: "/contact.html",
  },
  app: {
    global_overseer: "/global_overseer",
    overseer: "/overseer",
    admin: "/admin",
    teacher: "/(app)/(teachers-tabs)/teachers",
    student: "/(app)/(students-tabs)/students",
    payment: "/payment",
    resetPassword: "/reset-password",
    login: "/login",
    contact: "/contact",
  },
};

export function isAppRequest(req) {
  const ua = req.headers["user-agent"]?.toLowerCase() || "";
  return (
    req.headers["x-client-type"] === "app" ||
    ua.includes("okhttp") ||
    ua.includes("expo")
  );
}

export function getRedirectUrl(user, hasAccess, req) {
  const { role } = user || {};
  const target = isAppRequest(req) ? redirectPaths.app : redirectPaths.web;
  const bypass = ["global_overseer", "overseer"];
  if (bypass.includes(role)) return target[role] || target.login;
  if (role && target[role]) return hasAccess ? target[role] : target.payment;
  return target.login;
}

export function getGenericRedirect(req, path = "login") {
  const target = isAppRequest(req) ? redirectPaths.app : redirectPaths.web;
  return target[path] || target.login;
}
