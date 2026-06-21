import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Radar,
  Search,
  Sparkles,
  Upload,
} from "lucide-react";
import { ChangeEvent, useEffect, useMemo, useState } from "react";

import { defaultProfile, type Job, type JobStatus } from "./data/dashboardData";

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
    role_matches: string[];
    penalties: string[];
    summary: string;
  };
};

function scoreTone(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "medium";
  return "weak";
}

export function App() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [characteristicDraft, setCharacteristicDraft] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dataSource, setDataSource] = useState("Waiting for capture");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

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
    return () => {
      isMounted = false;
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
    setNotice("Saving characteristic...");
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
          user_characteristics: userCharacteristics,
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setCharacteristicDraft("");
      setNotice("Characteristic saved.");
    } catch (_error) {
      setNotice("Characteristic save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const filteredJobs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) {
      return jobs;
    }
    return jobs.filter((job) =>
      [job.title, job.company, job.location, job.description, job.fit.summary, ...job.fit.matchedSkills, ...job.fit.missingSkills]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [jobs, searchQuery]);
  const sortedJobs = useMemo(() => [...filteredJobs].sort((a, b) => b.fit.score - a.fit.score), [filteredJobs]);
  const averageScore = Math.round(jobs.reduce((total, job) => total + job.fit.score, 0) / Math.max(jobs.length, 1));
  const savedCount = jobs.filter((job) => job.status === "saved").length;
  const cautionCount = jobs.filter((job) => job.fit.penalties.length > 0).length;

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
          <div className="panel-heading">
            <Sparkles size={18} aria-hidden="true" />
            <h2>Characteristics</h2>
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
          {profile.characteristics.length > 0 ? (
            <ul className="characteristic-list">
              {profile.characteristics.map((characteristic) => {
                const source = characteristicSource(characteristic, profile);
                const sourceLabel = source === "user" ? "added by you" : "from resume";
                return (
                  <li
                    aria-label={`${characteristic}, ${sourceLabel}`}
                    className={`characteristic-chip ${source}`}
                    key={characteristic}
                    title={`${characteristic} (${sourceLabel})`}
                  >
                    <span>{characteristic}</span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="empty-copy">Upload a resume or add a characteristic.</p>
          )}
          <form className="characteristic-form" onSubmit={(event) => event.preventDefault()}>
            <input
              aria-label="Add characteristic"
              placeholder="Add characteristic"
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
            <p className="eyebrow">Private local dashboard</p>
            <h2>Ranked jobs from your captured session</h2>
            <p className="data-source">{dataSource}</p>
          </div>
          <label className="search-box">
            <Search size={17} aria-hidden="true" />
            <input
              aria-label="Search jobs"
              placeholder="Search title, company, skill"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </label>
        </header>

        <section className="metrics" aria-label="Job metrics">
          <Metric label="Captured" value={jobs.length.toString()} />
          <Metric label="Average fit" value={`${averageScore}%`} />
          <Metric label="Saved" value={savedCount.toString()} />
          <Metric label="Cautions" value={cautionCount.toString()} />
        </section>

        <section className="job-list" aria-label="Fit-ranked job list">
          {sortedJobs.length === 0 ? (
            <article className="empty-state">
              <h3>{jobs.length === 0 ? "No captured jobs yet" : "No matching jobs"}</h3>
              <p>
                {jobs.length === 0
                  ? "Open Handshake, reload the extension, and click Capture visible jobs to populate this dashboard."
                  : "Clear or change the search query to see more captured jobs."}
              </p>
            </article>
          ) : (
            sortedJobs.map((job) => {
              const display = jobDisplay(job);
              return (
                <article className="job-card" key={job.id}>
                  <div className="job-main">
                    <div>
                      <div className="job-title-row">
                        <h3>{display.role}</h3>
                      </div>
                      <dl className="job-meta">
                        <div>
                          <dt>Company Name</dt>
                          <dd>{display.company}</dd>
                        </div>
                        <div>
                          <dt>Company Location</dt>
                          <dd>{display.location}</dd>
                        </div>
                        <div>
                          <dt>Remote / In-person</dt>
                          <dd>{display.workMode}</dd>
                        </div>
                        <div>
                          <dt>Full-Time/Part-Time/Internship</dt>
                          <dd>{display.employmentType}</dd>
                        </div>
                      </dl>
                    </div>
                    <div className={`score-badge ${scoreTone(job.fit.score)}`}>
                      <span>{job.fit.score}%</span>
                      <small>fit</small>
                    </div>
                  </div>

                  <p className="summary">{job.fit.summary}</p>

                  <div className="fit-grid">
                    <FitColumn title="Matched" items={job.fit.matchedSkills} icon="check" />
                    <FitColumn title="Missing" items={job.fit.missingSkills} icon="warn" />
                    <FitColumn title="Cautions" items={job.fit.penalties} icon="warn" />
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
      roleMatches: job.fit.role_matches,
      penalties: job.fit.penalties,
      summary: job.fit.summary,
    },
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function characteristicSource(characteristic: string, profile: Profile) {
  const key = characteristic.toLowerCase();
  if (profile.userCharacteristics.some((item) => item.toLowerCase() === key)) {
    return "user";
  }
  return "resume";
}

function uniqueTerms(terms: string[]) {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const term of terms) {
    const cleaned = term.trim();
    const key = cleaned.toLowerCase();
    if (!key || seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(cleaned);
  }
  return unique;
}

function jobDisplay(job: Job) {
  const text = [job.title, job.company, job.location, job.description].join(" ");
  const location = cleanValue(extractLocation(text) || job.location);
  return {
    role: cleanValue(extractRole(job), "Unknown role"),
    company: cleanValue(job.company),
    location,
    workMode: /\bremote\b/i.test(text) ? "Remote" : location === "Unknown" ? "Unknown" : "In-person",
    employmentType: extractEmploymentType(text),
  };
}

function extractRole(job: Job) {
  let role = job.title;
  if (job.company && job.company !== "Unknown company" && role.toLowerCase().startsWith(job.company.toLowerCase())) {
    role = role.slice(job.company.length);
  }
  role = role
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\$[\d,.]+(?:[–-][\d,.]+)?\s*(?:K|hr|mo|yr)?(?:\/(?:hr|mo|yr))?/gi, " ")
    .split(/\b(?:Unpaid|Paid|Internship|Full-time(?: job)?|Part[- ]time|Remote|Hybrid|Onsite|Promoted|New)\b/i)[0]
    .replace(/\s+[A-Z][a-z]+,\s*[A-Z]{2}.*$/, "")
    .trim();
  return (
    role.match(
      /\b(?:Junior|Jr\.?|New Grad|Intern)?\s*(?:AI|Full Stack|Frontend|Front End|Backend|Mobile|Web|Embedded|Software|Data|UX\/UI|UI|Growth|Platform|Project|Sales|Optical|Firmware|Systems|Engineering)[A-Za-z /,&-]*(?:Engineer|Developer|Analyst|Designer|Intern|Representative|Scientist|Specialist)\b/i,
    )?.[0] || role
  );
}

function extractLocation(text: string) {
  return text.match(/(?:^|[^A-Za-z])([A-Z][a-zA-Z .'-]+,\s*[A-Z]{2})\b/)?.[1] || "";
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

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function FitColumn({ title, items, icon }: { title: string; items: string[]; icon: "check" | "warn" }) {
  return (
    <div className="fit-column">
      <h4>
        {icon === "check" ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
        {title}
      </h4>
      {items.length > 0 ? (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p>None</p>
      )}
    </div>
  );
}
