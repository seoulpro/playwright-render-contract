const MAX_REPORT_URL_LENGTH = 2_048;

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function redactOpaqueCredentials(url: string): string {
  const value = url.split(/[?#]/u, 1)[0] ?? "";
  const authority = /^((?:[a-z][a-z\d+.-]*:)?\/\/)([^/]*)(.*)$/iu.exec(value);
  if (!authority) {
    return value;
  }
  const [, prefix = "", rawAuthority = "", suffix = ""] = authority;
  const userInfoEnd = rawAuthority.lastIndexOf("@");
  return userInfoEnd === -1
    ? value
    : `${prefix}${rawAuthority.slice(userInfoEnd + 1)}${suffix}`;
}

export function defaultReportUrlPolicy(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.username = "";
    parsed.password = "";
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return redactOpaqueCredentials(url);
  }
}

export function applyReportUrlPolicy(
  url: string,
  policy: (url: string) => string
): string {
  const redacted = policy(url);
  if (typeof redacted !== "string") {
    throw new TypeError("urlPolicy function must return a string");
  }
  return truncate(redacted, MAX_REPORT_URL_LENGTH);
}
