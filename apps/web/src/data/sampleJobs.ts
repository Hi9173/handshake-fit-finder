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
  sourceUrl: string;
  status: JobStatus;
  fit: FitScore;
};

export const profile = {
  name: "Justin",
  targetRoles: ["Data Analyst", "Software Engineer"],
  skills: ["Python", "SQL", "React", "TypeScript", "Excel"],
  locations: ["Remote", "San Francisco", "New York"],
  dealbreakers: ["Unpaid", "Onsite only"],
};

export const jobs: Job[] = [
  {
    id: 1,
    title: "Entry Level Data Analyst",
    company: "Bright Metrics",
    location: "New York, NY",
    sourceUrl: "https://app.joinhandshake.com/stu/jobs/sample-1",
    status: "saved",
    fit: {
      score: 100,
      matchedSkills: ["excel", "python", "sql"],
      missingSkills: ["tableau"],
      roleMatches: ["data analyst"],
      penalties: [],
      summary: "100% fit with one optional skill gap to review.",
    },
  },
  {
    id: 2,
    title: "Junior Software Engineer",
    company: "Launchpad Labs",
    location: "Remote",
    sourceUrl: "https://app.joinhandshake.com/stu/jobs/sample-2",
    status: "captured",
    fit: {
      score: 88,
      matchedSkills: ["python", "react", "sql", "typescript"],
      missingSkills: ["aws", "docker"],
      roleMatches: ["software engineer"],
      penalties: [],
      summary: "88% fit with two infrastructure gaps to review.",
    },
  },
  {
    id: 3,
    title: "Senior Business Intelligence Engineer",
    company: "Scale Systems",
    location: "Boston, MA",
    sourceUrl: "https://app.joinhandshake.com/stu/jobs/sample-3",
    status: "captured",
    fit: {
      score: 42,
      matchedSkills: ["python", "sql"],
      missingSkills: ["tableau"],
      roleMatches: [],
      penalties: [
        "Location does not match preferences",
        "Dealbreaker matched: onsite only",
        "Seniority appears above entry level",
      ],
      summary: "42% fit with several caution signals.",
    },
  },
];
