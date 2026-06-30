import {
  CheckCircle2,
  ExternalLink,
  FileText,
  Radar,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import {
  categoryForStatus,
  countJobCategories,
  defaultProfile,
  filterJobsByCategory,
  jobCategoryActions,
  profileSignalMatches,
  type Job,
  type JobCategory,
  type JobStatus,
} from "./data/dashboardData";
import { characteristicSource, orderedProfileSignals, uniqueTerms } from "./profileSignals";

type Profile = typeof defaultProfile;

type ApiProfile = {
  name: string;
  target_roles: string[];
  skills: string[];
  locations: string[];
  dealbreakers: string[];
  resume_characteristics: string[];
  user_characteristics: string[];
  characteristics: string[];
  seniority: string;
  resume_filename: string | null;
  resume_uploaded_at: string | null;
  has_resume: boolean;
  use_deterministic_extraction: boolean;
};

type ApiJob = {
  id: number;
  title: string;
  company: string;
  location: string;
  description: string;
  source_url: string;
  status: JobStatus;
  fit: {
    score: number;
    matched_skills: string[];
    missing_skills: string[];
    required_signals?: string[];
    preferred_signals?: string[];
    role_matches: string[];
    penalties: string[];
    summary: string;
  };
};

const DASHBOARD_REFRESH_MS = 5000;

export function App() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [characteristicDraft, setCharacteristicDraft] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dataSource, setDataSource] = useState("Waiting for capture");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [movingJobId, setMovingJobId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<JobCategory>("underReview");

  useEffect(() => {
    let isMounted = true;

    async function loadDashboardData() {
      try {
        const [profileResponse, jobsResponse] = await Promise.all([
          fetch("http://127.0.0.1:8000/api/profile"),
          fetch("http://127.0.0.1:8000/api/jobs"),
        ]);
        if (!profileResponse.ok || !jobsResponse.ok) {
          throw new Error("Local API unavailable");
        }
        const [apiProfile, apiJobs] = (await Promise.all([
          profileResponse.json(),
          jobsResponse.json(),
        ])) as [ApiProfile, ApiJob[]];

        if (isMounted) {
          const mappedProfile = mapProfile(apiProfile);
          setProfile(mappedProfile);
          setJobs(apiJobs.map(mapJob));
          setDataSource("Local API");
        }
      } catch (_error) {
        if (isMounted) {
          setProfile(defaultProfile);
          setJobs([]);
          setDataSource("Local API unavailable");
        }
      }
    }

    loadDashboardData();
    const refreshTimer = window.setInterval(() => {
      void loadDashboardData();
    }, DASHBOARD_REFRESH_MS);

    return () => {
      isMounted = false;
      window.clearInterval(refreshTimer);
    };
  }, []);

  async function refreshDashboardData() {
    const [profileResponse, jobsResponse] = await Promise.all([
      fetch("http://127.0.0.1:8000/api/profile"),
      fetch("http://127.0.0.1:8000/api/jobs"),
    ]);
    if (!profileResponse.ok || !jobsResponse.ok) {
      throw new Error("Local API unavailable");
    }
    const [apiProfile, apiJobs] = (await Promise.all([
      profileResponse.json(),
      jobsResponse.json(),
    ])) as [ApiProfile, ApiJob[]];
    const mappedProfile = mapProfile(apiProfile);
    setProfile(mappedProfile);
    setJobs(apiJobs.map(mapJob));
    setDataSource("Local API");
  }

  async function uploadResume(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsSaving(true);
    setNotice("Processing resume...");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("http://127.0.0.1:8000/api/profile/resume", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice("Resume saved. Jobs were rescored.");
    } catch (_error) {
      setNotice("Resume upload failed.");
    } finally {
      setIsSaving(false);
      event.target.value = "";
    }
  }

  async function addCharacteristic() {
    const characteristic = characteristicDraft.trim();
    if (!characteristic) {
      return;
    }

    setIsSaving(true);
    setNotice("Saving signal...");
    try {
      const userCharacteristics = uniqueTerms([...profile.userCharacteristics, characteristic]);
      const response = await fetch("http://127.0.0.1:8000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          target_roles: profile.targetRoles,
          skills: profile.skills,
          locations: profile.locations,
          dealbreakers: profile.dealbreakers,
          seniority: profile.seniority,
          resume_characteristics: profile.resumeCharacteristics,
          user_characteristics: userCharacteristics,
          use_deterministic_extraction: profile.useDeterministicExtraction,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setCharacteristicDraft("");
      setNotice("Signal saved.");
    } catch (_error) {
      setNotice("Signal save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteSignal(signal: string) {
    const key = signal.toLowerCase();

    setIsSaving(true);
    setNotice("Deleting signal...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          target_roles: profile.targetRoles,
          skills: profile.skills,
          locations: profile.locations,
          dealbreakers: profile.dealbreakers,
          seniority: profile.seniority,
          resume_characteristics: profile.resumeCharacteristics.filter((item) => item.toLowerCase() !== key),
          user_characteristics: profile.userCharacteristics.filter((item) => item.toLowerCase() !== key),
          use_deterministic_extraction: profile.useDeterministicExtraction,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice("Signal deleted.");
    } catch (_error) {
      setNotice("Signal delete failed.");
    } finally {
      setIsSaving(false);
    }
  }

  async function clearSignals() {
    if (profileSignals.length === 0) {
      return;
    }

    setIsSaving(true);
    setNotice("Clearing signals...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          target_roles: profile.targetRoles,
          skills: profile.skills,
          locations: profile.locations,
          dealbreakers: profile.dealbreakers,
          seniority: profile.seniority,
          resume_characteristics: [],
          user_characteristics: [],
          use_deterministic_extraction: profile.useDeterministicExtraction,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice("Signals cleared.");
    } catch (_error) {
      setNotice("Could not clear signals.");
    } finally {
      setIsSaving(false);
    }
  }

  async function toggleDeterministicExtraction(checked: boolean) {
    setIsSaving(true);
    setNotice("Updating extractor...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profile.name,
          target_roles: profile.targetRoles,
          skills: profile.skills,
          locations: profile.locations,
          dealbreakers: profile.dealbreakers,
          seniority: profile.seniority,
          resume_characteristics: profile.resumeCharacteristics,
          user_characteristics: profile.userCharacteristics,
          use_deterministic_extraction: checked,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice(checked ? "Deterministic extraction enabled." : "OpenAI extraction enabled.");
    } catch (_error) {
      setNotice("Could not update extractor.");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteCapturedJobs() {
    if (jobs.length === 0 || !window.confirm("Delete all captured jobs from the local dashboard?")) {
      return;
    }

    setIsSaving(true);
    setNotice("Deleting captured jobs...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/jobs", {
        method: "DELETE",
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice("Captured jobs deleted.");
    } catch (_error) {
      setNotice("Could not delete captured jobs.");
    } finally {
      setIsSaving(false);
    }
  }

  async function moveJob(jobId: number, status: JobStatus) {
    setMovingJobId(jobId);
    setNotice("Moving job...");
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/jobs/${jobId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      const movedJob = mapJob((await response.json()) as ApiJob);
      setJobs((currentJobs) => currentJobs.map((job) => (job.id === movedJob.id ? movedJob : job)));
      setNotice("Job moved.");
    } catch (_error) {
      setNotice("Could not move job.");
    } finally {
      setMovingJobId(null);
    }
  }

  const filteredJobs = useMemo(() => {
    const categoryJobs = filterJobsByCategory(jobs, activeCategory);
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return categoryJobs;
    }
    return categoryJobs.filter((job) =>
      [
        job.title,
        job.company,
        job.location,
        job.description,
        job.fit.summary,
        ...job.fit.matchedSkills,
        ...job.fit.missingSkills,
        ...job.fit.requiredSignals,
        ...job.fit.preferredSignals,
        ...job.fit.roleMatches,
      ]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [activeCategory, jobs, searchQuery]);
  const sortedJobs = useMemo(() => [...filteredJobs].sort((a, b) => b.fit.score - a.fit.score), [filteredJobs]);
  const profileSignals = useMemo(() => orderedProfileSignals(profile), [profile]);
  const jobCounts = countJobCategories(jobs);
  const activeCategoryLabel = categoryTileLabels[activeCategory];

  return (
    <main className="app-shell">
      <aside className="sidebar" aria-label="Profile and controls">
        <div className="brand-row">
          <div className="brand-mark">
            <Radar size={22} aria-hidden="true" />
          </div>
          <div>
            <h1>Fit Finder</h1>
            <p>Local Handshake ranking</p>
          </div>
        </div>

        <section className="panel resume-panel">
          <div className="panel-heading">
            <FileText size={18} aria-hidden="true" />
            <h2>Resume</h2>
          </div>
          <p className={profile.hasResume ? "resume-status ready" : "resume-status"}>
            {profile.hasResume ? profile.resumeFilename : "Upload a resume to calculate fit scores."}
          </p>
          {profile.resumeUploadedAt ? <p className="resume-date">{formatDate(profile.resumeUploadedAt)}</p> : null}
          <label className="upload-control">
            <Upload size={16} aria-hidden="true" />
            <span>{profile.hasResume ? "Replace resume" : "Upload resume"}</span>
            <input type="file" accept=".pdf,.tex,.md" disabled={isSaving} onChange={uploadResume} />
          </label>
          {notice ? <p className="form-notice">{notice}</p> : null}
        </section>

        <section className="panel characteristics-panel">
          <div className="panel-heading profile-signals-heading">
            <div>
              <Sparkles size={18} aria-hidden="true" />
              <h2>Profile Signals</h2>
            </div>
            <button
              aria-label="Clear all profile signals"
              className="clear-signals-button"
              disabled={isSaving || profileSignals.length === 0}
              onClick={clearSignals}
              title="Clear all profile signals"
              type="button"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
          <div className="characteristic-legend" aria-label="Characteristic source legend">
            <span>
              <span className="source-dot resume" aria-hidden="true" />
              From resume
            </span>
            <span>
              <span className="source-dot user" aria-hidden="true" />
              Added by you
            </span>
          </div>
          {profileSignals.length > 0 ? (
            <ul className="characteristic-list">
              {profileSignals.map((characteristic) => {
                const source = characteristicSource(characteristic, profile);
                const sourceLabel = source === "user" ? "added by you" : "from resume";
                return (
                  <li
                    aria-label={`${characteristic}, ${sourceLabel}`}
                    className={`characteristic-chip ${source}`}
                    key={characteristic}
                    title={`${characteristic} (${sourceLabel})`}
                  >
                    <button
                      aria-label={`Delete ${characteristic}`}
                      className="delete-signal-button"
                      disabled={isSaving}
                      onClick={() => deleteSignal(characteristic)}
                      title={`Delete ${characteristic}`}
                      type="button"
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                    <span>{characteristic}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-copy">Upload a resume or add a profile signal.</p>
          )}
          <form className="characteristic-form" onSubmit={(event) => event.preventDefault()}>
            <input
              aria-label="Add profile signal"
              placeholder="Add profile signal"
              value={characteristicDraft}
              onChange={(event) => setCharacteristicDraft(event.target.value)}
            />
            <button
              className="primary-button"
              type="button"
              disabled={isSaving || !characteristicDraft.trim()}
              onClick={addCharacteristic}
            >
              Add
            </button>
          </form>
        </section>
      </aside>

      <section className="workspace" aria-label="Ranked jobs">
        <header className="workspace-header">
          <div>
            <p className={dataSource === "Local API" ? "connection-status ready" : "connection-status"}>
              <span aria-hidden="true" />
              {dataSource}
            </p>
            <h2>Find the roles worth your next move</h2>
          </div>
          <div className="header-actions">
            <label className="search-box">
              <Search size={17} aria-hidden="true" />
              <input
                aria-label="Search jobs"
                placeholder="Search title, company, skill"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </label>
            <label className="extraction-toggle">
              <input
                type="checkbox"
                checked={profile.useDeterministicExtraction}
                disabled={isSaving}
                onChange={(event) => toggleDeterministicExtraction(event.target.checked)}
              />
              <span aria-hidden="true" />
              Deterministic
            </label>
            <button
              aria-label="Delete all captured jobs"
              className="danger-button"
              disabled={isSaving || jobs.length === 0}
              onClick={deleteCapturedJobs}
              title="Delete all captured jobs"
              type="button"
            >
              <Trash2 size={16} aria-hidden="true" />
              Clear jobs
            </button>
          </div>
        </header>

        <section className="metrics" aria-label="Job metrics">
          <Metric
            active={activeCategory === "underReview"}
            label="Under Review"
            onClick={() => setActiveCategory("underReview")}
            value={jobCounts.underReview.toString()}
          />
          <Metric
            active={activeCategory === "applied"}
            label="Applied"
            onClick={() => setActiveCategory("applied")}
            value={jobCounts.applied.toString()}
          />
          <Metric
            active={activeCategory === "saved"}
            label="Saved"
            onClick={() => setActiveCategory("saved")}
            value={jobCounts.saved.toString()}
          />
          <Metric
            active={activeCategory === "skipped"}
            label="Skipped"
            onClick={() => setActiveCategory("skipped")}
            value={jobCounts.skipped.toString()}
          />
        </section>

        <section className="job-list" aria-label="Fit-ranked job list">
          {sortedJobs.length === 0 ? (
            <article className="empty-state">
              <h3>{jobs.length === 0 ? "No captured jobs yet" : `No ${activeCategoryLabel} jobs`}</h3>
              <p>
                {jobs.length === 0
                  ? "Open Handshake, reload the extension, and click Capture visible jobs to populate this dashboard."
                  : "Clear or change the search query to see more captured jobs."}
              </p>
            </article>
          ) : (
            sortedJobs.map((job) => {
              const display = jobDisplay(job);
              const signals = jobSignals(job);
              const actions = availableJobActions(job.status);
              return (
                <article className="job-card" key={job.id}>
                  <div className="job-main">
                    <div>
                      <div className="job-title-row">
                        <h3>{display.role}</h3>
                      </div>
                      <dl className="job-meta">
                        <div>
                          <dt>Company</dt>
                          <dd>{display.company}</dd>
                        </div>
                        <div>
                          <dt>Location</dt>
                          <dd>{display.location}</dd>
                        </div>
                        <div>
                          <dt>Mode</dt>
                          <dd>{display.workMode}</dd>
                        </div>
                        <div>
                          <dt>Type</dt>
                          <dd>{display.employmentType}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="job-category-actions" aria-label={`Move ${display.role} to another category`}>
                      {actions.map((action) => (
                        <button
                          disabled={movingJobId === job.id}
                          key={action.category}
                          onClick={() => moveJob(job.id, action.status)}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="fit-grid">
                    <SignalColumn
                      title="Required Signals"
                      items={signals.required}
                      icon="required"
                      profileSignals={profileSignals}
                    />
                    <SignalColumn
                      title="Preferred Signals"
                      items={signals.preferred}
                      icon="preferred"
                      profileSignals={profileSignals}
                    />
                  </div>

                  <div className="job-actions">
                    <a href={job.sourceUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={15} aria-hidden="true" />
                      Open source
                    </a>
                  </div>
                </article>
              );
            })
          )}
        </section>
      </section>
    </main>
  );
}

function mapProfile(profile: ApiProfile): Profile {
  return {
    name: profile.name,
    targetRoles: profile.target_roles,
    skills: profile.skills,
    locations: profile.locations,
    dealbreakers: profile.dealbreakers,
    resumeCharacteristics: profile.resume_characteristics,
    userCharacteristics: profile.user_characteristics,
    characteristics: profile.characteristics,
    seniority: profile.seniority,
    resumeFilename: profile.resume_filename,
    resumeUploadedAt: profile.resume_uploaded_at,
    hasResume: profile.has_resume,
    useDeterministicExtraction: profile.use_deterministic_extraction,
  };
}

function mapJob(job: ApiJob): Job {
  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    description: job.description,
    sourceUrl: job.source_url,
    status: job.status,
    fit: {
      score: job.fit.score,
      matchedSkills: job.fit.matched_skills,
      missingSkills: job.fit.missing_skills,
      requiredSignals: job.fit.required_signals ?? [],
      preferredSignals: job.fit.preferred_signals ?? [],
      roleMatches: job.fit.role_matches,
      penalties: job.fit.penalties,
      summary: job.fit.summary,
    },
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function jobDisplay(job: Job) {
  const text = [job.title, job.company, job.location, job.description].join(" ");
  const location = cleanValue(job.location);
  return {
    role: cleanValue(extractRole(job), "Unknown role"),
    company: cleanValue(job.company),
    location,
    workMode: /\bremote\b/i.test(text) ? "Remote" : location === "Unknown" ? "Unknown" : "In-person",
    employmentType: extractEmploymentType(text),
  };
}

function jobSignals(job: Job) {
  return {
    required: uniqueTerms(job.fit.requiredSignals),
    preferred: uniqueTerms(job.fit.preferredSignals),
  };
}

const categoryTileLabels: Record<JobCategory, string> = {
  underReview: "Under Review",
  applied: "Applied",
  saved: "Saved",
  skipped: "Skipped",
};

function availableJobActions(status: JobStatus) {
  const currentCategory = categoryForStatus(status);
  return jobCategoryActions.filter((action) => action.category !== currentCategory);
}

function extractRole(job: Job) {
  let role = job.title;
  if (job.company && job.company !== "Unknown company" && role.toLowerCase().startsWith(job.company.toLowerCase())) {
    role = role.slice(job.company.length);
  }
  role = role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\$[\d,.]+(?:[–-][\d,.]+)?\s*(?:K|hr|mo|yr)?(?:\/(?:hr|mo|yr))?/gi, " ")
    .split(/\b(?:Unpaid|Paid|Internship|Full-time(?: job)?|Part[- ]time|Remote|Hybrid|Onsite|Promoted)\b/i)[0]
    .replace(/\s+[A-Z][a-z]+,\s*[A-Z]{2}.*$/, "")
    .trim();
  return (
    role.match(
      /\b(?:Junior|Jr\.?|New Grad|Intern)?\s*(?:AI|Full Stack|Frontend|Front End|Backend|Mobile|Web|Embedded|Software|Data|UX\/UI|UI|Growth|Platform|Project|Sales|Optical|Firmware|Systems|Engineering)[A-Za-z /,&-]*(?:Engineer|Developer|Analyst|Designer|Intern|Representative|Scientist|Specialist)\b/i,
    )?.[0] || role
  );
}

function extractEmploymentType(text: string) {
  if (/\binternship\b/i.test(text)) return "Internship";
  if (/\bpart[- ]time\b/i.test(text)) return "Part-Time";
  if (/\bfull[- ]time(?: job)?\b/i.test(text)) return "Full-Time";
  return "Unknown";
}

function cleanValue(value: string, fallback = "Unknown") {
  const cleaned = value.replace(/^Unknown company$/i, "").trim();
  return cleaned || fallback;
}

function Metric({
  active,
  label,
  onClick,
  value,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  value: string;
}) {
  return (
    <button aria-pressed={active} className={active ? "metric active" : "metric"} onClick={onClick} type="button">
      <span>{label}</span>
      <strong>{value}</strong>
    </button>
  );
}

function SignalColumn({
  title,
  items,
  icon,
  profileSignals,
}: {
  title: string;
  items: string[];
  icon: "required" | "preferred";
  profileSignals: string[];
}) {
  const sortedItems = matchedSignalsFirst(items, profileSignals);

  return (
    <div className="fit-column">
      <h4>
        {icon === "required" ? <CheckCircle2 size={15} aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
        {title}
      </h4>
      {items.length > 0 ? (
        <ul>
          {sortedItems.map((item) => {
            const tone = profileSignalMatches(item, profileSignals) ? "matched" : "missing";
            return (
              <li className={tone} key={item}>
                {item}
              </li>
            );
          })}
        </ul>
      ) : (
        <p>None</p>
      )}
    </div>
  );
}

function matchedSignalsFirst(items: string[], profileSignals: string[]) {
  return [...items].sort((left, right) => {
    const leftMatched = profileSignalMatches(left, profileSignals);
    const rightMatched = profileSignalMatches(right, profileSignals);
    return Number(rightMatched) - Number(leftMatched);
  });
}
