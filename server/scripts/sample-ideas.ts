/** Sample ideas for local development: internal sales-ops and support tooling for a MedTech company. Figures are illustrative. */
export const sampleIdeas = [
  {
    title: 'Ask Salesforce: plain-English pipeline analytics for sales leaders',
    description: `Sales leaders and ops analysts currently wait days for custom Salesforce reports. This builds a chat assistant that answers questions like "which IDN opportunities slipped this quarter and why?" using live pipeline data.

**Approach**
- Salesforce syncs into BigQuery on a schedule (Data Transfer Service); the assistant only sees curated, row-level-secured views.
- A Cloud Run app behind IAP uses Gemini to turn each question into SQL, runs it read-only, and summarizes the result with the SQL shown for trust.
- Every question, generated SQL and result is logged for audit.

**Scope**
- Phase 1 is read-only. Writing back to Salesforce is a separate, human-approved phase.
- Non-goals: no patient or clinical data, nothing that touches the device or its algorithm.

**Success metrics**
- Median time to answer an ad hoc pipeline question drops from about 2 days to under 5 minutes.
- At least 70% of questions answered correctly on a 100-question golden set before launch.`,
    type: 'new_project',
    date_needed_by: '2027-01-29',
    impacted_users: 45,
    user_type: 'internal',
    impact_of_delay: `Human: sales leaders and analysts keep making forecast calls on stale or hand-built numbers, and ops analysts spend their week on one-off report requests.
Time: roughly 6 hours per week per analyst on ad hoc reporting, across about 8 analysts.
Revenue: slipped deals are spotted late; catching even a few stalled hospital opportunities a quarter is worth well into six figures in pipeline.`,
  },
  {
    title: 'Security questionnaire drafter for hospital procurement',
    description: `Every hospital and health system sends a long security and privacy questionnaire (HIPAA, SOC 2, data handling, incident response) before it will buy. Each one is answered by hand from scratch, and it stalls deals.

**Approach**
- Build an approved answer library from past questionnaires, the SOC 2 report and policy documents.
- A retrieval assistant on Vertex AI drafts answers with a citation to the source document and a confidence level.
- IT Security and Legal review and approve every answer in a simple queue; nothing is sent to a customer automatically.
- Anything it cannot ground in a source is flagged "needs a human" rather than guessed.

**Scope and guardrails**
- Internal tool only. It never handles patient data and never makes clinical or regulatory claims; those questions are routed to Regulatory and Quality.

**Success metrics**
- Turnaround per questionnaire drops from about 10 business days to 2.
- Reviewers edit fewer than 30% of drafted answers after the first month.`,
    type: 'new_project',
    date_needed_by: '2026-12-18',
    impacted_users: 25,
    user_type: 'internal',
    impact_of_delay: `Human: IT Security and Legal are pulled off planned work for every questionnaire, and the same answers are retyped dozens of times with inconsistent wording.
Time: about 15 to 20 hours of expert time per questionnaire, with 4 to 6 questionnaires in flight at any moment.
Revenue: hospital deals sit in procurement review waiting on these answers, so each week of delay pushes enterprise contract signatures to a later quarter.`,
  },
  {
    title: 'Sales call notes to Salesforce updates, with rep approval',
    description: `Reps and clinical specialists finish calls with hospital contacts, then spend evenings typing notes, next steps and stage changes into Salesforce. Updates are late, thin or missing.

**Approach**
- A scheduled agent reads call transcripts and meeting notes, then drafts the Salesforce updates: summary, next steps, contacts, and a suggested stage change.
- Drafts appear in an approval screen. The rep edits and clicks Approve; only then does anything write to Salesforce. The agent has no delete permission and a step limit.
- Every proposed and approved action is logged for audit.

**Scope and guardrails**
- Notes are scrubbed for patient identifiers before they reach the model; if PHI is detected the draft is blocked and the rep is told why.
- Non-goal: no autonomous outreach, no emails sent on a rep's behalf.

**Success metrics**
- CRM notes completed within 24 hours of a call rise from about 40% to over 90%.
- Reps save at least 3 hours a week of admin time.`,
    type: 'feature_request',
    date_needed_by: '2027-02-26',
    impacted_users: 60,
    user_type: 'internal',
    impact_of_delay: `Human: reps do CRM admin at night and on weekends, and managers coach from incomplete records.
Time: about 3 to 5 hours per rep per week, roughly 60 reps, so around 9,000 selling hours a year spent typing.
Revenue: missed follow-ups and stale stages hide at-risk deals; forecast accuracy suffers, and recovered selling time compounds across the whole team.`,
  },
  {
    title: 'Support case triage with adverse-event flagging for Quality',
    description: `Customer support receives cases from hospital staff by email and phone, and everything lands in one queue. Urgent problems wait behind routine questions, and any case describing a possible patient-safety event must reach Quality quickly.

**Approach**
- A classifier reads each new case and suggests a category, urgency and owner, with a confidence score.
- Cases that mention possible harm, malfunction or other complaint language are flagged immediately to Quality for human review. The AI never closes, downgrades or dismisses a case, and never decides whether something is reportable.
- Low-confidence cases fall back to the normal queue for a person to read.

**Scope and guardrails**
- Internal tooling only; it does not touch the device or its software. Routing rules and flag keywords are reviewed with Quality and Regulatory before launch.
- Success is measured on a golden set of past cases, with the flag recall target agreed with Quality up front.

**Success metrics**
- Median time to first response on urgent cases falls from hours to under 30 minutes.
- Zero missed complaint-language cases in the pilot golden set.`,
    type: 'new_project',
    date_needed_by: '2027-03-31',
    impacted_users: 400,
    user_type: 'both',
    impact_of_delay: `Human: clinicians waiting on help for a bedside device can sit behind routine questions, and a potential safety report could be seen late.
Time: support spends roughly 2 hours a day per agent on manual sorting and re-routing, across about 15 agents.
Revenue: slow, inconsistent support erodes hospital confidence at renewal time and adds compliance risk if complaint-handling timelines are missed.`,
  },
  {
    title: 'Clean up duplicate and incomplete Salesforce account records',
    description: `Salesforce holds duplicate hospital and health-system accounts, mismatched parent/child relationships between sites and their IDN, and missing fields. Territory plans, forecasts and reports are wrong because of it.

**Approach**
- Profile a sample first and classify the defects. Most are deterministic (formatting, exact duplicates, missing required fields) and get fixed with rules, not a model.
- Use an LLM only for the fuzzy slice: matching "St. Mary's Medical" to "Saint Mary's Medical Center" and inferring parent systems. Each match has a confidence score; below the threshold it goes to a human review queue.
- Every merge or change is logged with before and after values, and a rollback path exists. Run a two-week pilot on one region before touching the rest.

**Scope**
- Account and contact data only. No patient data is involved.

**Success metrics**
- Duplicate rate drops from an estimated 8% to under 1% of accounts.
- Required-field completeness rises above 95%, and the territory report reconciles with finance.`,
    type: 'bug_fix',
    date_needed_by: '2026-11-20',
    impacted_users: 90,
    user_type: 'internal',
    impact_of_delay: `Human: reps chase the wrong contacts, double-call the same hospital and argue over account ownership; ops loses trust in every dashboard.
Time: about 2 hours per rep per month reconciling records, plus 20 to 30 hours of ops time each quarter for manual territory and forecast cleanup.
Revenue: duplicate and orphaned accounts distort pipeline and quota math, and mis-assigned IDN opportunities risk being worked by two reps or by none.`,
  },
] as const;
