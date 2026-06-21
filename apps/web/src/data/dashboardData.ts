export type JobStatus = "captured" | "saved" | "applied" | "interviewing" | "rejected";

export type FitScore = {
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
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

export const defaultProfile = {
  name: "Local Profile",
  targetRoles: ["Data Analyst", "Software Engineer"],
  skills: ["Python", "SQL", "React", "TypeScript", "Excel"],
  locations: ["Remote", "San Francisco", "New York"],
  dealbreakers: ["Unpaid", "Onsite only"],
  seniority: "entry",
  resumeFilename: null as string | null,
  resumeUploadedAt: null as string | null,
  hasResume: false,
};
