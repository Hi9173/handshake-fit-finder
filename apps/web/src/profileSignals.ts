export type ProfileSignalGroups = {
  resumeCharacteristics: string[];
  userCharacteristics: string[];
  characteristics: string[];
};

export function orderedProfileSignals(profile: ProfileSignalGroups) {
  return uniqueTerms([...profile.resumeCharacteristics, ...profile.userCharacteristics]);
}

export function characteristicSource(characteristic: string, profile: ProfileSignalGroups) {
  const key = characteristic.toLowerCase();
  if (profile.resumeCharacteristics.some((item) => item.toLowerCase() === key)) {
    return "resume";
  }
  return "user";
}

export function uniqueTerms(terms: string[]) {
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
