export type JobStatus = "captured" | "saved" | "applied" | "interviewing" | "rejected";
export type JobCategory = "underReview" | "applied" | "saved" | "skipped";
export type JobCategoryAction = {
  category: JobCategory;
  label: string;
  status: JobStatus;
};

export type FitScore = {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
  requiredSignals: string[];
  preferredSignals: string[];
  roleMatches: string[];
  penalties: string[];
  summary: string;
};

export type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  description: string;
  sourceUrl: string;
  status: JobStatus;
  fit: FitScore;
};

export const jobCategoryActions: JobCategoryAction[] = [
  { category: "underReview", label: "Review", status: "captured" },
  { category: "applied", label: "Apply", status: "applied" },
  { category: "saved", label: "Save", status: "saved" },
  { category: "skipped", label: "Skip", status: "rejected" },
];

export function countJobCategories(jobs: Pick<Job, "status">[]) {
  const counts: Record<JobCategory, number> = {
    underReview: 0,
    applied: 0,
    saved: 0,
    skipped: 0,
  };

  for (const job of jobs) {
    counts[categoryForStatus(job.status)] += 1;
  }

  return counts;
}

export function filterJobsByCategory<T extends Pick<Job, "status">>(jobs: T[], category: JobCategory) {
  return jobs.filter((job) => categoryForStatus(job.status) === category);
}

export function profileSignalMatches(signal: string, profileSignals: string[]) {
  const key = normalizeSignal(signal);
  return profileSignals.some((profileSignal) => normalizeSignal(profileSignal) === key);
}

export function categoryForStatus(status: JobStatus): JobCategory {
  if (status === "captured") return "underReview";
  if (status === "saved") return "saved";
  if (status === "applied" || status === "interviewing") return "applied";
  return "skipped";
}

function normalizeSignal(signal: string) {
  return signal.trim().replace(/\s+/g, " ").toLowerCase();
}

export const defaultProfile = {
  name: "Local Profile",
  targetRoles: ["Data Analyst", "Software Engineer"],
  skills: ["Python", "SQL", "React", "TypeScript", "Excel"],
  locations: ["Remote", "San Francisco", "New York"],
  dealbreakers: ["Unpaid", "Onsite only"],
  resumeCharacteristics: [] as string[],
  userCharacteristics: [] as string[],
  characteristics: [] as string[],
  seniority: "entry",
  resumeFilename: null as string | null,
  resumeUploadedAt: null as string | null,
  hasResume: false,
  useDeterministicExtraction: false,
};
