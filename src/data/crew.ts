export type AgentId = "quil" | "pip" | "milo" | "iris" | "wren";
export type MissionPhase =
  | "idle"
  | "introducing"
  | "planning"
  | "discovering"
  | "investigating"
  | "reviewing"
  | "writing"
  | "complete"
  | "paused";

export const crew: {
  id: AgentId;
  name: string;
  role: string;
  color: string;
  light: string;
  dark: string;
  introduction: string;
}[] = [
  {
    id: "pip",
    name: "Pip",
    role: "The scout",
    color: "#83caff",
    light: "#d9f4ff",
    dark: "#3987c7",
    introduction:
      "I’m Pip. I find businesses that fit your brief, then bring the useful leads back to the team.",
  },
  {
    id: "milo",
    name: "Milo",
    role: "The curious one",
    color: "#b4a0ed",
    light: "#e9e2ff",
    dark: "#7154b5",
    introduction:
      "I’m Milo. I look closer at each business: what they do, how customers reach them, and what the evidence actually says.",
  },
  {
    id: "quil",
    name: "Quil",
    role: "Your lead",
    color: "#d8e8ff",
    light: "#f0f7ff",
    dark: "#7298ce",
    introduction:
      "I’m Quil. Tell me what you’re looking for. I’ll keep the crew moving and bring everything back to you.",
  },
  {
    id: "iris",
    name: "Iris",
    role: "The second opinion",
    color: "#8ecab3",
    light: "#dbf4e9",
    dark: "#438c73",
    introduction:
      "I’m Iris. I check the team’s assumptions. A missing website link isn’t proof that a business has no website.",
  },
  {
    id: "wren",
    name: "Wren",
    role: "The wordsmith",
    color: "#dfb69a",
    light: "#ffe9d5",
    dark: "#ad7359",
    introduction:
      "I’m Wren. I turn the findings into a thoughtful first hello. You can edit every word before using it.",
  },
];

export const phaseOrder: MissionPhase[] = [
  "planning",
  "discovering",
  "investigating",
  "reviewing",
  "writing",
  "complete",
];

export const phaseMessages: {
  speaker: AgentId;
  text: string;
  kind?: "results";
}[] = [
  {
    speaker: "quil",
    text: "Let’s split this up. Pip, find the businesses. Milo and Iris, look at the evidence together. Wren, hold the introduction until we’ve checked it.",
  },
  {
    speaker: "pip",
    text: "Three fictional businesses to look at. Sending the listings over to Milo and Iris.",
  },
  {
    speaker: "milo",
    text: "Fern takes enquiries through a social profile. Clearwell’s example website check timed out. Iris is checking the website evidence alongside me.",
  },
  {
    speaker: "iris",
    text: "Found something: Sunday does have a website in the follow-up record. I’ve withdrawn the “no website” pitch. And one timeout doesn’t prove Clearwell has a broken site.",
  },
  {
    speaker: "wren",
    text: "I’m writing a gentle introduction for Fern. Clearwell needs another check. Sunday won’t get an unsupported pitch.",
  },
  {
    speaker: "quil",
    text: "Here’s where we landed. One promising introduction, one to check again, and one we ruled out. Open a name to see the thinking behind it.",
    kind: "results",
  },
];
