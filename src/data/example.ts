export type Prospect = {
  id: string;
  name: string;
  initials: string;
  category: string;
  location: string;
  status: "Opportunity" | "Needs a closer look" | "Website found";
  note: string;
  signal: string;
  color: string;
  sources: { title: string; kind: string; observation: string }[];
  draft: string;
};

// Fictional, deliberately labeled UI fixtures. These are never presented as live research.
export const exampleProspects: Prospect[] = [
  {
    id: "example-fern",
    name: "Fern & Co. Cleaning",
    initials: "F",
    category: "Home cleaning",
    location: "Manchester, UK",
    status: "Opportunity",
    note: "Enquiries go through a social profile. A dedicated booking website could make the next step simpler.",
    signal: "Social-only booking",
    color: "#80b7a8",
    sources: [
      {
        title: "Example business directory listing",
        kind: "Directory",
        observation:
          "The fictional listing includes a social profile, but no website address.",
      },
      {
        title: "Example social profile",
        kind: "Business profile",
        observation:
          "The sample profile asks customers to message for availability and prices.",
      },
      {
        title: "Example name-and-location search",
        kind: "Cross-check",
        observation:
          "No matching independent website is included in this fixture. This is not a claim about a real business.",
      },
    ],
    draft:
      "Hi Fern & Co. team,\n\nI noticed your customers enquire about cleaning appointments through your social profile. I build simple websites for local businesses, and thought a clear services page with a booking enquiry form could make that process easier for you and your customers.\n\nWould you be open to a quick look at what that could involve?\n\nBest,\n[Your name]",
  },
  {
    id: "example-clearwell",
    name: "Clearwell Home Care",
    initials: "C",
    category: "Cleaning & property care",
    location: "Manchester, UK",
    status: "Needs a closer look",
    note: "The listed website did not respond in the example check. A temporary outage needs to be ruled out first.",
    signal: "Website check inconclusive",
    color: "#b8a0cc",
    sources: [
      {
        title: "Example directory record",
        kind: "Directory",
        observation: "The fictional listing provides a website address.",
      },
      {
        title: "Example website availability check",
        kind: "Website check",
        observation:
          "The fixture returns a timeout. One timeout cannot establish a persistent problem.",
      },
    ],
    draft:
      "Hi Clearwell team,\n\nI came across your business while researching local cleaning services. I couldn’t reach the website linked from your listing during my check, though that could be temporary.\n\nIf you’re already considering updating your site or making booking enquiries easier, I’d be happy to share a few ideas.\n\nBest,\n[Your name]",
  },
  {
    id: "example-sunday",
    name: "Sunday Cleaning Studio",
    initials: "S",
    category: "Home cleaning",
    location: "Manchester, UK",
    status: "Website found",
    note: "A second search found an existing website. The reviewer removed the original “no website” suggestion.",
    signal: "Existing site verified in example",
    color: "#819fdb",
    sources: [
      {
        title: "Example initial directory listing",
        kind: "Directory",
        observation:
          "The sample listing has no website field. This alone is insufficient evidence.",
      },
      {
        title: "Example follow-up search",
        kind: "Cross-check",
        observation:
          "The follow-up fixture contains a matching website and contact details.",
      },
      {
        title: "Example reviewer decision",
        kind: "Review",
        observation:
          "The unsupported no-website pitch was withdrawn. The business remains visible to explain the decision.",
      },
    ],
    draft:
      "The sample reviewer found an existing website and withdrew the original offer. Investigate a specific, supported need before preparing a new message.",
  },
];

export const exampleEvents = [
  {
    agent: "Scout",
    icon: "search" as const,
    text: "Found three example businesses matching the brief.",
    time: "00:01",
    color: "blue",
  },
  {
    agent: "Researcher",
    icon: "globe" as const,
    text: "Compared business details and booking information.",
    time: "00:02",
    color: "violet",
  },
  {
    agent: "Website analyst",
    icon: "target" as const,
    text: "Checked website evidence alongside the researcher.",
    time: "00:02",
    color: "cyan",
  },
  {
    agent: "Reviewer",
    icon: "shield" as const,
    text: "Found a website for Sunday. Withdrew the unsupported pitch.",
    time: "00:03",
    color: "green",
  },
  {
    agent: "Writer",
    icon: "feather" as const,
    text: "Prepared drafts for the remaining example opportunities.",
    time: "00:04",
    color: "blue",
  },
];
