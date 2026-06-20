import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  FileText,
  Filter,
  MapPin,
  Radar,
  Save,
  Search,
  SlidersHorizontal,
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

const statusLabels: Record<Job["status"], string> = {
  captured: "Captured",
  saved: "Saved",
  applied: "Applied",
  interviewing: "Interviewing",
  rejected: "Rejected",
};

function scoreTone(score: number) {
  if (score >= 85) return "strong";
  if (score >= 70) return "medium";
  return "weak";
}

export function App() {
  const [profile, setProfile] = useState<Profile>(defaultProfile);
  const [profileDraft, setProfileDraft] = useState(profileToDraft(defaultProfile));
  const [jobs, setJobs] = useState<Job[]>([]);
  const [dataSource, setDataSource] = useState("Waiting for capture");
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);

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
          setProfileDraft(profileToDraft(mappedProfile));
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
    setProfileDraft(profileToDraft(mappedProfile));
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

  async function saveProfile() {
    setIsSaving(true);
    setNotice("Saving profile...");
    try {
      const response = await fetch("http://127.0.0.1:8000/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: profileDraft.name.trim() || "Local Profile",
          target_roles: splitTerms(profileDraft.targetRoles),
          skills: splitTerms(profileDraft.skills),
          locations: splitTerms(profileDraft.locations),
          dealbreakers: splitTerms(profileDraft.dealbreakers),
          seniority: profileDraft.seniority.trim() || "entry",
        }),
      });
      if (!response.ok) {
        throw new Error(await response.text());
      }
      await refreshDashboardData();
      setNotice("Profile saved. Jobs were rescored.");
    } catch (_error) {
      setNotice("Profile save failed.");
    } finally {
      setIsSaving(false);
    }
  }

  const sortedJobs = useMemo(() => [...jobs].sort((a, b) => b.fit.score - a.fit.score), [jobs]);
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

        <section className="panel">
          <div className="panel-heading">
            <BriefcaseBusiness size={18} aria-hidden="true" />
            <h2>Profile</h2>
          </div>
          <div className="profile-form">
            <label className="text-field">
              <span>Name</span>
              <input
                value={profileDraft.name}
                onChange={(event) => setProfileDraft({ ...profileDraft, name: event.target.value })}
              />
            </label>
            <label className="text-field">
              <span>Target roles</span>
              <input
                value={profileDraft.targetRoles}
                onChange={(event) => setProfileDraft({ ...profileDraft, targetRoles: event.target.value })}
              />
            </label>
            <label className="text-field">
              <span>Skills</span>
              <input
                value={profileDraft.skills}
                onChange={(event) => setProfileDraft({ ...profileDraft, skills: event.target.value })}
              />
            </label>
            <button className="primary-button" type="button" disabled={isSaving} onClick={saveProfile}>
              <Save size={16} aria-hidden="true" />
              Save profile
            </button>
          </div>
        </section>

        <section className="panel">
          <div className="panel-heading">
            <SlidersHorizontal size={18} aria-hidden="true" />
            <h2>Preferences</h2>
          </div>
          <dl className="definition-list">
            <div>
              <dt>Locations</dt>
              <dd>
                <input
                  className="inline-input"
                  value={profileDraft.locations}
                  onChange={(event) => setProfileDraft({ ...profileDraft, locations: event.target.value })}
                />
              </dd>
            </div>
            <div>
              <dt>Seniority</dt>
              <dd>
                <input
                  className="inline-input"
                  value={profileDraft.seniority}
                  onChange={(event) => setProfileDraft({ ...profileDraft, seniority: event.target.value })}
                />
              </dd>
            </div>
            <div>
              <dt>Dealbreakers</dt>
              <dd>
                <input
                  className="inline-input"
                  value={profileDraft.dealbreakers}
                  onChange={(event) => setProfileDraft({ ...profileDraft, dealbreakers: event.target.value })}
                />
              </dd>
            </div>
          </dl>
        </section>

        <div className="button-stack">
          <button className="secondary-button" type="button" title="Filter captured jobs">
            <Filter size={16} aria-hidden="true" />
            Filters
          </button>
        </div>
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
            <input aria-label="Search jobs" placeholder="Search title, company, skill" />
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
              <h3>No captured jobs yet</h3>
              <p>Open Handshake, reload the extension, and click Capture visible jobs to populate this dashboard.</p>
            </article>
          ) : (
            sortedJobs.map((job) => (
              <article className="job-card" key={job.id}>
              <div className="job-main">
                <div>
                  <div className="job-title-row">
                    <h3>{job.title}</h3>
                    <span className="status-pill">{statusLabels[job.status]}</span>
                  </div>
                  <p className="company-line">
                    {job.company}
                    <span aria-hidden="true">/</span>
                    <MapPin size={15} aria-hidden="true" />
                    {job.location}
                  </p>
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
                <button type="button">Save</button>
                <button type="button">Mark applied</button>
              </div>
              </article>
            ))
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

function profileToDraft(profile: Profile) {
  return {
    name: profile.name,
    targetRoles: profile.targetRoles.join(", "),
    skills: profile.skills.join(", "),
    locations: profile.locations.join(", "),
    dealbreakers: profile.dealbreakers.join(", "),
    seniority: profile.seniority,
  };
}

function splitTerms(value: string) {
  return value
    .split(",")
    .map((term) => term.trim())
    .filter(Boolean);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
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
