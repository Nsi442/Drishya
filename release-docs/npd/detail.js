// The activity chain and outputs for every procedure, in the manual's own
// style — but describing what Drishya actually did, not a generic product.
//
// `act`  the activity chain, arrow-separated, as the reference flowcharts write it
// `out`  what the procedure produced, named so a reviewer can go and look at it
// `adapted` procedure written for a physical product; carried out in the form
//           this product takes. Never silently dropped.
module.exports.detail = {
  NPDP1010: {
    title: 'Opportunity Assessment', band: 'blue',
    act: 'Form assessment team → consolidate vendor, driver and receiving-desk inputs → assess commercial, technical, data-privacy, operating-cost and regulatory risks → establish that a delay is discovered only when delivery is refused, and a document error only weeks later on a payment statement → prepare & review Opportunity Assessment Report → traceability.',
    out: 'Problem statement; opportunity assessment record; measurable target — predict dock-in, not gate arrival, and validate paperwork before dispatch.',
  },
  NPDP1020: {
    title: 'Select Gate Keepers', band: 'blue',
    act: 'Immediately after opportunity assessment. Appoint ILP faculty reviewers as the authority for all five gates. A reviewer representative is mandatory at every gate.',
    out: 'Gate keepers list.',
  },
  NPDP1030: {
    title: 'GATE-1 — Initial Screening', gate: 1,
    basis: 'Gate-1 decision basis: strategic fit, opportunity assessment, risks, and the scope boundaries the project will be held to.',
    approved: 'Project approved → scope boundaries recorded in the engineering guide: hardware out of scope, ingest HTTPS only, no paid APIs, no Kafka or Kubernetes, deploy target a t3.micro → proceed to Phase 2.',
    action: 'Close gate keeper concerns on scope or feasibility and resubmit for approval.',
    reject: 'Stop and archive if the opportunity is rejected or not approved.',
  },

  NPDP2010: {
    title: 'Project Start-Up', band: 'blue',
    act: 'Assign project lead → conduct PSU → create the repository as two independent projects, Drishya.Backend and Drishya Frontend → bring up PostgreSQL 16 with PostGIS in one command via docker-compose.',
    out: 'Repository; working local environment; approved assessment.',
  },
  NPDP2020: {
    title: 'Product Design Specification', band: 'blue',
    act: 'Convert the opportunity into a measurable specification → define the wire contract: every enum carries an explicit @JsonValue string matching the frontend vocabulary, timestamps cross as epoch milliseconds, promisedAt and predictedAt are both kept and neither may overwrite the other → internal review → revision control.',
    out: 'PDS, held in the repository’s engineering guide. The PDS is required before design begins.',
  },
  NPDP2030: {
    title: 'Create DHF', band: 'purple', spine: true,
    act: 'Create after PDS; maintain through retirement. Git history is the design record and the engineering guide carries the reasoning behind it — every trap is written down at the moment it is understood.',
    out: 'Design History File = the repository and its engineering guide. A lifecycle record, not a one-time task.',
  },
  NPDP2040: {
    title: 'Project Plan', band: 'teal',
    act: 'Detailed activities → four-layer verification plan chosen because each layer can pass while the one above it is broken → deployment plan → resource constraints fixed at a t3.micro with a db.t4g.micro behind it.',
    out: 'Project plan and verification plan. Before product design.',
  },
  NPDP2050: {
    title: 'Preliminary Project Review', band: 'teal',
    act: 'Review plan and sub-plans and design inputs; resolve vague or inadequate inputs; close actions. Before concept design.',
    out: 'Review record; closed actions.',
  },
  NPDP2060: {
    title: 'GATE-2 — Plan Approval', gate: 2,
    basis: 'DHF, traceability and project-plan revision control continue into every later phase.',
    approved: 'PDS meets the opportunity and the plan meets quality, cost and time-to-market objectives.',
    action: 'Gate requests changes → revise PDS / project plan under change control → return to Gate-2.',
    reject: 'Stop if the plan cannot meet the objectives within the fixed constraints.',
  },

  NPDP3010: {
    title: 'Concept Design', band: 'blue',
    act: 'Study PDS → function analysis → generate alternatives → feasibility & screening → evaluation → selected concept: one shipment object with three bounded portals, the vendor who books it, the driver who carries it, the fulfilment centre that receives it → revise PDS as needed → traceability.',
    out: 'Concept record; portal boundaries.',
  },
  NPDP3020: {
    title: 'System Design', band: 'teal',
    act: 'Define functional elements & interfaces → backend layering domain / repo / dto / service / web → tenant filtering placed in the repository layer, never in controllers → one frontend choke point at services/client.js → performance targets → acceptance criteria → review → traceability.',
    out: 'Architecture; layering; API surface; OpenAPI document.',
  },
  NPDP3030: {
    title: 'Detail Design', band: 'purple',
    act: 'Component objectives → 170 Java source files and 124 frontend source files → 13 Flyway migrations with ddl-auto off → spatial work in PostGIS, never hand-rolled in Java → integration → release prototype documents → traceability.',
    out: 'Implementation; database schema; released interface documentation.',
  },
  NPDP3040: {
    title: 'DESIGN REVIEW LOOP', banner: true,
    act: 'At concept, system and detail stages: preliminary review → critical review → close risk and contingency actions → update design documents and DHF → only qualified design proceeds to the next level.',
    out: 'Finding: every inherited listing endpoint was returning all tenants’ rows to any authenticated caller. Returned to NPDP3030; all listing endpoints now scoped in the service, from the token, before the caller’s own filters run.',
  },

  NPDP3050: {
    title: 'Process Design', band: 'teal',
    act: 'Process flow → tools and equipment → Testcontainers against real PostGIS because H2 cannot answer ST_DWithin → Playwright for the two browser layers → a tenancy audit that probes every write path → control plan.',
    out: 'Verification estate; control plan — every line of the tenancy audit must read blocked.',
  },
  NPDP3060: {
    title: 'Alpha Prototype + Preliminary Test', band: 'blue',
    act: 'Plan/build prototype → v0.1 on 15 August, commit 45cae0a → first build where a consignment could be booked, driven and received end to end → preliminary testing → update records.',
    out: 'Working full-stack build; preliminary test results.',
  },
  NPDP3070: {
    title: 'Alpha Prototype Review', band: 'blue',
    act: 'Check functionality, isolation, safety and target cost → revise product and process documents.',
    out: 'Finding: the receiving desk is cross-tenant by design, which hid that it is still bounded to one site — Bhiwandi could read Manesar’s board and gate its vehicles out. Returned to NPDP3030.',
  },
  NPDP3080: {
    title: 'Release Pre-Production Docs', band: 'blue',
    act: 'Controlled README, engineering guide and DEPLOYMENT.md → Swagger UI at /swagger-ui.html and the document at /v3/api-docs, both public while the endpoints they describe are not → distribute to stakeholders.',
    out: 'Released documentation set.',
  },
  NPDP3090: {
    title: 'Tooling & Equipment Planning', band: 'amber', adapted: true,
    act: 'ADAPTED — there is no physical tooling to plan and no equipment to install on a line. Make/buy → the build and deployment toolchain instead: two Dockerfiles, docker-compose for the local environment, the CloudFormation template for the deployed one.',
    out: 'Toolchain; the Testcontainers and Playwright estates any build must pass before release.',
  },
  NPDP3100: {
    title: 'Beta Prototype + Design V&V', band: 'purple',
    act: 'Build with production-intent configuration → verification: 82 API assertions signed in as two vendors, every write path probed as the wrong tenant, 39 pages in a real browser as every role, 26 interaction journeys → validation in the user environment → acceptance criteria met.',
    out: 'Verification and validation records. Finding: the browser was authoring vehicle positions, so three signed-in users saw three different answers. Returned to NPDP3030.',
  },
  NPDP3110: {
    title: 'Manufacturability Review', band: 'teal',
    act: 'Assess beta build issues → will it run on the target box — Hikari pool capped at 5, JVM footprint kept modest for a t3.micro → review control plan and process documents.',
    out: 'Finding: the simulator and the prediction engine kept different clocks, so the vehicle arrived before the estimate moved. Returned to NPDP3050.',
  },
  NPDP3120: {
    title: 'Intermediate Project Review', band: 'teal',
    act: 'Check schedule, cost, resources, risks and stakeholder alignment → revise plan if required.',
    out: 'Review record; verification estate green; isolation proven with two tenants.',
  },
  NPDP3130: {
    title: 'GATE-3 — Design Approval', gate: 3,
    basis: 'Gate-3 decision basis: design meets the PDS, verification and validation complete, and the product can run inside the fixed resource constraints.',
    approved: 'Design meets PDS and project plan; production preparation may begin.',
    action: 'Close Gate-3 actions, revise affected design and process records, and request re-review.',
    reject: 'Stop if the design cannot meet the PDS within the constraints.',
  },

  NPDP4010: {
    title: 'ECO Release', band: 'blue', spine: true,
    act: 'Whenever a design, configuration, document or schema change occurs: impact analysis → verification if required → approval → commit carrying what was wrong, why it was not visible and how it was proven fixed → update records.',
    out: '73 commits on the main branch, 15 August to 14 September. Every Phase 4 rework loop returns through here.',
  },
  NPDP4020: {
    title: 'Production Sourcing Preparation', band: 'amber', adapted: true,
    act: 'ADAPTED — there is no bill of materials to source and no supplier to qualify. Cloud resources selected and sized with the same discipline: region ap-south-1 → EC2 and RDS sized to the workload → load balancer, NAT gateway and multi-AZ database each ruled out on record because they bill hourly and none was needed.',
    out: 'Sized resource set; rejected-option record.',
  },
  NPDP4030: {
    title: 'Production Preparation', band: 'blue',
    act: 'Install and commission the environment → one CloudFormation stack, and one delete-stack removes all of it → images built on the instance because the link could not sustain a push to ECR → secrets reach the instance through user data, never the repository → capability study.',
    out: 'Deployed environment; operations scripts.',
  },
  NPDP4040: {
    title: 'Pre-Production Prototype', band: 'blue',
    act: 'Limited trials using the full deployed environment → inspect → gather capability feedback → verification checklist.',
    out: 'Running deployed instance; capability feedback.',
  },
  NPDP4050: {
    title: 'Production Verification', band: 'purple',
    act: 'Compare capability and throughput with the plan → qualify the environment → improvements and closure.',
    out: 'Two findings, neither visible locally: the routing service mislabelled its reply encoding so every booking silently drew a straight line; and the root volume filled until a deploy died inside a build layer, reporting a disk error as a build failure. Both returned to NPDP4010.',
  },
  NPDP4060: {
    title: 'Pre-Production Validation', band: 'purple',
    act: 'Design verification first → validation in the user environment: vendor books, driver starts and carries, receiving desk books the dock and raises the goods receipt, as three separately signed-in accounts → update records.',
    out: 'Finding: the API wedged under memory pressure with no limit and no watchdog, recoverable only by reboot. Returned to NPDP4010.',
  },
  NPDP4070: {
    title: 'Production Release Design Review', band: 'teal',
    act: 'Final review of updated product and process documents against tenancy, authorisation and write-path requirements.',
    out: 'Audit record, with residual gaps written down rather than quietly closed.',
  },
  NPDP4080: {
    title: 'Review Before Full-Scale Production', band: 'teal',
    act: 'Schedule, risks and readiness → decide whether a pilot run is required → confirm the environment recovers without a human: memory limit, watchdog on the healthcheck, and disk reclamation.',
    out: 'Readiness record.',
  },
  NPDP4090: {
    title: 'GATE-4 — Production Approval', gate: 4,
    basis: 'Gate-4 decision basis: the environment runs the design repeatably under its real constraints and recovers from failure unattended.',
    approved: 'Proceed toward launch; the environment is accepted for demonstration.',
    action: 'Gate concerns or failed criteria → implement improvements, update documents, close actions and re-present.',
    reject: 'Stop if the environment cannot be made to hold the workload.',
  },

  NPDP5010: {
    title: 'Publications & Training', band: 'blue',
    act: 'Complete the Final MVP Report covering purpose, components, source, outputs, issues and setup → README and new-environment instructions → three one-click demo accounts so a reviewer never types a password → train the reviewer path.',
    out: 'Final MVP Report; NPD flowcharts; README; demo accounts.',
  },
  NPDP5020: {
    title: 'Product Introduction Review', band: 'teal',
    act: 'Review pilot issues across the three portals against a freshly seeded database → verify every screen as every role → close actions.',
    out: 'Walkthrough record; closed actions.',
  },
  NPDP5030: {
    title: 'GATE-5 — Full-Scale Readiness', gate: 5,
    basis: 'Gate-5 decision basis: publications complete, the introduction review closed, and the deployed environment stable.',
    approved: 'Readiness confirmed before the demonstration, not after.',
    action: 'If readiness concerns exist, close action items and return for approval.',
    reject: 'Hold the launch if the environment is not stable.',
  },
  NPDP5040: {
    title: 'Launch & Full Scale', band: 'green',
    act: 'Demonstrate the deployed site live through the three portals → full running operation per the schedule → product support.',
    out: 'Live demonstration; running deployment.',
  },
  NPDP5050: {
    title: 'Feedback / Corrective Action', band: 'purple', spine: true,
    act: 'Field findings → lessons learned → corrective action → continuous improvement → DHF update.',
    out: 'Most recent: a consignment booked through the form never reached the receiving desk’s board, because the promised slot was a flat 36 hours from booking. Now costed from the pickup time against the same lane history the engine predicts with. Raised as an ECO at NPDP4010.',
  },
};
