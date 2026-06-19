import {
  AlertTriangle,
  BriefcaseBusiness,
  CheckCircle2,
  ExternalLink,
  Filter,
  MapPin,
  Radar,
  Search,
  SlidersHorizontal,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { jobs as sampleJobs, profile as sampleProfile, type Job, type JobStatus } from "./data/sampleJobs";

type Profile = typeof sampleProfile;

type ApiProfile = {
  name: string;
  target_roles: string[];
  skills: string[];
  locations: string[];
  dealbreakers: string[];
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
  const [profile, setProfile] = useState<Profile>(sampleProfile);
  const [jobs, setJobs] = useState<Job[]>(sampleJobs);
  const [dataSource, setDataSource] = useState("Sample data");

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
          setProfile(mapProfile(apiProfile));
          setJobs(apiJobs.map(mapJob));
          setDataSource("Local API");
        }
      } catch (_error) {
        if (isMounted) {
          setProfile(sampleProfile);
          setJobs(sampleJobs);
          setDataSource("Sample data");
        }
      }
    }

    loadDashboardData();
    return () => {
      isMounted = false;
    };
  }, []);

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

        <section className="panel">
          <div className="panel-heading">
            <BriefcaseBusiness size={18} aria-hidden="true" />
            <h2>Profile</h2>
          </div>
          <p className="profile-name">{profile.name}</p>
          <div className="tag-list">
            {profile.targetRoles.map((role) => (
              <span key={role}>{role}</span>
            ))}
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
              <dd>{profile.locations.join(", ")}</dd>
            </div>
            <div>
              <dt>Skills</dt>
              <dd>{profile.skills.join(", ")}</dd>
            </div>
            <div>
              <dt>Dealbreakers</dt>
              <dd>{profile.dealbreakers.join(", ")}</dd>
            </div>
          </dl>
        </section>

        <div className="button-stack">
          <button className="primary-button" type="button" title="Upload resume">
            <Upload size={16} aria-hidden="true" />
            Upload resume
          </button>
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
          {sortedJobs.map((job) => (
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
          ))}
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
