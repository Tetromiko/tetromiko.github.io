import { useEffect, useMemo, useState } from "react";

const STORAGE_TOKEN_KEY = "github_pat";
const STORAGE_REPO_KEY = "github_repo";
const LEGACY_TOKEN_KEY = "portfolio_github_pat";
const LEGACY_REPO_KEY = "portfolio_github_repo";
const LOCAL_DATA_KEY = "portfolio_local_data";
const FILE_PATH = "public/portfolio-data.json";
const HELP_LINK = "https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token";
const SCHEMA_VERSION = 1;

function prettyJson(value) {
  return JSON.stringify(value, null, 2);
}

function toBase64Utf8(value) {
  return btoa(unescape(encodeURIComponent(value)));
}

function parseRepo(fullRepo) {
  const [owner, repo] = fullRepo.trim().split("/");
  if (!owner || !repo) return null;
  return { owner, repo };
}

function detectRepoFromUrl() {
  const host = window.location.hostname.toLowerCase();
  if (!host.endsWith(".github.io")) return "";

  const owner = host.replace(".github.io", "");
  const segments = window.location.pathname.split("/").filter(Boolean);
  const firstSegment = segments[0] || "";
  const isRootAdmin = firstSegment === "admin" || firstSegment === "";
  const repo = isRootAdmin ? `${owner}.github.io` : firstSegment;
  return `${owner}/${repo}`;
}

function detectRuntimeMode() {
  const host = window.location.hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
    return "self-host";
  }
  if (host.endsWith(".github.io")) {
    return "github-pages";
  }
  return "self-host";
}

function getVirtualPathname() {
  if (window.location.hash.startsWith("#/")) {
    return window.location.hash.slice(1);
  }

  const params = new URLSearchParams(window.location.search);
  const redirectedPath = params.get("p");
  if (redirectedPath) {
    return redirectedPath.startsWith("/") ? redirectedPath : `/${redirectedPath}`;
  }
  return window.location.pathname;
}

function normalizeAndValidatePortfolioData(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, message: "Portfolio data must be a JSON object." };
  }

  const next = { ...value };
  if (next.schemaVersion === undefined) {
    next.schemaVersion = SCHEMA_VERSION;
  }
  if (next.schemaVersion !== SCHEMA_VERSION) {
    return { ok: false, message: `Unsupported schemaVersion. Expected ${SCHEMA_VERSION}.` };
  }

  if (!next.profile || typeof next.profile !== "object") {
    return { ok: false, message: "Missing profile object." };
  }
  if (!next.contacts || typeof next.contacts !== "object") {
    return { ok: false, message: "Missing contacts object." };
  }

  const mustBeString = [
    ["profile.name", next.profile.name],
    ["profile.title", next.profile.title],
    ["profile.location", next.profile.location],
    ["profile.summary", next.profile.summary],
    ["contacts.email", next.contacts.email],
    ["contacts.linkedin", next.contacts.linkedin],
  ];

  for (const [field, fieldValue] of mustBeString) {
    if (typeof fieldValue !== "string" || fieldValue.trim() === "") {
      return { ok: false, message: `Field ${field} must be a non-empty string.` };
    }
  }

  return { ok: true, data: next };
}

async function validateRepoAccess(token, fullRepo) {
  const parsed = parseRepo(fullRepo);
  if (!parsed) {
    return { ok: false, message: "Repo format must be owner/repo." };
  }

  const repoUrl = `https://api.github.com/repos/${parsed.owner}/${parsed.repo}`;
  const res = await fetch(repoUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
    },
  });

  if (!res.ok) {
    if (res.status === 401) {
      return { ok: false, message: "Invalid token (401)." };
    }
    if (res.status === 403) {
      return { ok: false, message: "Token exists but does not have access (403)." };
    }
    if (res.status === 404) {
      return { ok: false, message: "Repository not found or no access (404)." };
    }

    return { ok: false, message: `GitHub check failed (${res.status}).` };
  }

  const repoData = await res.json();
  const canWrite = Boolean(repoData?.permissions?.push || repoData?.permissions?.admin || repoData?.permissions?.maintain);

  if (!canWrite) {
    return { ok: false, message: "Token is valid, but no write permission for this repository." };
  }

  return { ok: true };
}

export default function App() {
  const virtualPathname = getVirtualPathname();
  const pathSegments = virtualPathname.split("/").filter(Boolean);
  const isAdminRoute = pathSegments[pathSegments.length - 1] === "admin";
  const runtimeMode = detectRuntimeMode();
  const requiresPat = runtimeMode === "github-pages";
  const autoDetectedRepo = detectRepoFromUrl();
  const canonicalAdminUrl =
    runtimeMode === "github-pages"
      ? `${import.meta.env.BASE_URL}#/admin`
      : `${window.location.origin}/admin`;

  const [tokenInput, setTokenInput] = useState("");
  const [repoInput, setRepoInput] = useState("");
  const [savedToken, setSavedToken] = useState("");
  const [savedRepo, setSavedRepo] = useState("");
  const [data, setData] = useState(null);
  const [jsonDraft, setJsonDraft] = useState("");
  const [status, setStatus] = useState("booting");
  const [message, setMessage] = useState("");

  const isAuthenticated = Boolean(savedToken && savedRepo);
  const canSave = useMemo(() => (requiresPat ? isAuthenticated : true) && status !== "saving", [isAuthenticated, requiresPat, status]);

  useEffect(() => {
    async function bootstrap() {
      setStatus("loading");
      setMessage("");

      try {
        const res = await fetch(`${import.meta.env.BASE_URL}portfolio-data.json`);
        if (!res.ok) throw new Error(`Failed to load portfolio-data.json (${res.status})`);
        let json = await res.json();
        if (!requiresPat) {
          const localJsonRaw = localStorage.getItem(LOCAL_DATA_KEY);
          if (localJsonRaw) {
            try {
              json = JSON.parse(localJsonRaw);
            } catch {
              localStorage.removeItem(LOCAL_DATA_KEY);
            }
          }
        }
        const validated = normalizeAndValidatePortfolioData(json);
        if (!validated.ok) throw new Error(validated.message);
        setData(validated.data);
        setJsonDraft(prettyJson(validated.data));
      } catch (error) {
        setStatus("error");
        setMessage(error.message || "Failed to load public data.");
        return;
      }

      if (!isAdminRoute) {
        setStatus("idle");
        return;
      }

      if (!requiresPat) {
        setSavedToken("self-host-bypass");
        setSavedRepo("local/dev");
        setStatus("success");
        setMessage("Self-host mode: admin access is open without PAT.");
        return;
      }

      const storedToken = localStorage.getItem(STORAGE_TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || "";
      const persistedRepo = localStorage.getItem(STORAGE_REPO_KEY) || localStorage.getItem(LEGACY_REPO_KEY) || "";
      const storedRepo = persistedRepo || autoDetectedRepo;

      setTokenInput(storedToken);
      setRepoInput(storedRepo);

      if (!storedToken || !storedRepo) {
        setStatus("idle");
        return;
      }

      setStatus("auth-checking");
      const result = await validateRepoAccess(storedToken, storedRepo);

      if (!result.ok) {
        localStorage.removeItem(STORAGE_TOKEN_KEY);
        localStorage.removeItem(STORAGE_REPO_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
        localStorage.removeItem(LEGACY_REPO_KEY);

        setSavedToken("");
        setSavedRepo("");
        setStatus("error");
        setMessage(`${result.message} Please login again.`);
        return;
      }

      localStorage.setItem(STORAGE_TOKEN_KEY, storedToken);
      localStorage.setItem(STORAGE_REPO_KEY, storedRepo);
      setSavedToken(storedToken);
      setSavedRepo(storedRepo);
      setStatus("success");
      setMessage("Session restored. Admin dashboard unlocked.");
    }

    bootstrap();
  }, [autoDetectedRepo, isAdminRoute, requiresPat]);

  useEffect(() => {
    if (requiresPat) return;
    function onStorage(event) {
      if (event.key !== LOCAL_DATA_KEY || !event.newValue) return;
      try {
        const next = JSON.parse(event.newValue);
        setData(next);
        if (!isAdminRoute) return;
        setJsonDraft(prettyJson(next));
      } catch {
        // ignore malformed local data
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isAdminRoute, requiresPat]);

  async function handleLogin(event) {
    event.preventDefault();

    const token = tokenInput.trim();
    const repo = repoInput.trim();

    if (!token || !repo) {
      setStatus("error");
      setMessage("Paste PAT and repo in owner/repo format.");
      return;
    }

    setStatus("auth-checking");
    setMessage("Checking token and repository access...");

    try {
      const result = await validateRepoAccess(token, repo);
      if (!result.ok) {
        setStatus("error");
        setMessage("Invalid token or missing write access. " + result.message);
        return;
      }

      localStorage.setItem(STORAGE_TOKEN_KEY, token);
      localStorage.setItem(STORAGE_REPO_KEY, repo);
      localStorage.removeItem(LEGACY_TOKEN_KEY);
      localStorage.removeItem(LEGACY_REPO_KEY);

      setSavedToken(token);
      setSavedRepo(repo);
      setStatus("success");
      setMessage("Connected. Admin dashboard is ready.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Token validation failed.");
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_REPO_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
    localStorage.removeItem(LEGACY_REPO_KEY);

    setSavedToken("");
    setSavedRepo("");
    setTokenInput("");
    setRepoInput("");
    setStatus("idle");
    setMessage("Logged out. Local session cleared.");

    window.location.reload();
  }

  async function handleSaveToGitHub() {
    if (!canSave) return;

    let parsed;
    try {
      parsed = JSON.parse(jsonDraft);
    } catch {
      setStatus("error");
      setMessage("JSON is invalid. Fix syntax before saving.");
      return;
    }
    const validated = normalizeAndValidatePortfolioData(parsed);
    if (!validated.ok) {
      setStatus("error");
      setMessage(validated.message);
      return;
    }
    parsed = validated.data;

    if (!requiresPat) {
      const nextJsonString = prettyJson(parsed) + "\n";
      setData(parsed);
      setJsonDraft(nextJsonString);
      localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(parsed));
      setStatus("success");
      setMessage("Self-host mode: data updated locally (no GitHub write).");
      return;
    }

    const parsedRepo = parseRepo(savedRepo);
    if (!parsedRepo) {
      setStatus("error");
      setMessage("Repo must be in owner/repo format.");
      return;
    }

    setStatus("saving");
    setMessage("Saving changes to GitHub...");

    try {
      const apiUrl = `https://api.github.com/repos/${parsedRepo.owner}/${parsedRepo.repo}/contents/${FILE_PATH}`;

      const getRes = await fetch(apiUrl, {
        headers: {
          Authorization: `Bearer ${savedToken}`,
          Accept: "application/vnd.github+json",
        },
      });

      if (!getRes.ok) {
        const err = await getRes.json().catch(() => ({}));
        throw new Error(`SHA fetch failed (${getRes.status}): ${err.message || "Unknown error"}`);
      }

      const getData = await getRes.json();
      const sha = getData.sha;
      if (!sha) throw new Error("SHA not found in GitHub response.");

      const nextJsonString = prettyJson(parsed) + "\n";
      const contentBase64 = toBase64Utf8(nextJsonString);

      const putRes = await fetch(apiUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${savedToken}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: "chore: update portfolio-data.json from admin panel",
          content: contentBase64,
          sha,
        }),
      });

      if (!putRes.ok) {
        const err = await putRes.json().catch(() => ({}));
        throw new Error(`PUT failed (${putRes.status}): ${err.message || "Unknown error"}`);
      }

      setData(parsed);
      setJsonDraft(nextJsonString);
      setStatus("success");
      setMessage("Saved to GitHub successfully.");
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "Save failed");
    }
  }

  if (!isAdminRoute) {
    return (
      <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
        <div className="mx-auto max-w-4xl space-y-6">
          <header>
            <h1 className="text-2xl font-bold md:text-3xl">Open Jamstack Portfolio</h1>
            <p className="text-sm text-slate-400">Public profile view</p>
          </header>

          {status === "loading" && <p className="text-slate-300">Loading portfolio data...</p>}

          {message && status === "error" && (
            <p className="rounded-lg bg-red-500/20 p-3 text-sm text-red-200">{message}</p>
          )}

          {data && (
            <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
              <h2 className="text-xl font-semibold">Profile</h2>
              <p className="text-slate-300"><span className="font-medium">Name:</span> {data.profile?.name}</p>
              <p className="text-slate-300"><span className="font-medium">Title:</span> {data.profile?.title}</p>
              <p className="text-slate-300"><span className="font-medium">Location:</span> {data.profile?.location}</p>
              <p className="text-slate-300">{data.profile?.summary}</p>
              <a className="text-cyan-300 underline" href={data.contacts?.linkedin}>LinkedIn</a>
            </section>
          )}
        </div>
      </main>
    );
  }

  const showDashboard = requiresPat ? isAuthenticated : true;

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-2xl font-bold md:text-3xl">Admin</h1>
          <p className="text-sm text-slate-400">/admin mode: {runtimeMode}</p>
          {runtimeMode === "github-pages" && (
            <p className="text-xs text-slate-500">
              Canonical admin URL for Pages: <code>{canonicalAdminUrl}</code>
            </p>
          )}
        </header>

        {message && (
          <p className={`rounded-lg p-3 text-sm ${status === "error" ? "bg-red-500/20 text-red-200" : status === "success" ? "bg-emerald-500/20 text-emerald-200" : "bg-slate-800 text-slate-200"}`}>
            {message}
          </p>
        )}

        {!showDashboard && (
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h2 className="text-lg font-semibold">Connect Repository</h2>

            <form onSubmit={handleLogin} className="space-y-3">
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                type="password"
                placeholder="GitHub Personal Access Token"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                required
              />
              <input
                className="w-full rounded-lg border border-slate-700 bg-slate-950 p-3"
                type="text"
                placeholder="owner/repo"
                value={repoInput}
                onChange={(e) => setRepoInput(e.target.value)}
                required
              />
              {autoDetectedRepo && (
                <p className="text-xs text-slate-400">
                  Auto-detected repository: <code>{autoDetectedRepo}</code>
                </p>
              )}

              <button
                type="submit"
                disabled={status === "auth-checking"}
                className="rounded-lg bg-cyan-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60"
              >
                {status === "auth-checking" ? "Checking..." : "Connect Repository"}
              </button>
            </form>

            <p className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-sm text-slate-300">
              For login, use GitHub PAT with write access (`repo` scope for classic PAT). Quick guide: {" "}
              <a className="text-cyan-300 underline" href={HELP_LINK} target="_blank" rel="noreferrer">
                create token in 30 seconds
              </a>
              .
            </p>
          </section>
        )}

        {showDashboard && (
          <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Dashboard</h2>
              <button onClick={handleLogout} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-medium">
                Logout
              </button>
            </div>

            <p className="text-sm text-slate-300">Connected repository: <code>{savedRepo}</code></p>
            {!requiresPat && (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
                Self-host mode active. PAT auth is bypassed for local development only.
              </p>
            )}

            <textarea
              className="h-80 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-sm"
              value={jsonDraft}
              onChange={(e) => setJsonDraft(e.target.value)}
            />

            <button
              onClick={handleSaveToGitHub}
              disabled={!canSave}
              className="rounded-lg bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-50"
            >
              {status === "saving" ? "Saving..." : "Save to GitHub"}
            </button>

            <p className="text-xs text-slate-400">Target file: <code>{FILE_PATH}</code></p>
          </section>
        )}
      </div>
    </main>
  );
}
