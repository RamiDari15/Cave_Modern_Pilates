export const NO_SHOW_POLICY = {
  introduction: "If you do not attend your scheduled class and do not cancel before class begins, your reservation will be considered a no-show.",
  tiers: [
    {
      label: "Drop-In Guests",
      description: "You will forfeit the missed class credit, and we will charge a $30 no-show fee."
    },
    {
      label: "Class Package Members",
      description: "You will forfeit the missed class credit, and a $30 no-show fee will be charged."
    },
    {
      label: "Unlimited Members",
      description: "You will receive one complimentary no-show waiver per month. After you use your waiver, each additional no-show will result in a $30 fee."
    },
    {
      label: "12-Month Unlimited Members",
      description: "You will receive two complimentary no-show waivers per month. After you use both waivers, each additional no-show will result in a $30 fee."
    }
  ],
  conclusion: "Repeated no-shows may result in temporary booking restrictions at management’s discretion."
};

export const NO_SHOW_POLICY_PARAGRAPHS = [
  NO_SHOW_POLICY.introduction,
  ...NO_SHOW_POLICY.tiers.map(({ label, description }) => `${label}: ${description}`),
  NO_SHOW_POLICY.conclusion
];
