const fs = require('fs');
const S = require('./style');
const d = S.d;

const SHOT = (n) => require('path').join(__dirname, 'shots', n + '.jpg');

const TITLE = 'Final MVP Report';
const SUBTITLE = 'Drishya — Real-Time Transport Visibility (RTTV)';

// --- title block -------------------------------------------------------

const titleBlock = [
  new d.Paragraph({ spacing: { before: 1200, after: 0 }, children: [] }),
  new d.Paragraph({
    spacing: { after: 60 },
    children: [new d.TextRun({ text: TITLE, font: S.FONT, size: 40, bold: true, color: S.NAVY })],
  }),
  new d.Paragraph({
    spacing: { after: 100 },
    children: [new d.TextRun({ text: SUBTITLE, font: S.FONT, size: 24, color: S.MUTED })],
  }),
  // The signature rule: a paragraph bottom border, not a table.
  new d.Paragraph({
    spacing: { after: 160 },
    border: { bottom: { style: d.BorderStyle.SINGLE, size: 16, color: S.ACCENT, space: 2 } },
    children: [],
  }),
  new d.Paragraph({
    spacing: { after: 0 },
    children: [new d.TextRun({
      text: '<Your Name / Emp ID>  ·  15 September 2026  ·  Version 1.0',
      font: S.FONT, size: 18, color: S.MUTED,
    })],
  }),
  new d.Paragraph({
    spacing: { before: 600, after: 0 },
    children: [new d.TextRun({
      text: 'TCS ILP · 27-Batch4-IAE · Release Documentation',
      font: S.FONT, size: 18, color: S.MUTED,
    })],
  }),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- table of contents -------------------------------------------------

const toc = [
  S.h1('Table of Contents'),
  new d.TableOfContents('Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 1. Purpose --------------------------------------------------------

const purpose = [
  S.h1('1.  Purpose'),

  S.h2('1.1  The problem'),
  S.body(
    'A vendor dispatching goods into a marketplace fulfilment centre loses sight of the vehicle the ' +
    'moment it leaves their own gate, and does not see it again until it arrives at the destination ' +
    'gate. Two costs fall out of that blind stretch.'),
  S.bullet('A delay is discovered when the delivery is refused at the dock, by which point the slot is gone, the vehicle is queued in the yard and the only remaining option is to rebook.'),
  S.bullet('A paperwork error is discovered weeks later, on a payment statement, with the dispute window already closing and no contemporaneous record left to argue from.'),
  S.body(
    'Both are failures of timing rather than of effort. The information existed early enough to act on ' +
    'in each case; nothing surfaced it while acting was still possible.'),

  S.h2('1.2  What the product does'),
  S.body('Drishya closes both gaps while they can still be acted on.'),
  S.bullet('It predicts dock-in time, not gate arrival. A vehicle at the gate of a busy site is not a vehicle that has delivered; the queue in the yard is often the larger half of the wait, and it is the half a gate-arrival estimate is silent about.'),
  S.bullet('It validates the advance shipping notice before dispatch. A rejection is returned as a successful validation with a negative answer and a list of what is wrong, so the correction happens at the vendor’s desk rather than at the receiving desk.'),
  S.bullet('It keeps an evidence pack per consignment — the driven trace, the geofence transitions, the documents and their validation history — as a chargeback dispute artefact rather than a debugging aid.'),
  S.rich([
    'Two timestamps are held on every consignment and neither may overwrite the other: ',
    { text: 'promisedAt', font: S.CODE_FONT, size: 20 },
    ', the slot agreed at booking, which never moves; and ',
    { text: 'predictedAt', font: S.CODE_FONT, size: 20 },
    ', what the platform currently believes. The gap between them is the entire product — a system that ' +
    'quietly moved the promise to match the prediction would always be on time and would be worth nothing.',
  ]),

  S.h2('1.3  Three portals over one shipment'),
  S.body(
    'There is a single shipment object and three views of it, each bounded to what that role is entitled ' +
    'to see. The demo cast is used throughout this document.'),
  S.caption('Table 1: Roles, and what each one is allowed to do'),
  S.table(
    ['Role', 'Demo account', 'Authority'],
    [
      ['Vendor (Priya)', 'priya@anandauto.example', 'Books the consignment, agrees a pickup time, submits the ASN, watches the vehicle. Owns no dock decision.'],
      ['Driver (Ramesh)', 'ramesh@fleet.example', 'Starts the trip, carries it, is told which dock to report to, signs the proof of delivery.'],
      ['Fulfilment centre (Imran)', 'imran@fcbhiwandi.example', 'Books the dock roughly an hour before arrival, gates the vehicle in and out, raises the GRN.'],
    ],
    [22, 34, 44]),
  ...S.figure(SHOT('13-fc-arrival-board'),
    'Figure 1: The receiving desk’s arrival board. The promised slot and the live estimate ' +
    'sit in adjacent columns with the variance between them — the gap the product exists to close.'),
  S.body(
    'Dock authority sits with the receiving desk on purpose. A vendor cannot know the state of a yard they ' +
    'cannot see, so the vendor is notified of the dock rather than choosing it, and the driver is given the ' +
    'bay number as instruction. The platform’s contribution is the hour of notice: an alert is raised when ' +
    'a trip is within the notice window of arriving with no settled appointment, computed from travel time ' +
    'with the expected yard queue subtracted, because that queue is long precisely when no dock is booked.'),

  S.h2('1.4  Why a cluster, and not a single-vendor tracker'),
  S.body(
    'One fulfilment centre draws inbound from many vendors, most of them too small to build this alone. ' +
    'Consignment data is strictly per tenant, but two tables are deliberately pooled across every tenant: ' +
    'how long each road segment took, and how long each dock took to turn a vehicle around. Neither ' +
    'identifies anybody, and both make every tenant’s prediction better as the cluster grows.'),
  S.body(
    'This is the part a single-vendor tracker cannot reproduce at any level of engineering effort. It does ' +
    'not have fewer engineers; it has fewer observations of the same road.'),

  S.h2('1.5  Scope, stated plainly'),
  S.bullet('Hardware is out of scope. GPS is simulated, ingest is HTTPS only, and there is no firmware, MQTT or raw socket code anywhere in the repository.'),
  S.bullet('No Kafka, Kubernetes or service mesh. At this volume a Spring application event and a scheduled job do the same work with none of the operational surface.'),
  S.bullet('No paid APIs. Map tiles are OpenStreetMap raster; routing uses two free public routers with a drawn fallback.'),
  S.bullet('No marketplace is named anywhere in code, copy, seed data or comments. The four sites are generic: Bhiwandi, Manesar, Whitefield, Sanand.'),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 2. CAD ------------------------------------------------------------

const cad = [
  S.h1('2.  Mechanical Design (CAD)'),
  S.rich([
    { text: 'Not applicable to this MVP, and deliberately so. ', bold: true },
    'Drishya is a software platform with no physical enclosure, no mechanism and no fabricated part. ' +
    'There is nothing to model, and a CAD drawing produced to satisfy a section heading would describe a ' +
    'product that does not exist.',
  ]),
  S.body(
    'The design artefact that carries the equivalent weight for this product is the system architecture, ' +
    'given in Section 3, together with the two sequence diagrams held in the repository README (rendered ' +
    'from Mermaid source, so they are versioned alongside the code rather than exported as images that ' +
    'drift out of date).'),
  S.caption('Table 2: The two diagrams that stand in place of a CAD model'),
  S.table(
    ['Diagram', 'Where it lives', 'What it fixes'],
    [
      ['System architecture', 'README.md — Mermaid graph', 'Which components exist, what runs off the request thread, and which two tables are shared across tenants'],
      ['Prediction chain', 'README.md — Mermaid sequence', 'The order of ingest, geofence evaluation, prediction and scoring, including what is asynchronous and what is not'],
    ],
    [24, 32, 44]),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 3. Component details ---------------------------------------------

const components = [
  S.h1('3.  Component Details'),

  S.h2('3.1  Runtime components'),
  S.caption('Table 3: What runs, and what it is'),
  S.table(
    ['Component', 'Technology', 'Role'],
    [
      ['API', 'Spring Boot 4.1 · Spring Framework 7 · Java 21 · Hibernate 7.4.1 · Jackson 3', 'All business logic, the whole wire contract, and every authorisation decision'],
      ['Database', 'PostgreSQL 16 + PostGIS 3.4, schema managed by Flyway (V1–V13)', 'Persistence and every spatial question — geofences and lane geometry are answered in PostGIS, never by hand-rolled Haversine in Java'],
      ['Web dashboard', 'React 19 · Vite 8 · React Router 7 · Leaflet 1.9 + React-Leaflet 5 · Recharts 3', 'The three portals. Context and useReducer in four slices; the bearer token is held in memory only'],
      ['Security', 'Spring Security 7, HS256 JWT, OAuth2 resource server, BCrypt', 'Per-role authorisation on every endpoint; tenant isolation enforced in the repository layer'],
      ['Prediction', 'Heuristic model in Java, optional ONNX Runtime 1.19.2 residual model', 'Dock-in estimate, recomputed every 60 seconds per active trip'],
      ['Routing', 'OSRM → BRouter → synthetic curve, behind one RoutingBackend interface', 'Real road geometry and real road distance, fixed once at booking'],
      ['Simulator', 'Python, HTTPS only', 'The only producer of SIMULATED position fixes. Stands in for hardware that is out of scope'],
      ['API documentation', 'springdoc-openapi 3.1', 'Swagger UI at /swagger-ui.html; the document is public, the endpoints it describes are not'],
    ],
    [20, 34, 46]),

  S.h2('3.2  Backend module map'),
  S.body('170 Java source files, laid out so that each concern has exactly one place to live.'),
  ...S.code([
    'domain/            JPA entities; domain/enums holds the wire vocabulary',
    'repo/              Spring Data repositories — tenant filtering belongs HERE',
    'dto/               what goes over the wire; dto/request holds request bodies',
    'service/           business logic; Mapper is the entity-to-DTO seam',
    'service/eta/       FeatureBuilder, EtaModel seam, schedulers, stale-trip job',
    'service/routing/   RoutingBackend chain, simplification, backfill job',
    'service/validation/ the ASN validator chain, one bean per rule',
    'web/               16 REST controllers + one @RestControllerAdvice',
    'config/            security chain, CORS, password hashing, async/scheduling',
    'seed/              deterministic dataset — fixed seeds, same data every boot',
  ]),
  S.rich([
    'Two design rules hold this together. First, ',
    { text: 'every enum carries an explicit wire value', bold: true },
    ' (at_gate, docs_pending, low-battery) that matches a key in the frontend’s constants.js exactly; ' +
    'renaming a Java constant is safe, but changing a wire value breaks the browser silently. Second, ',
    { text: 'timestamps cross the wire as epoch milliseconds', bold: true },
    ', never ISO strings, and Mapper.java is the only place that converts.',
  ]),

  S.h2('3.3  Web dashboard module map'),
  S.body('124 source files across three portals, with one rule that keeps the data flow in one direction.'),
  S.caption('Table 4: Frontend structure'),
  S.table(
    ['Area', 'Contents'],
    [
      ['pages/vendor', 'Dashboard, shipments, create-shipment wizard, shipment detail, live map, trips, documents, analytics, carriers, drivers, settings'],
      ['pages/driver', 'Today, scan, trip checklist, trip detail, proof of delivery with signature pad, documents, incident report, history, profile'],
      ['pages/fc', 'Arrival board, yard, receiving, dock scheduler, appointments, inbound detail, exceptions, vendors, analytics, dashboard, settings'],
      ['services/', 'The only code that knows the API is HTTP. client.js holds the base URL, the bearer token and the error mapping; no page or component calls fetch directly'],
      ['services/referenceData.js', 'Vendors, FCs, docks, vehicles and drivers, loaded once after sign-in and exposed synchronously — a select’s options cannot wait on a promise'],
      ['store/', 'Context plus useReducer in four slices. The browser never authors state; it polls'],
    ],
    [26, 74]),

  S.h2('3.4  Database'),
  S.body(
    'Thirteen Flyway migrations, with ddl-auto off. H2 was removed early: it has no spatial support, and ' +
    'every geofence and lane query in this system runs in PostGIS, so a test passing against H2 would have ' +
    'proved nothing about the query that ships. The local major version is pinned to 16 to match the ' +
    'deployment target, because a query that works on 17 locally and fails on 16 in production surfaces on ' +
    'the morning of a review.'),
  S.rich([
    { text: 'segment_speed_history', font: S.CODE_FONT, size: 20 },
    ' and ',
    { text: 'dock_turnaround_history', font: S.CODE_FONT, size: 20 },
    ' are the only two tables deliberately not tenant-scoped. That is the pooling described in Section 1.4, ' +
    'and it is a property to preserve rather than an oversight to fix.',
  ]),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 4. Electronics ----------------------------------------------------

const electronics = [
  S.h1('4.  Electronics and Circuit'),
  S.rich([
    { text: 'Not applicable, by design rather than by omission. ', bold: true },
    'There is no board, no sensor, no wiring and no firmware in this product. The scope decision was taken ' +
    'at the start and is recorded in the repository: ingest is HTTPS only, and no MQTT, serial or raw socket ' +
    'code exists anywhere in the codebase.',
  ]),
  S.body(
    'The reasoning is that the hard problem here is not acquiring a position — a telematics unit or a ' +
    'driver’s phone already does that, and a great many vehicles already carry one. The hard problem is ' +
    'what to conclude from a position: whether the vehicle will make its slot, whether the paperwork will ' +
    'hold, and whether the platform still knows where the vehicle is at all. Building a tracker box would ' +
    'have consumed the project and solved the part that was already solved.'),

  S.h2('4.1  What takes its place: position provenance'),
  S.rich([
    'Every position carries its ',
    { text: 'source', font: S.CODE_FONT, size: 20 },
    ' — SIMULATED or BROWSER — and the two must stay distinguishable in every API response. Evidentiary ' +
    'weight differs between a fix generated by the simulator and one taken from a driver’s browser, and the ' +
    'evidence pack is a dispute artefact, so it counts them separately rather than blending them into one ' +
    'reassuring number.',
  ]),
  S.body(
    'Browser positions also carry a constraint worth recording: geolocation refuses to run outside a secure ' +
    'context, so BROWSER fixes only exist on an HTTPS origin. That single fact drove the shape of the cloud ' +
    'deployment described in Section 8.'),

  S.h2('4.2  The ingest contract'),
  S.caption('Table 5: Position ingest'),
  S.table(
    ['Property', 'Behaviour'],
    [
      ['Transport', 'HTTPS, batch POST to /api/v1/trips/{id}/positions'],
      ['Response', '202 Accepted, with per-fix rejection reasons — a batch is partially acceptable'],
      ['Ordering', 'Fixes carry device time and receive time separately, so a dead zone that delays delivery does not reorder the trace'],
      ['Downstream', 'A Spring application event fires after commit; the geofence listener evaluates ST_DWithin against every site and writes a transition only on a zone change, never per fix'],
    ],
    [22, 78]),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 5. Source code ----------------------------------------------------

const source = [
  S.h1('5.  Source Code'),

  S.h2('5.1  Repository'),
  S.body(
    'Everything below lives in one public Git repository, github.com/nsi442/Drishya, on the main branch. ' +
    'There is no root build file: the backend and the web dashboard are two independent projects, and both ' +
    'paths contain a character that needs quoting in a shell — a space in "Drishya Frontend", a dot in ' +
    '"Drishya.Backend".'),
  ...S.code([
    'Drishya.Backend/                     Spring Boot 4.1 · Java 21 · port 8080',
    'Drishya Frontend/drishya_frontend/   React 19 · Vite · port 5173',
    'ml/                                  LightGBM training, ONNX export',
    'simulator/                           Python GPS simulator (HTTPS ingest)',
    'aws/                                 CloudFormation template and operations scripts',
    'db/                                  PostGIS container init',
    'docker-compose.yml                   PostgreSQL 16 + PostGIS',
  ]),

  S.h2('5.2  Cloud and deployment code'),
  S.caption('Table 6: Deployment and operations scripts'),
  S.table(
    ['File', 'What it does'],
    [
      ['aws/drishya.cfn.yaml', 'One CloudFormation stack: RDS PostgreSQL 16, EC2 for the API container, private S3 bucket for the bundle, one CloudFront distribution for TLS and routing'],
      ['aws/drishya-nocdn.cfn.yaml', 'The cheaper variant: EC2 plus RDS with an Elastic IP and no distribution'],
      ['aws/build-on-instance.sh', 'Builds both images on the instance, reclaims disk before and after, starts the containers under a memory limit and installs a watchdog on a two-minute cron'],
      ['aws/resize-instance.sh', 'Moves the stack between t3.micro and t3.small in one command, preserving every parameter it does not name'],
      ['aws/diagnose-db.sh', 'Read-only. RDS status and events, CloudWatch memory and CPU credits, then kernel OOM kills and container restart counts over SSM'],
      ['aws/repair-api.sh', 'Restarts a wedged API container without rebooting the instance'],
      ['scripts/teardown.sh', 'Deletes the stack and everything in it'],
    ],
    [30, 70]),
  S.rich([
    { text: 'No credential appears in the repository. ', bold: true },
    'The database master password and the JWT signing key live in a gitignored .aws-secrets.env on the ' +
    'operator’s machine. The deployment scripts read it and never print it. JWT_SECRET must be set in any ' +
    'environment that restarts: unset means a key generated per boot, which signs every user out on every ' +
    'deploy.',
  ]),

  S.h2('5.3  ML models'),
  S.body(
    'The model does not predict the arrival time. It predicts the residual of the Java heuristic — ' +
    'actual minutes minus heuristic minutes — and that choice is the whole reason the pipeline is viable at ' +
    'this data volume.'),
  S.body(
    'The heuristic already sums segment distances over pooled lane speeds and adds a pooled dock queue for ' +
    'the relevant hour, so it is a competent estimator on its own. Asking a model to relearn travel time ' +
    'from scratch would need hundreds of thousands of trips and would discard everything the arithmetic ' +
    'already knows. Asking it only "where is that arithmetic systematically wrong?" is a far smaller ' +
    'question, answerable on a few hundred trips — and it fails gracefully: a model that has learned ' +
    'nothing useful predicts a correction near zero, and the served estimate collapses back to the ' +
    'heuristic rather than to noise.'),
  S.caption('Table 7: The machine-learning pipeline'),
  S.table(
    ['File', 'What it does'],
    [
      ['ml/generate_synthetic_trips.py', 'Generates a labelled training set before any real trips exist'],
      ['ml/train.py', 'Fits three LightGBM quantile models at α = 0.1, 0.5 and 0.9, and exports to ONNX via onnxmltools'],
      ['service/eta/FeatureBuilder.java', 'The single implementation of the 12 features. It serves live predictions and writes the training export, so a train/serve mismatch cannot arise from two implementations drifting'],
      ['service/eta/OnnxEtaModel.java', 'Loads the model, verifies the recorded feature order against the order it is about to feed in, and refuses to serve on a mismatch'],
    ],
    [30, 70]),
  S.body(
    'Three quantiles rather than one point estimate, because a dispatcher deciding whether to rebook a slot ' +
    'needs the worst case: "16:40, and it could be 17:25" supports a decision that a bare "16:40" does not.'),
  S.rich([
    { text: 'Synthetic data is labelled as such everywhere. ', bold: true },
    'Training with --synthetic records trainedOnSyntheticData in features.json; the backend logs a warning ' +
    'on load, the API reports the flag, and the accuracy panel in the dashboard says so out loud. An ' +
    'accuracy figure measured on generated data describes the generator, not the road.',
  ]),

  S.h2('5.4  Dummy data scripts'),
  S.caption('Table 8: Seed and simulation'),
  S.table(
    ['File', 'What it does'],
    [
      ['seed/DataSeeder.java', 'Deterministic dataset built at boot from fixed seeds — the same 12 vendors, 4 sites, docks, carriers, vehicles and drivers on every run'],
      ['seed/TripSeeder.java', 'Books each seeded slot from FeatureBuilder’s own estimate rather than guessing, so the demo data cannot argue with the engine'],
      ['simulator/simulate.py', 'Drives a vehicle along a real lane and posts position batches over HTTPS, including a traffic stall and a network dead zone where fixes are taken but not sent until coverage returns'],
      ['scripts/csv-telemetry-feeder.py', 'Replays a CSV of fixes into a running system'],
      ['ml/generate_synthetic_trips.py', 'Training rows, clearly flagged as synthetic wherever the resulting model is used'],
    ],
    [30, 70]),
  S.rich([
    'One caveat learned in deployment and worth stating here: ',
    { text: 'DataSeeder skips entirely when vendors already exist', bold: true },
    ', which is correct — it must not overwrite a live database. The consequence is that a correction to ' +
    'seed data never reaches an already-populated environment. Seed corrections therefore ship as Flyway ' +
    'migrations, which is what V12 is.',
  ]),

  S.h2('5.5  Arduino / firmware'),
  S.rich([
    { text: 'None, and none is expected. ', bold: true },
    'See Section 4. The repository contains no .ino file, no serial code and no MQTT client, and the ' +
    'absence is a stated scope decision rather than unfinished work.',
  ]),

  S.h2('5.6  Web dashboard code (zip)'),
  S.body(
    'The dashboard source is packaged as a zip for upload to the Team Folder, as the release checklist ' +
    'requires. node_modules and the build output are excluded — both are regenerated by npm install and ' +
    'npm run build, and including them would multiply the archive size for no reader’s benefit.'),
  ...S.code([
    'Archive:  Drishya_WebDashboard_Source.zip',
    'Contents: Drishya Frontend/drishya_frontend/',
    '            src/           124 source files, three portals',
    '            public/        static assets',
    '            index.html     Vite entry',
    '            package.json   dependency manifest',
    '            vite.config.js dev proxy and preview proxy',
    '            eslint.config.js',
    'Excluded: node_modules/, dist/  (regenerated by npm install && npm run build)',
  ]),
  S.rich([
    { text: 'Team Folder link: ', bold: true },
    { text: '<paste the SharePoint / Teams link to the uploaded zip here>', color: 'C00000' },
  ]),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 6. Outputs --------------------------------------------------------

const outputs = [
  S.h1('6.  Outputs Obtained'),

  S.h2('6.1  The journey that works end to end'),
  S.body('Signed in as three separate accounts, against a running system:'),
  S.numbered('Priya books a consignment. A real road route is fetched and stored, with the router’s own carriageway distance — that distance goes straight into the prediction engine as an input.'),
  S.numbered('Priya submits the advance shipping notice. The validator chain runs; a missing e-way bill or a carton count that disagrees with the purchase order comes back as a rejection with the specific failures named, and dispatch stays blocked until they are corrected.'),
  S.numbered('Ramesh starts the trip from the driver portal. The simulation begins, positions arrive as batches, and the same vehicle is visible on all three portals from one dataset.'),
  S.numbered('The engine predicts dock-in every 60 seconds against pooled lane history, and raises DELAY_PREDICTED once per trip when the prediction leaves the booked slot.'),
  S.numbered('Roughly an hour out, the platform raises SLOT_REQUIRED at the receiving desk. Imran books a dock; Priya is notified of it and Ramesh is given the bay number.'),
  S.numbered('The geofence fires GATE_IN on the zone transition, not on every fix inside it. Imran gates the vehicle in, receives against the ASN and raises the GRN; Ramesh signs the proof of delivery.'),
  S.numbered('Every prediction made during the trip is scored against the actual dock-in, which is what makes the accuracy endpoint measured rather than claimed.'),

  S.h2('6.2  The vendor portal'),
  S.body(
    'Priya books the consignment, proves the paperwork and watches the vehicle. She has no dock '
    + 'controls at all — that authority moved to the receiving desk, and she is notified of the '
    + 'decision rather than making it.'),
  ...S.figure(SHOT('03-vendor-new-shipment'),
    'Figure 2: Booking, step one of five. The summary on the right fills in as the form is completed, ' +
    'and the delivery window is set from the pickup time rather than guessed at.'),
  ...S.figure(SHOT('04-vendor-shipment-detail'),
    'Figure 3: One consignment. "Promised slot" and "predicted arrival" are shown side by side and ' +
    'neither overwrites the other; the driver, vehicle, seal and e-way bill are one glance away.'),
  ...S.figure(SHOT('06-vendor-documents'),
    'Figure 4: Every document across every consignment, with its validation state. Two here will not ' +
    'clear the gate, and the page says so before the vehicles reach it rather than afterwards.'),
  ...S.figure(SHOT('02-vendor-shipments'),
    'Figure 5: The consignment list, filtered and sorted by what a dispatcher actually asks of it.'),
  ...S.figure(SHOT('01-vendor-dashboard'),
    'Figure 6: The vendor dashboard. Counts first, then where everything is, then what is at risk.'),

  S.h2('6.3  The driver portal'),
  S.body(
    'Ramesh starts the trip — the vendor no longer does — and the portal is built for a phone held ' +
    'in one hand at a gate. It states the connection plainly, because a driver in a dead zone needs ' +
    'to know whether what they just recorded has been sent.'),
  ...S.figureRow(
    [SHOT('08-driver-today'), SHOT('09-driver-trip'), SHOT('11-driver-pod')],
    'Figures 7–9: Today’s trips with the next one expanded; the trip itself, carrying the dock the ' +
    'receiving desk booked; and proof of delivery, counted and signed at the bay.'),

  S.h2('6.4  The receiving desk'),
  S.body(
    'Imran sees every vendor booked into his site and no vendor booked into any other. He books the ' +
    'dock, gates the vehicle in, receives against the advance shipping notice and raises the goods ' +
    'receipt.'),
  ...S.figure(SHOT('12-fc-dashboard'),
    'Figure 10: The site at a glance — what is inbound, what is at the gate, and what is on each bay.'),
  ...S.figure(SHOT('15-fc-dock-scheduler'),
    'Figure 11: The dock gantt. Blocks are dragged to reschedule, and a clash is flagged here rather ' +
    'than discovered at the gate.'),
  ...S.figure(SHOT('16-fc-receiving'),
    'Figure 12: Receiving. The count is checked against the advance shipping notice and each document ' +
    'against its validation state, before anything is accepted.'),
  ...S.figure(SHOT('14-fc-yard'),
    'Figure 13: The yard, with dwell time per vehicle and the detention thresholds that follow from it.'),
  ...S.figure(SHOT('17-fc-analytics'),
    'Figure 14: Site analytics — inbound volume, dock utilisation by hour, and what actually goes ' +
    'wrong at receiving, categorised.'),

  S.h2('6.5  Test results'),
  S.body(
    'Four layers of testing, because on this project each layer repeatedly passed while the layer above it ' +
    'was broken. curl proved the API healthy on a day the browser could not sign in at all; a ' +
    'single-tenant API test proved isolation while seven endpoints were leaking across tenants; a ' +
    'page-render check reported 39 of 39 pages clean while every one of them had in fact rendered the ' +
    'login screen.'),
  S.caption('Table 9: Test suites and what each one can see'),
  S.table(
    ['Suite', 'Scale', 'What it catches that the others cannot'],
    [
      ['./mvnw test (Testcontainers)', 'Real PostGIS', 'Spatial SQL. Hibernate 7 can emit different SQL than 6 for the same HQL, and H2 cannot answer ST_DWithin at all'],
      ['scripts/api-smoke-test.sh', '79 assertions', 'The wire contract end to end. Signs in as two vendors and asserts their shipments, documents and appointments do not intersect'],
      ['scripts/tenant-write-audit.py', 'Every write path', 'Mutations attempted as the wrong tenant. Every line must read "blocked", and every probe uses a well-formed body — a 400 proves nothing about authorisation'],
      ['scripts/ui-smoke.mjs', '39 pages, every role', 'What curl cannot see. Fails if a whole portal renders identical content, or if a map collapses to zero height'],
      ['scripts/ui-journeys.mjs', '26 journeys', 'Real interaction: paperwork rejected then corrected, dispatch blocked then allowed, evidence pack downloaded, proof of delivery signed'],
    ],
    [26, 16, 58]),

  S.h2('6.6  Measured results'),
  S.body('Numbers taken from instrumented runs, not from estimates.'),
  S.caption('Table 10: Before and after, on changes that were measured'),
  S.table(
    ['Measure', 'Before', 'After'],
    [
      ['Road distance shortfall against the router’s own figure', '7.8% short', '0.18% short'],
      ['Longest straight segment on a drawn route', '255 km', '10.6 km'],
      ['Poll payload, receiving desk feed, real routes', '102.6 KB', '20.3 KB'],
      ['Unrouted consignments left after unattended backfill', '60 synthetic', '0'],
      ['Routing attempts across 9 cycles with the router dead', '(no backoff)', '2, then recovery within one cycle of its return'],
    ],
    [40, 26, 34]),
  S.body(
    'The ETA accuracy endpoint reports mean absolute error in minutes, overall and per lane, computed from ' +
    'predictions scored against actual dock-in. It is deliberately mean absolute error rather than mean ' +
    'error: an estimator that is forty minutes early as often as it is forty minutes late has a mean error ' +
    'near zero and is useless.'),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 7. Issues ---------------------------------------------------------

const issues = [
  S.h1('7.  Issues Encountered, and How They Were Fixed'),
  S.body(
    'These are the faults that cost real time, grouped by the kind of mistake rather than by the order they ' +
    'appeared. Each is recorded with what it looked like from outside, because in almost every case the ' +
    'symptom pointed somewhere other than the cause.'),

  S.h2('7.1  Faults where nothing reported an error'),
  S.caption('Table 11: Silent failures'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['Every getter "cannot find symbol" after moving to JDK 23', 'JDK 23 disabled implicit annotation processing, so Lombok on the classpath was no longer discovered and silently generated nothing', 'An explicit maven-compiler-plugin block declaring -proc:full and annotationProcessorPaths'],
      ['An endpoint every portal polls started returning 500', 'Adding an overload to a @Transactional method left the annotation on the old arity. Spring’s advice lives in a proxy, so the new method ran with no session and Mapper threw LazyInitializationException on its first lazy hop', 'Annotate every arity that is an entry point'],
      ['A new alert type compiled, started and passed every test, then failed the first time the feature did its job', 'Hibernate persists these enums by name and alerts.type carries a CHECK constraint listing the accepted names. The constraint had never heard of the new value', 'An enum constrained in the schema is a three-file change: Java enum, frontend vocabulary, and a migration'],
      ['A job logged that it had notified the receiving desk when it had notified nobody', 'try/catch per item inside a method-level @Transactional. The first failed insert marked the transaction rollback-only; every later item died, and the counted row was rolled back with the rest', 'A per-item transaction boundary via TransactionTemplate, and re-read the entity inside its own transaction — the one from the listing is detached'],
      ['Every hasRole check failed while the token itself validated perfectly', 'JwtGrantedAuthoritiesConverter defaults to the scope claim with no prefix, yielding an authenticated principal holding no authorities', 'Set the claim name and the ROLE_ prefix explicitly'],
    ],
    [26, 42, 32]),

  S.h2('7.2  Faults where a default looked like an answer'),
  S.caption('Table 12: Defaults that hid the bug that produced them'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['Every consignment in the receiving queue read "No dock", including four standing on a numbered bay', 'A ?? fallback on row.dockName — a field the DTO has never carried. The screen looked like a working page reporting an empty yard', 'Derive the name from dockId through referenceData.dockName(), as every other screen does'],
      ['A consignment the platform had lost track of displayed a confident "On time"', 'A missing delay defaulted to zero — the reassuring answer in the one case that warrants none', 'Render "no estimate" when the value is absent'],
      ['"ETA 05:30 am · 20695d ago", in the same typeface as a real arrival', 'A null handed to new Date(null) is epoch zero', 'Absent is not zero. Both formatters now return "no estimate"'],
      ['A trip left running reported itself 85 hours late, from arithmetic correct at every step', 'Nothing could say "I have lost this vehicle", so ignorance was expressed in the language of precision', 'FeatureBuilder refuses a fix older than two hours, TripService reports TRACKING_LOST and suppresses the estimate, and StaleTripJob closes a trip ABANDONED after 24 silent hours'],
    ],
    [28, 38, 34]),

  S.h2('7.3  Faults in tenancy and authorisation'),
  S.caption('Table 13: Isolation holes, and why the suite stayed green through them'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['Every authenticated caller received all 59 alerts across all 12 vendors', 'The tenancy work scoped the entities it added and left the inherited repositories alone. A full audit found the same hole in shipments, documents, appointments, exceptions, analytics and vendors', 'Every listing endpoint scoped in the service, from the token, before the caller’s own filters run'],
      ['The receiving desk at one site could read another site’s arrival board, yard, queue and analytics, and gate its vehicles out', 'The FC role is deliberately cross-tenant, and that made it easy to forget it is still bounded to one site. Every route took the site id straight from the path', 'requireSite and requireInbound derive the site from the token and reject a mismatch. When a role is cross-tenant, ask what else bounds it'],
      ['Writes were unprotected while reads were scoped', 'Reads were scoped first and writes were missed — the wrong way round. Reading another tenant’s data is bad; silently cancelling their delivery is worse', 'Every write path goes through one loader, so a method added later inherits the check instead of remembering to ask'],
      ['A bulk endpoint let any tenant stamp any consignment, and escaped the write-path audit entirely', 'The audit probed only /{id}/... routes, and this one took ids in the body', 'A bulk endpoint is still a write. The endpoint now reports position only'],
      ['Two write paths looked unprotected and two looked protected when they were not', 'The probes used a malformed body, which is rejected before authorisation runs', 'A 400 is not a "blocked". Every probe now uses a well-formed body'],
    ],
    [26, 40, 34]),

  S.h2('7.4  Faults where two components each held an opinion'),
  S.caption('Table 14: Disagreements between components'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['Three people signed in meant three answers to "where is this lorry", all confident, none of them the platform’s', 'The browser hook was a simulation: each tab advanced its own copy of every moving consignment, invented its own delays, and posted the result back over whatever the server had', 'The browser never authors state; it polls. A client that can author a position is a client that can disagree with the platform about where a lorry is'],
      ['A consignment showed "108 h late" from seeded timestamps days in the past', 'POST /shipments/live accepted a client-supplied predictedAt and wrote it onto the shipment, so the browser and the engine were both authoring one field with no arbiter', 'The arrival estimate has one owner: the ETA engine'],
      ['A gate-in was silently reverted by a position from the same batch', 'Two listeners write the same unversioned row from one batch; each loaded copy writes the whole row, and the second to commit undoes the first', 'A @Modifying update naming four columns, with the delivered/cancelled guard in the WHERE clause. A targeted update cannot clobber a column it does not mention'],
      ['Table, map pin and progress bar disagreed with the trips page about the same vehicle', 'The server drove the trip, but the shipment’s own position, progress and remaining distance were written by nothing on the server at all', 'A listener projects the newest fix onto the consignment. Two representations of one lorry will diverge unless something joins them'],
      ['Demo data showed "8 h 45 m late" against a slot the seeder had itself chosen', 'The seeder estimated arrival independently of the engine, which costs each stretch at hour-bucketed history and swings by a third across peak and night', 'Seeded data asks the engine. Demo data that argues with the engine reads as a broken engine'],
    ],
    [26, 40, 34]),

  S.h2('7.5  Faults in talking to third parties'),
  S.caption('Table 15: Routing and the network'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['Every booking on the deployed site drew a straight line, while the same container could fetch the same URL with curl in half a second', 'The client advertised gzip, the router’s proxy obliged, and the reply was labelled gzip with a body already decompressed. Inflation happens inside the HTTP client while the body is still being read — before any converter, so it cannot be rescued, only avoided', 'Accept-Encoding: identity, applied centrally so a new backend cannot forget it. A route is tens of kilobytes fetched once per booking'],
      ['A router closed the connection: "header parser received no bytes", naming nothing', 'RestClient.uri(String) encodes its argument again, so a pre-encoded pipe became %257C and the far end could not split the coordinates', 'Build a URI with UriComponentsBuilder and pass that — a URI is sent through untouched'],
      ['The diagnosis cost days because the log said only "RestClientException"', 'The catch logged e.getClass().getSimpleName() and nothing else — the base class Spring throws for several unrelated reasons, naming none of them', 'A fallback that is meant to be invisible needs a log line that is not. The message and the root cause are both logged now'],
      ['Twenty-three straight lines on the map with nothing to say why', 'A route is chosen once at booking, so a router unreachable for one second leaves that consignment a straight line for life. The repair existed, but only behind an endpoint someone had to know about', 'A repair that requires an operator to notice is not a repair. A job runs the same work on a timer until nothing is drawn, backing off while the router stays dead'],
      ['One free router with no SLA was the single point of failure', 'A second OSRM mirror would have shared the first one’s fate — router.project-osrm.org resolves to the same host as the obvious alternative', 'A chain of genuinely independent backends: OSRM, then BRouter (different operator, different software, free and keyless), then the drawn curve'],
    ],
    [26, 40, 34]),

  S.h2('7.6  Faults in deployment and operations'),
  S.caption('Table 16: Running it on real infrastructure'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['The site returned 503 after a routine rebuild', 'A prune between build and start deleted the freshly built images — they had no container yet, so they were exactly the ones considered unused, while the old ones were protected', 'Prune after the containers are running. docker image prune -a removes images not used by a container, not "old" ones'],
      ['The API wedged and only a reboot brought it back', 'State accumulated in-process and nothing could restart it. The image carried a HEALTHCHECK that nothing acted on — --restart always restarts on exit, not on unhealthy', 'A watchdog on a two-minute cron that reads the health state and restarts the container, plus a container memory limit and a JVM heap percentage under it'],
      ['A deploy failed with "No space left on device"', 'Build layers, stopped containers and unrotated JSON logs had filled a fixed allowance', 'Reclaim disk before the build and again after the new containers are up; truncate container logs and vacuum the journal'],
      ['A log-truncation step reported success and truncated nothing', 'Quoting was wrong inside the shell snippet, so it addressed a filename containing literal quotes — and exited zero', 'Replaced with find -exec truncate, and verified by checking the file size rather than the exit code'],
      ['A seed correction never reached the deployed database', 'DataSeeder skips entirely when vendors exist, which is correct, and RDS persists across deploys', 'Ship seed corrections as Flyway migrations, and reproduce the deployed state locally before claiming a fix'],
      ['The production build loaded every page empty, which read as an application fault', 'vite preview does not inherit server.proxy, so the built bundle could not reach the API', 'Declare preview.proxy as well. preview is the only way to see the build the deploy ships — dev runs StrictMode, which double-invokes effects and doubles any request count measured there'],
    ],
    [26, 40, 34]),

  S.h2('7.7  Faults in the user interface'),
  S.caption('Table 17: Interface and accessibility'),
  S.table(
    ['Symptom', 'Cause', 'Fix'],
    [
      ['A goods-receipt form reset itself every five seconds while it was being filled in', 'The async hook flashed "loading" on every background refresh, so the form remounted and reset to the ASN carton count', 'Distinguish first load from refresh: keep the data and report "refreshing". Reproduced as 137 → 100 broken, 137 → 137 fixed'],
      ['"Docks occupied 0/0" beside "2 unloading now" on the same screen', 'Nine useMemo calls over a mutable reference-data singleton cached an empty snapshot taken before it was filled', 'Subscribe with useSyncExternalStore and notify on load. Proved by contrast with an inline read on the same render'],
      ['A form field was unlabelled for a screen reader, and clicking its label focused nothing', 'The input component already wraps the field component; nesting the two produced an outer label pointing at an id no input has. It rendered perfectly', 'Pass label and hint straight through. Caught only by a test trying to fill the form by label'],
      ['The map overlapped the page, so a shipment could not be cancelled', 'Leaflet places its panes at z-index 400 and its controls at 1000, which outrank most page chrome', 'Give the map container its own stacking context with isolation: isolate'],
      ['The newest consignment was missing from the driver’s list', 'A slice of the first four items, and a label that called everything "Later today"', 'Remove the slice, compute the label from the actual time'],
      ['"Simulation is not starting" when the driver pressed start', 'Moving trip-start to the driver changed the security rules but not the controller, which still demanded a vendor tenant and answered 403', 'Derive the tenant from the consignment, but only after proving the consignment is theirs'],
    ],
    [26, 40, 34]),

  S.h2('7.8  What the testing was actually worth'),
  S.body(
    'Two of the most useful lessons came from tests that passed while proving nothing, and both are now ' +
    'guarded against in the suites themselves.'),
  S.bullet('A browser test that navigated with a full page load lost the in-memory bearer token, made zero API calls, and passed. It was re-done with in-application navigation.'),
  S.bullet('A single-tenant API test cannot tell a scoped feed from an unscoped one. Fail closed, and prove it with two tenants — this is exactly why the leak survived a green suite for so long.'),

  S.h2('7.9  Known and open, stated rather than hidden'),
  S.bullet('There is no refresh token and no revocation list, so a leaked token is valid until it expires after twelve hours. This is a deliberate scope decision, not an oversight.'),
  S.bullet('TRACKING_LOST is computed correctly by the backend but is not yet distinguishable in the interface — the risk badge collapses it to "no prediction" and the map pin stays green.'),
  S.bullet('Two authorisation gaps remain open and are verified by probe: a driver can cancel a consignment, and any authenticated caller can resolve a receiving exception.'),
  S.bullet('There are two map pages over one dataset. They no longer contradict each other now the store is server-fed, but they should be consolidated.'),
  new d.Paragraph({ children: [new d.PageBreak()] }),
];

// --- 8. Setup ----------------------------------------------------------

const setup = [
  S.h1('8.  Setting the Product Up in a New Environment'),

  S.h2('8.1  Prerequisites'),
  S.caption('Table 18: What must be installed'),
  S.table(
    ['Requirement', 'Version', 'Needed for'],
    [
      ['Docker and Docker Compose', 'Any current release', 'The one-command path, and the database in every path'],
      ['JDK', '21 or later', 'Building and running the API outside Docker'],
      ['Node.js', '20 or later', 'Building and running the web dashboard outside Docker'],
      ['Python', '3.10 or later', 'The simulator, the audit scripts and the ML pipeline — all optional'],
      ['Git', 'Any current release', 'Cloning the repository'],
    ],
    [34, 22, 44]),

  S.h2('8.2  The whole system, in one command'),
  S.body('This is the path to use for a demonstration or a first look. It needs nothing installed but Docker.'),
  ...S.code([
    'git clone https://github.com/nsi442/Drishya.git',
    'cd Drishya',
    'docker compose up --build',
  ]),
  S.caption('Table 19: What comes up'),
  S.table(
    ['Service', 'Address'],
    [
      ['Web dashboard', 'http://localhost:5173'],
      ['API', 'http://localhost:8080'],
      ['Swagger UI', 'http://localhost:8080/swagger-ui.html'],
      ['Database', 'PostgreSQL 16 + PostGIS on the compose network'],
    ],
    [34, 66]),
  S.body(
    'Flyway applies all thirteen migrations on first boot and the seeder builds the demo dataset from fixed ' +
    'seeds, so the same data appears every time. Nothing reaches outside the machine except OpenStreetMap ' +
    'tiles and, at booking, the public routing service.'),

  S.h2('8.3  Development, with hot reload on both applications'),
  ...S.code([
    'docker compose up -d db                         # PostgreSQL 16 + PostGIS only',
    '',
    'cd Drishya.Backend',
    './mvnw spring-boot:run                          # http://localhost:8080',
    '',
    'cd "Drishya Frontend/drishya_frontend"',
    'npm install && npm run dev                      # http://localhost:5173',
  ]),
  S.rich([
    { text: 'Start the API before the dashboard. ', bold: true },
    'Vite proxies /api to port 8080, so the browser stays on one origin and CORS never enters into it in ' +
    'development. Note also that both project paths contain a character that needs quoting — a space in ' +
    '"Drishya Frontend", a dot in "Drishya.Backend".',
  ]),
  S.body(
    'On a machine where JAVA_HOME is set to a Windows 8.3 short path, Git Bash cannot resolve it and mvnw ' +
    'fails with "JAVA_HOME is not defined correctly". Either correct it permanently, or prefix the command:'),
  ...S.code([
    'JAVA_HOME="/c/Program Files/Java/jdk-23" ./mvnw compile',
  ]),

  S.h2('8.4  Signing in'),
  S.body('Password drishya for all of them; the sign-in screen has one-click buttons.'),
  S.caption('Table 20: Demo accounts'),
  S.table(
    ['Role', 'Email'],
    [
      ['Vendor admin', 'priya@anandauto.example'],
      ['Dispatcher', 'arjun@nimbustextiles.example'],
      ['Driver', 'ramesh@fleet.example'],
      ['Fulfilment centre', 'imran@fcbhiwandi.example'],
    ],
    [34, 66]),

  S.h2('8.5  Configuration that matters in a real environment'),
  S.caption('Table 21: Environment variables'),
  S.table(
    ['Variable', 'Default', 'Why it matters'],
    [
      ['JWT_SECRET', 'A key generated per boot', 'Must be set, and at least 32 characters, in any environment that restarts. Unset means every user is signed out on every deploy'],
      ['SPRING_DATASOURCE_URL / USERNAME / PASSWORD', 'The compose database', 'Point these at the managed database when there is one'],
      ['SIM_TIME_SCALE', '12', 'How fast the simulated vehicle appears to move. 1.0 is real time, which is the honest setting for measuring rather than showing'],
      ['SIM_SPEED_KMPH', '52', 'Should stay near this value — it is what the lane history was measured against, so changing it makes the engine disagree with the vehicle'],
      ['ROUTING_BROUTER_URL', 'https://brouter.de', 'Blank switches the second router off without switching routing off'],
      ['INTERNAL_SERVICE_TOKEN', 'Unset', 'Guards the training-data export. Required only when training a model'],
    ],
    [30, 24, 46]),

  S.h2('8.6  Watching a vehicle move'),
  ...S.code([
    'pip install -r simulator/requirements.txt',
    'python simulator/simulate.py --shipment SHP-24025 --time-scale 120',
  ]),
  S.body(
    'A six-hour run replays in about three minutes, with a traffic stall and a network dead zone included. ' +
    '--vehicles 4 puts four trucks on the lane at once. The simulator is the only producer of SIMULATED ' +
    'positions; the alternative source is a driver’s browser, which requires a secure origin.'),

  S.h2('8.7  Deploying to a cloud environment'),
  S.body(
    'One CloudFormation stack holds everything, and one delete-stack removes all of it. The full procedure ' +
    'is in AWS-DEPLOYMENT.md, with the one-time account setup in FIRST-TIME-AWS.md.'),
  ...S.code([
    'bash aws/deploy-nocdn.sh          # create or update the stack',
    'bash aws/build-on-instance.sh     # build both images on the instance and start them',
    'bash aws/diagnose-db.sh           # read-only health check if something looks wrong',
    'bash scripts/teardown.sh          # delete the stack and everything in it',
  ]),
  S.body('Three shape decisions are worth carrying to any other target:'),
  S.bullet('HTTPS is not optional. Browser geolocation refuses to run outside a secure context, and an HTTPS page calling an HTTP API is blocked outright as mixed content.'),
  S.bullet('Serve the bundle and the API from one origin. The browser then never makes a cross-origin request, and CORS — the first thing that breaks on a split deploy — is removed as a category rather than configured.'),
  S.bullet('Do not rewrite API 404s into the single-page application shell. This API answers 404 rather than 403 for another tenant’s record on purpose, and a distribution-wide error rule would turn that into a 200 and break both the tenancy contract and the dashboard’s error handling.'),

  S.h2('8.8  Verifying the installation'),
  S.body('Run these in order. Each one sees faults the others cannot.'),
  ...S.code([
    'bash Drishya.Backend/scripts/api-smoke-test.sh      # 79 assertions, both servers up',
    'python Drishya.Backend/scripts/tenant-write-audit.py # every line must say "blocked"',
    'node Drishya.Backend/scripts/ui-smoke.mjs           # 39 pages, every role, real browser',
    'node Drishya.Backend/scripts/ui-journeys.mjs        # 26 interaction journeys',
    'cd Drishya.Backend && ./mvnw test                   # real PostGIS via Testcontainers',
  ]),
  S.body(
    'All of them are safe to re-run. If the tenant audit prints anything other than "blocked" on every ' +
    'line, stop and treat it as a release blocker — it is the one suite whose failure means data belonging ' +
    'to one customer is reachable by another.'),
];

// --- assemble ----------------------------------------------------------

const doc = new d.Document({
  creator: 'Drishya Team',
  title: TITLE,
  description: SUBTITLE,
  styles: {
    // Overriding the BUILT-IN entries rather than adding new ones. Declaring
    // Heading1 under paragraphStyles appends a second style with the same id,
    // leaving Word's default blue definition first in the file — the headings
    // still render correctly only because every heading run also carries
    // explicit formatting, which is not something to rely on.
    default: {
      document: { run: { font: S.FONT, size: 22, color: '000000' },
                  paragraph: { spacing: { line: 276, after: 160 } } },
      title: { run: { font: S.FONT, size: 40, bold: true, color: S.NAVY } },
      heading1: { run: { font: S.FONT, size: 28, bold: true, color: S.NAVY },
                  paragraph: { spacing: { before: 360, after: 120 } } },
      heading2: { run: { font: S.FONT, size: 24, bold: true, color: S.ACCENT },
                  paragraph: { spacing: { before: 240, after: 80 } } },
      heading3: { run: { font: S.FONT, size: 22, bold: true, italics: true, color: '000000' },
                  paragraph: { spacing: { before: 200, after: 60 } } },
      heading4: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading5: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      heading6: { run: { font: S.FONT, size: 22, bold: true, color: '000000' } },
      // The table of contents is generated with hyperlinks; left alone they
      // arrive in Word's default link blue, which is not in this palette.
      hyperlink: { run: { font: S.FONT, size: 22, color: '000000' } },
      listParagraph: { run: { font: S.FONT, size: 22, color: '000000' } },
      strong: { run: { font: S.FONT, bold: true } },
      footnoteText: { run: { font: S.FONT, size: 18, color: S.MUTED } },
      footnoteTextChar: { run: { font: S.FONT, size: 18, color: S.MUTED } },
      endnoteText: { run: { font: S.FONT, size: 18, color: S.MUTED } },
      endnoteTextChar: { run: { font: S.FONT, size: 18, color: S.MUTED } },
    },
  },
  numbering: {
    config: [
      {
        reference: 'house-bullets',
        levels: [
          { level: 0, format: d.LevelFormat.BULLET, text: '•', alignment: d.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 360 } },
                     run: { font: S.FONT, size: 22 } } },
          { level: 1, format: d.LevelFormat.BULLET, text: '–', alignment: d.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } },
                     run: { font: S.FONT, size: 22 } } },
        ],
      },
      {
        reference: 'house-numbers',
        levels: [
          { level: 0, format: d.LevelFormat.DECIMAL, text: '%1.', alignment: d.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 360, hanging: 360 } },
                     run: { font: S.FONT, size: 22 } } },
          { level: 1, format: d.LevelFormat.LOWER_LETTER, text: '%2.', alignment: d.AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } },
                     run: { font: S.FONT, size: 22 } } },
        ],
      },
    ],
  },
  features: { updateFields: true },
  sections: [
    // Title page: no header, no footer.
    {
      properties: { page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } } },
      children: titleBlock.slice(0, -1),
    },
    {
      properties: {
        page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
      },
      headers: {
        default: new d.Header({
          children: [new d.Paragraph({
            alignment: d.AlignmentType.RIGHT,
            children: [new d.TextRun({ text: TITLE + ' — ' + SUBTITLE, font: S.FONT, size: 18, color: S.MUTED })],
          })],
        }),
      },
      footers: {
        default: new d.Footer({
          children: [new d.Paragraph({
            alignment: d.AlignmentType.CENTER,
            children: [
              new d.TextRun({ text: 'Page ', font: S.FONT, size: 18, color: S.MUTED }),
              new d.TextRun({ children: [d.PageNumber.CURRENT], font: S.FONT, size: 18, color: S.MUTED }),
              new d.TextRun({ text: ' of ', font: S.FONT, size: 18, color: S.MUTED }),
              new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], font: S.FONT, size: 18, color: S.MUTED }),
            ],
          })],
        }),
      },
      children: [
        ...toc,
        ...purpose,
        ...cad,
        ...components,
        ...electronics,
        ...source,
        ...outputs,
        ...issues,
        ...setup,
      ],
    },
  ],
});

d.Packer.toBuffer(doc).then((buf) => {
  const out = process.argv[2] || 'Final MVP Report_Drishya.docx';
  fs.writeFileSync(out, buf);
  console.log('wrote', out, buf.length, 'bytes');
});
