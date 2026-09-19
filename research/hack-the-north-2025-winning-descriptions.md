# Hack the North 2025: notes on all 54 winning project descriptions

Reviewed September 19, 2026. Sources: the [official event page](https://hackthenorth2025.devpost.com/), [project gallery](https://hackthenorth2025.devpost.com/project-gallery), and every winning project's linked submission below.

I found **54 distinct public projects marked Winner: 12 overall finalists and 42 additional sponsor-prize winners**. Puppeteer and Tango also won sponsor prizes; they appear once, with the finalists. The two projects named SpeakEasy are different submissions.

These notes assess the current public descriptions and their visible supporting material. They do not establish why judges chose a project, verify every technical or performance claim, or establish that today's text is identical to the text submitted in 2025. A sponsor award also should not be interpreted as an overall finalist placement.

## What to learn from this collection

The official judging criteria were **WOW factor, technical ability, originality, and design**. A useful description gives a judge concrete evidence for those criteria: a memorable result, understandable engineering, a distinct interaction or approach, and a coherent user experience. The official page does not establish that any particular prose formula wins.

The most useful recurring writing pattern is:

**Specific problem → visible user action → concrete output → difficult implementation decision → evidence and limitations.**

Several lessons stand out across the submissions:

- **Make the experience easy to picture.** ChessMate moves physical chess pieces; S-KBD67 turns a Nerf blaster into a game controller; Tango acts on the user's clipboard. These concepts can be understood before the technology is explained.
- **Explain the path between input and output.** DUM-E's perception-to-actuation pipeline and Sematic's diagram-state-to-structured-command loop make the team's contribution legible.
- **Name a real engineering decision.** Stu3dio's dependency tracking, VibeMovie's shared composition state, and RepoStory's approach to selecting commits tell the reader more than a list of libraries.
- **Connect challenges to solutions.** A challenge earns its space when it explains why the final system works differently from the first attempt.
- **Be precise about what worked.** ROSS explicitly acknowledges an unsuccessful feature. SpectraSphere distinguishes delivered image generation from planned video generation. Honest scope is compatible with a winning submission.
- **Length varies substantially.** Stu3dio is compact; several sponsor winners have very short descriptions; others are lengthy and repetitive. More words are not evidence of a stronger project.
- **Sponsor relevance is usually clearest when it is functional.** Explain what the sponsor's technology does in the demonstrated workflow. Name-dropping alone gives little information.
- **An award does not validate every sentence.** Some pages make unsupported superlative, accuracy, speed, or business-impact claims. Borrow their useful structure without copying those weaknesses.

## The 12 overall finalists

### 1. DUM-E

[Project page](https://devpost.com/software/dum-e-kgx6at) · **Overall finalist**

**What the description establishes:** A robotic arm that accepts natural-language requests to manipulate objects. The Iron Man reference provides a quick visual hook, followed by concrete tasks such as sorting parts and holding tools.

**What works in the writing:** The implementation is a causal sequence: webcam perception and OpenCV processing, multimodal interpretation, a Flask service on a Raspberry Pi, Arduino control, inverse kinematics, and physical movement. Its difficulties are specific to the device: servo calibration, lighting, latency, and power delivery. Those details substantiate that the team built and integrated a physical system.

**Technique to borrow:** Give the reader a numbered path from the user's request to the observed result. Include the transformation at each step, not just the component's name.

**What to improve or verify:** Precision and low latency would be more persuasive with an actual task-success example and measured timing. For Composition, the analogous explanation is the exact path from a scene edit to the information sent to the generation model.

### 2. SpeakEasy — interview coach

[Project page](https://devpost.com/software/speakeasy-vdkc9n) · **Overall finalist**

**What the description establishes:** An interview-practice tool centered on applicants, with question generation, recorded answers, and verbal and nonverbal feedback.

**What works in the writing:** The page explains why its processing differs from ordinary transcription. It keeps a version containing filler words for delivery analysis and another for content analysis. AssemblyAI, language models, NLP, and MediaPipe each have an identifiable role. Validation and retry behavior help explain how generated feedback becomes usable output.

**Technique to borrow:** Describe one important representation or preprocessing choice and the user benefit it enables. “We preserve X because the next stage needs it to evaluate Y” is strong technical writing.

**What to improve or verify:** The density makes the primary experience harder to scan. Claims about fair or useful assessment need evaluation; a broad list of feedback categories does not establish their accuracy.

### 3. Maatchaa

[Project page](https://devpost.com/software/maatchaa) · **Overall finalist**

**What the description establishes:** A product-to-creator matching workflow connecting Shopify products with YouTube Shorts, using a familiar swiping interaction and creator approval.

**What works in the writing:** The description identifies both participants and follows the action through to a useful outcome. Embeddings, selection, video analysis, and product imagery are described through their roles in that flow. This keeps several AI services from becoming an unexplained technology list.

**Technique to borrow:** Explain the entire transaction or creative loop: who starts it, what they choose, what the system generates, who approves it, and what happens afterward.

**What to improve or verify:** Matching quality is asserted rather than demonstrated with a clear evaluation. One worked example of why a particular product and creator belong together would strengthen the page.

### 4. Puppeteer

[Project page](https://devpost.com/software/puppeteer-7429qv) · **Overall finalist; Warp developer-tool prize**

**What the description establishes:** A development tool for exercising frontend behavior when the backend or relevant data is not ready, using runtime probes and mutations.

**What works in the writing:** It starts with a recognizable engineering bottleneck and connects its mechanism to the development work that becomes possible. The terminal interface, model-selected probes, and runtime changes form a coherent system. Before-and-after material and an architecture diagram help explain an otherwise abstract concept.

**Technique to borrow:** Present a specific blocked task, explain the intervention, then show the task becoming possible. Use a diagram when the relationships are difficult to communicate in prose.

**What to improve or verify:** Runtime probing is still abstract without a small example of a variable, mutation, and visible UI result. Composition would similarly benefit from one concrete scene edit and its generated consequence.

### 5. ChessMate

[Project page](https://devpost.com/software/chessmate-nwygvq) · **Overall finalist**

**What the description establishes:** A physical chessboard that can move pieces for remote play, motivated by families separated across countries. Voice interaction and coaching extend the core experience.

**What works in the writing:** The personal origin explains why physical presence matters. The implementation connects perception, chess logic, path planning, Arduino control, motors, and an electromagnet. Collision avoidance and mechanical integration are directly relevant to the demonstrated behavior.

**Technique to borrow:** Choose an origin story that explains a product decision. Then connect the emotional goal to the engineering needed to deliver it.

**What to improve or verify:** Broad claims of flawless behavior should be replaced or supported by bounded observations. A successful game or a measured series of piece movements is stronger evidence than an adjective.

### 6. ROSS — Remote Operated Semantic Sketching

[Project page](https://devpost.com/software/ross-42pnvi) · **Overall finalist**

**What the description establishes:** An attempt to make artwork accessible through physical tracing and narration, with additional temperature-based ideas.

**What works in the writing:** It explains a substantial transformation: image segmentation, stroke extraction, graph construction, path simplification, and robot motion in physical units. It also records an instructive failed approach: language-model simplification was inconsistent, so the team used a mathematical method. Crucially, the page says its two-brush/color feature did not work in the demo, which used one brush.

**Technique to borrow:** Use the sequence **attempt → observed failure → revised approach → working scope**. This can demonstrate judgment and technical learning more effectively than presenting the build as effortless.

**What to improve or verify:** Keep planned sensory features clearly separated from the demonstrated prototype. Do not describe the temperature system as a fully delivered capability simply because it appears in the concept.

### 7. Stu3dio

[Project page](https://devpost.com/software/vibe-director) · **Overall finalist**

**What the description establishes:** An interactive 3D filmmaking studio where users work with a director, scriptwriter, and character artist, edit imagery, arrange scenes, and generate a film.

**What works in the writing:** This is the closest precedent for Composition. Its compact implementation section explains a dependency tree spanning the story, characters, objects, scenes, and final film. Changes mark downstream assets stale; generation uses the relevant context; workers process jobs and store the resulting assets. These are concrete answers to the hard problem of keeping a creative project consistent as it changes.

**Technique to borrow:** Describe the central project representation and the consequences of an edit. Three specific architecture paragraphs can communicate considerable engineering depth.

**What to improve or verify:** The text alone cannot establish the reliability or fidelity of generated films. For Composition, identify a demonstrable difference from this existing 3D-studio concept, such as a specific spatial or camera-control mechanism, if implemented.

### 8. Coach Bob!

[Project page](https://devpost.com/software/coach-bob) · **Overall finalist**

**What the description establishes:** An AR training experience using targets on a punching bag, a voiced coach, and performance feedback. A teammate's injury after a rushed warmup provides the motivating incident.

**What works in the writing:** The reader can picture the physical interaction. The page ties glasses, camera processing, speech, and bag-motion sensing to their roles. Its challenges—tracking jitter, lag, and stable mounting—explain why a convincing physical demo was difficult.

**Technique to borrow:** Describe the interaction in the user's bodily or visual terms before explaining the sensors and APIs that support it.

**What to improve or verify:** The origin story does not demonstrate injury prevention, and bag movement does not establish calibrated force measurement. Separate the prototype's observable feedback from broader health or accuracy claims.

### 9. Sauron

[Project page](https://devpost.com/software/sauron-zvo2je) · **Overall finalist**

**What the description establishes:** A mapping and investigation interface for querying device trajectories with natural language, using geospatial tools and a database.

**What works in the writing:** Its strongest details explain scaling decisions: spatial indexes, server-side aggregation, and data handling that avoids sending thousands of points to the frontend. These decisions connect technical work to an interactive map that remains usable.

**Technique to borrow:** Include a realistic user query, the operation it triggers, and the bottleneck that had to be solved for the response to feel interactive.

**What to improve or verify:** The page's proposed large efficiency improvement is not a measured result. Keep forecasts distinct from outcomes, and avoid using broad impact statements as substitutes for evidence of the prototype's behavior.

### 10. Tango

[Project page](https://devpost.com/software/tango-q37d4z) · **Overall finalist; Graphite Engineering Dream Team**

**What the description establishes:** A voice assistant that acts on clipboard content, with examples involving screenshots, selected text, and code.

**What works in the writing:** A recurring annoyance becomes a set of small, recognizable usage scenes. Clipboard integration, voice activity detection, wake-word handling, and model calls are explained in relation to that experience. The speed requirement follows naturally from the product's promise of interrupting the user as little as possible.

**Technique to borrow:** Use two or three tiny examples to show versatility without listing every feature. Each example should have a clear input, action, and output.

**What to improve or verify:** “Fast” becomes stronger when paired with observed timing and conditions. For Composition, separate immediate editor responsiveness from the longer time required for model generation.

### 11. S-KBD67

[Project page](https://devpost.com/software/s-kbd67) · **Overall finalist**

**What the description establishes:** A Nerf blaster adapted into a first-person-game controller, mapping aiming, firing, reloading, and movement to game input.

**What works in the writing:** The transformation is immediately memorable. Gyroscope, joystick, buttons, wireless packets, and a Python input bridge explain how physical actions become game behavior. Calibration, packet timing, and durability are concrete build challenges.

**Technique to borrow:** Lead with the surprising interaction itself. An entertaining project can establish its value through a clear experience and substantial engineering without an inflated market-size argument.

**What to improve or verify:** Show which motions and controls are implemented and under what game conditions they work. Specific mappings are more useful than broad compatibility claims.

### 12. Lattice

[Project page](https://devpost.com/software/lattice-flck7q) · **Overall finalist**

**What the description establishes:** A holographic communication prototype combining three Kinect cameras and multiple computers into a point cloud displayed through HoloLens.

**What works in the writing:** Hardware constraints explain the architecture. The one-camera-per-computer SDK limitation leads to a distributed system; calibration, point-cloud alignment, noise filtering, and network throughput then become necessary engineering tasks. The page reports more than 20 frames per second, including a peak of 23.

**Technique to borrow:** Connect a constraint to the design it forced, then give a bounded result. A specific observed performance figure makes an accomplishment easier to assess.

**What to improve or verify:** A reported peak is not a sustained benchmark. Retain the proof-of-concept framing and specify measurement conditions if borrowing this numerical style.

## The 42 additional sponsor-prize winners

The award labels below are shortened for readability. They describe awards attached to each project's 2025 submission, not a ranking within this report.

### 13. Fragments

[Project page](https://devpost.com/software/fragments-gmleoj) · **AWS DynamoDB Streams; Cohere**

**Description notes:** A searchable video-inspiration library. The page follows saved clips through frame extraction, visual tagging, MP4/GIF generation, asset storage, metadata storage, and search indexing. DynamoDB Streams has a clear role in updating search data, so sponsor integration is part of the architecture.

**Borrow:** Explain where an asset goes after generation and how users find or reuse it. This is particularly useful for creative tools that need a persistent library.

**Improve:** The feature inventory is long. Organizing it around one clip being saved, processed, searched, and reopened would make the core story easier to follow.

### 14. TradeOff

[Project page](https://devpost.com/software/tradeoff-c24mwv) · **AWS DynamoDB Streams**

**Description notes:** A student-oriented investing simulation with generated news and changing prices. Its most useful sponsor explanation is that database change events propagate updated prices through the application. This makes an infrastructure choice visible as product behavior.

**Borrow:** Write the chain “event occurs → backend responds → user sees a change.” That is stronger than saying an application “uses real-time technology.”

**Improve:** Numerous integrations and future directions compete for attention. Prioritize the simulation that was actually demonstrated, and give each additional component only the space needed to explain its role.

### 15. Sematic

[Project page](https://devpost.com/software/diaframe) · **AWS DynamoDB Streams**

**Description notes:** Voice-driven diagram editing. The model receives both the spoken instruction and the current diagram, including positions and connections, then returns structured operations such as creating a node. React Flow displays the resulting changes.

**Borrow:** This is an excellent explanation of AI acting on an editable scene: existing state + user intent → constrained command → visible mutation. The input context and output contract make the model integration understandable.

**Improve:** Add a small before-and-after example and distinguish perceived responsiveness from measured latency. Composition can use the same explanatory pattern if it actually has structured scene operations.

### 16. RepoStory

[Project page](https://devpost.com/software/placeholder-it3zq7) · **Cerebras**

**Description notes:** A repository-history tool that turns commits into meaningful milestones. Its most valuable material explains why naive sampling and relying on merge commits were inadequate, then describes a more selective approach using work estimates and search through the history. Context is fetched as needed.

**Borrow:** Show competing approaches and the concrete reason the final one was chosen. This makes the implementation feel designed rather than assembled.

**Improve:** Low-level detail can overwhelm the result. Keep one instructive algorithmic example in the description and move extensive code or implementation exposition into the repository.

### 17. Solshare

[Project page](https://devpost.com/software/solshare-cmxous) · **Cohere; Solana Pay**

**Description notes:** Receipt splitting motivated by a shared Costco purchase. The workflow is easy to follow: scan the receipt, assign items, calculate shares, and settle payment. The description explains structured receipt interpretation and correction rather than treating OCR as magically reliable.

**Borrow:** A small, real incident can be enough inspiration when it maps directly to the product's steps. Explain the path from messy input to a usable decision or transaction.

**Improve:** Parsing reliability would benefit from a worked receipt or bounded test. The presence of a correction step alone does not establish accuracy.

### 18. Deepsint

[Project page](https://devpost.com/software/deepsint) · **Cohere**

**Description notes:** A username-based public-information research workflow. Discovery, scraping, normalization, correlation, and reporting are described as separate stages. Evidence links, timestamps, and confidence help explain the intended quality of the resulting profile.

**Borrow:** State the exact input and the concrete output, then explain how evidence travels with the result. Confidence and source information are useful product details when outputs contain uncertain inferences.

**Improve:** Words such as “trusted” should not replace evaluation. Explain what the confidence means and which identity matches remain uncertain.

### 19. Pew Pew

[Project page](https://devpost.com/software/pew-pew-9mi8pb) · **CSE Network Traffic Exploration**

**Description notes:** A very short submission that identifies a Suricata log input, a host/signature graph, and a statistical method for finding unusual source activity. It quickly states input, method, and visualization.

**Borrow:** Technical specificity does not require length. One precise sentence can convey more than a paragraph about a broad mission.

**Improve:** The public description provides little demonstrated outcome, user scenario, or explanation of investigative value. Its award is not evidence that this level of brevity is sufficient for every judging context.

### 20. Network Threat Explorer

[Project page](https://devpost.com/software/network-threat-explorer) · **CSE Network Traffic Exploration**

**Description notes:** A network-analysis project using a named dataset and a combination of database, analysis, and local security tools. The page describes practical resource limits, including memory constraints, and places additional reporting work in the future.

**Borrow:** Naming a real dataset and an actual hardware limitation grounds a technical account. Distinguishing finished analysis from planned reporting makes scope clearer.

**Improve:** Much of the description is a list of tools. A specific suspicious event and the steps taken to discover it would communicate the benefit better.

### 21. YeetThePacket

[Project page](https://devpost.com/software/nocapnethack) · **CSE Network Traffic Exploration**

**Description notes:** Packet captures become extracted features, heuristic findings, evidence-based language-model explanations, and a timeline/report. Structured schemas, streaming, and handling rate or processing failures make the pipeline concrete.

**Borrow:** Name the final artifact a user receives and show how it is grounded in the original data. Explain operational behavior when processing is large or unreliable.

**Improve:** Repeated learning sections and overlapping explanations could be consolidated. A single traced finding would make the report's evidence chain easier to assess.

### 22. SOTA Computer use agent challenge

[Project page](https://devpost.com/software/sota-computer-use-agent-challenge) · **Cua computer-use-agent prize**

**Description notes:** A compact screen-perception, planning, and keyboard/mouse-action loop, with retries. A multi-step example involving a download, archive extraction, and spreadsheet work helps make the agent's intended capability concrete.

**Borrow:** Give one complete task instead of many disconnected actions. A reader should be able to tell what constitutes success.

**Improve:** The public description does not provide the benchmark evidence needed to evaluate the title's state-of-the-art implication. A prize label and an implementation sketch do not substitute for a disclosed result.

### 23. CourseIntelligence

[Project page](https://devpost.com/software/courseinteligence) · **Databricks**

**Description notes:** Course information and student discussion are processed into searchable summaries and metrics. The page identifies sources, layered data transformations, rate limits, noisy text, and saving partial work when a run fails.

**Borrow:** Explain where the information comes from, how its form changes, and what question the user can answer afterward. Recovery behavior is a credible technical accomplishment when the inputs are unreliable.

**Improve:** Cleaner formatting and a clear example would reduce reading effort. Student opinions also require careful presentation; aggregation does not make subjective impressions objective facts.

### 24. TrueCount

[Project page](https://devpost.com/software/truecount) · **ETHGlobal**

**Description notes:** A voting concept explained through commitment, reveal, and finalization stages. Hashes and salts have an understandable role in controlling what is visible at each point in the process.

**Borrow:** Explain a complicated mechanism as a sequence of states and transitions. State who can see or do what at each stage.

**Improve:** Broad language about eliminating bias or guaranteeing an entire election goes beyond the described mechanism. Tie claims to the particular property the prototype implements and demonstrates.

### 25. ScholarMarket

[Project page](https://devpost.com/software/scholarmarket) · **ETHGlobal**

**Description notes:** A grade-related prediction and staking project. It reports moving from a CNN approach with lower accuracy to an LSTM with higher accuracy, giving the challenges section a concrete experimental progression.

**Borrow:** A baseline, a changed approach, and a measured result can explain learning compactly.

**Improve:** The reported accuracy needs dataset, metric, and evaluation context. The implementation and challenges sections also leave the final model ambiguous. Reconcile the final architecture before publishing; an earlier approach should be labeled as earlier.

### 26. Optimate

[Project page](https://devpost.com/software/optimate) · **Federato RiskOps; Y Combinator Unicorn Prize**

**Description notes:** An underwriting workflow that ranks policies, explains recommendations, accepts feedback, and visualizes risk. Concrete data fields and decision steps make its fit with the sponsor's business problem clear.

**Borrow:** Describe the actual decision a professional must make, the information needed, and the action supported by the interface. Put the sponsor technology inside that workflow.

**Improve:** The submission repeats architecture and value claims across a very long description. Language suggesting production readiness sits awkwardly alongside plans for production hardening. Consolidate and distinguish the working prototype from deployment ambitions.

### 27. BeyondSight

[Project page](https://devpost.com/software/beyondsight-589mh7) · **Genesys**

**Description notes:** A wearable accessibility concept involving haptic navigation and a braille interface, motivated by a personal connection to a DeafBlind person. Camera compatibility and the hardware/software environment are discussed concretely.

**Borrow:** Describe what the user perceives and does. Sensory detail and a specific compatibility obstacle make the experience and technical work understandable.

**Improve:** The page places intended-user testing in future work. Keep that distinction: motivation and a working device do not by themselves establish usability or accessibility for the people it aims to serve.

### 28. LeafPilot

[Project page](https://devpost.com/software/leafpilot) · **Groq**

**Description notes:** Notes and audio become LaTeX, animations, and compiled document outputs in a browser workflow. Compilation, validation, retries, and asynchronous work explain the steps needed to produce more than generated text.

**Borrow:** Follow generation through to the usable artifact. If the output must compile, render, or export, explain that stage and how failures are handled.

**Improve:** Claims of being the first editor of its kind need evidence. A clearer demonstration of what users can create is more persuasive than an unsupported originality superlative.

### 29. One Take

[Project page](https://devpost.com/software/one-take) · **Groq**

**Description notes:** A URL or repository leads to browser navigation, screen capture, storyboarding, narration, and an assembled demo video. The description identifies a shared JSON format as the solution to integrating independently built components.

**Borrow:** This is a useful video-tool example: explain the complete production pipeline and one interface that made its parts interoperable.

**Improve:** Large comparisons about time and cost savings are not supported by an evaluation in the description. Report the actual time for a demonstrated input, including any manual preparation, instead of an unverified commercial comparison.

### 30. Orbit

[Project page](https://devpost.com/software/orbit-59jths) · **Windsurf; Groq**

**Description notes:** A recognition and memory assistant linking face processing, public information, conversation transcripts, and relationships. Parallel processing is tied to the goal of timely assistance.

**Borrow:** Organize an assistant around what it does before, during, and after an interaction. Explain how concurrency or other engineering choices affect the user experience.

**Improve:** Sweeping novelty and difficulty claims make the text less credible than its concrete details. Reported speed needs clear timing boundaries and conditions; many parallel components do not automatically imply a reliable result.

### 31. SpeakEasy — Spectacles communication aid

[Project page](https://devpost.com/software/speakeasy-arzjmb) · **Groq**

**Description notes:** A different project from the finalist interview coach. It explores contextual AR choices and speech output for nonverbal communication. Selection and spoken output make the interaction understandable, while the page acknowledges incomplete portions and future user research.

**Borrow:** Explain the human input loop: what options appear, how the user chooses, and what the device does next. State implementation boundaries plainly.

**Improve:** Keep live environmental understanding, preview behavior, and intended capabilities distinct. An accessibility concept should identify which parts have actually been tested with intended users.

### 32. LangSketch

[Project page](https://devpost.com/software/langsketch) · **Martian**

**Description notes:** A visual agent-workflow builder that compiles a graph into Python. Schemas and model routing connect the interface to executable behavior, and routing is motivated by differences in task requirements.

**Borrow:** Explain how a visual representation becomes something executable. Tie each routing decision to a requirement such as capability or complexity.

**Improve:** The reported cost-saving percentage needs a comparison method and workload. Repetitive positioning language could be replaced by one small graph and the corresponding execution it produces.

### 33. QNXMobility

[Project page](https://devpost.com/software/canqnx) · **QNX hardware/software prize**

**Description notes:** A motorized chair controlled through leaning. The page links inertial sensing, QNX-based control, motor drivers, and custom mechanical construction. The gesture and effect are immediately understandable.

**Borrow:** Start with what a person physically does and what the machine does in response. Then explain the control and mechanical systems that connect them.

**Improve:** Rough prose can be cleaned up without losing its concrete build details. Clarify the demonstrated operating conditions and avoid implying that a hackathon control prototype is already a validated mobility product.

### 34. QNX-RasPi-Setup-Util

[Project page](https://devpost.com/software/qnx-raspi-setup-util) · **QNX hardware/software prize**

**Description notes:** An interactive setup utility for people who need to configure a QNX Raspberry Pi environment without extensive Unix experience. The implementation discusses a terminal UI and the cross-compilation obstacles caused by the development environment.

**Borrow:** A narrow problem can be compelling when the user and friction are specific. Explain the exact setup step made easier and the platform limitation overcome.

**Improve:** A short before-and-after setup example would make the benefit more tangible. This project is a reminder that adding an AI story is unnecessary when the actual utility is clear.

### 35. Money Talks

[Project page](https://devpost.com/software/money-talks-d93izn) · **RBC InvestEase**

**Description notes:** Bank statements become structured data, financial dashboards, goals, and feedback. OCR errors, inconsistent input formats, slow queries, and caching are more informative than the broad promise of financial insight.

**Borrow:** Describe the messy input your application must survive. An actual processing bottleneck and its fix help explain why the build required engineering.

**Improve:** Consolidate repeated feature and roadmap sections. Large claims about the number or speed of insights should be supported with an example workload and a measured result.

### 36. Honkanomics

[Project page](https://devpost.com/software/honkanomics) · **RBC InvestEase**

**Description notes:** A short student-investing concept combining lessons, simulation, and a goose-themed game. Its audience and tone are easy to understand, but implementation detail is limited.

**Borrow:** A clear audience and memorable theme can quickly communicate the intended experience.

**Improve:** This is not a strong model for writing the technical section. Explain the learning loop, how simulated decisions change the experience, and what was built. The award alone does not tell us how much of the judging evidence appeared in the written submission.

### 37. Help Me If You Can

[Project page](https://devpost.com/software/help-me-if-you-can) · **Ripple**

**Description notes:** A task-and-reward workflow for getting help, with matching, review, and payment. The description makes a useful distinction between XRP testnet escrow and custodial RLUSD holds, and acknowledges an unfinished voice-related attempt.

**Borrow:** State exactly which mechanism and environment implement a capability. Label testnet behavior, simulated pieces, and unfinished integrations clearly.

**Improve:** Anchor the many moving parts in one task being created, accepted, completed, and paid. Precise infrastructure language is most useful when the reader can connect it to that transaction.

### 38. RippleRelief

[Project page](https://devpost.com/software/ripplerelief) · **Ripple**

**Description notes:** A relief-distribution concept involving donors, organizations, recipients, and merchants. It explains the movement from funding through vouchers and redemption, with ledger records and supporting account infrastructure.

**Borrow:** In a multi-party product, explicitly name each role and follow one complete path through the system. This prevents an infrastructure description from becoming detached from users.

**Improve:** Trust, security, and access claims need more than an architecture list. Describe what the prototype records or checks, and distinguish that behavior from broader real-world assurances.

### 39. Token Turrets

[Project page](https://devpost.com/software/token-turrets) · **Ripple**

**Description notes:** A multiplayer tank game connected to staking, escrow, payouts, and cosmetic assets. The sponsor technology appears within the play-and-reward loop rather than as a separate demonstration.

**Borrow:** Use a compact sequence of user verbs to explain the product, then show where the integration is necessary to complete that sequence.

**Improve:** Ledger settlement does not by itself establish fairness of game outcomes or game logic. Keep the description focused on the particular transactions and multiplayer behavior that were implemented.

### 40. socialCRM

[Project page](https://devpost.com/software/socialcrm) · **Rox**

**Description notes:** A creator-focused CRM processing inconsistent audience exports into useful segments and campaign information. Data normalization, interface contracts, and race conditions are specific implementation concerns. The page also identifies a mock classifier.

**Borrow:** Concrete data irregularities and integration failures make a business-software build credible. Explain what had to be standardized before the feature could work.

**Improve:** Carry the mock-versus-implemented distinction through the feature description. Readers should not have to infer that a highlighted intelligent feature is currently simulated from one sentence in a technical section.

### 41. Lavoe

[Project page](https://devpost.com/software/lavoe) · **Windsurf; Rox**

**Description notes:** An AI-assisted music-production environment described through actions such as chopping, sorting, mixing, and playing audio. Playback synchronization and representing musical information for model use are relevant, domain-specific difficulties.

**Borrow:** Creative verbs help a reader understand what a tool enables. Follow them with one problem particular to the medium—in this case, audio timing and representation.

**Improve:** Product analogies and claims that a system goes beyond a wrapper do not establish originality. Show the custom interaction, representation, or execution mechanism that makes the difference.

### 42. Tarazoo

[Project page](https://devpost.com/software/tarazoo) · **Shopify**

**Description notes:** A shopping and merchant-management concept combining camera-assisted checkout, catalog work, demand forecasts, and procurement optimization. Minimum orders, case sizes, and demand constraints give its optimization section useful specificity.

**Borrow:** Explain an algorithm through the real constraints it must satisfy. Identify the shopper's and merchant's distinct workflows.

**Improve:** The camera interaction receives less implementation explanation than the optimization. Give the most visible demo capability enough technical support, and avoid spreading the main narrative over too many products at once.

### 43. SpectraSphere

[Project page](https://devpost.com/software/htn-zq6138) · **Snap Spectacles**

**Description notes:** Photos and prompts become styled panels in an AR experience. Prompt processing, generated imagery, texture requirements, and remote asset delivery are explained as part of a physical-device pipeline. The page explicitly says the delivered scope is photo-based; video generation was deferred.

**Borrow:** Explain a concrete hardware constraint and the scope decision it caused. Name the output medium accurately.

**Improve:** The description could be substantially shorter without losing substance. For Composition, this is a useful reminder to distinguish generated images, camera previews, and generated videos instead of describing them interchangeably.

### 44. CRASH OUT!

[Project page](https://devpost.com/software/crash-out-bte6q0) · **Snap Spectacles**

**Description notes:** An AR drum kit with generated drumsticks and a physical pedal integration. Collision geometry, grip, pressure sensing, and event delivery explain the work needed for the interaction to feel convincing.

**Borrow:** For playful projects, the fun interaction can be the main point. Show how engineering choices change what playing the experience feels like.

**Improve:** Clearly separate the core glasses experience from optional hardware. A precise example of a gesture or hit becoming sound would make timing and interaction quality easier to assess.

### 45. ARchemy

[Project page](https://devpost.com/software/archemy) · **Snap Spectacles**

**Description notes:** Users combine objects to generate playful new 3D creations. A concrete combination makes the concept easy to picture. Slow model generation leads to discussion of caching and storage tradeoffs.

**Borrow:** Show a specific input pair and resulting object. Then explain the engineering that keeps a creative loop usable when generation is slow.

**Improve:** Distinguish cached responses from newly generated results when discussing speed. This is highly relevant to video tools whose interface can respond immediately while a model job remains in progress.

### 46. Tunnel

[Project page](https://devpost.com/software/tunnel-dqv1k4) · **Vapi; MLH Auth0**

**Description notes:** A simulated-audience workflow involving personas, reactions, selection, and voice conversations. Structured output validation, retries, and carrying persona context into calls provide concrete integration details.

**Borrow:** Describe the transition between screens or interaction modes: selecting a persona changes the context of the ensuing conversation. Explain how that context is preserved.

**Improve:** The page is lengthy and contains inconsistent persona counts. Synthetic reactions are not independently validated market research. Reconcile numbers and distinguish an interesting simulation from evidence of real customer demand.

### 47. Vraille

[Project page](https://devpost.com/software/vraille) · **Vapi**

**Description notes:** A wearable-camera and voice workflow connected to a custom braille device. Its account of adapting a messaging feed and virtual audio routing shows an unusual integration route around hardware restrictions.

**Borrow:** One unexpected workaround can convincingly demonstrate technical persistence. Explain why it was necessary and what it enabled in the final prototype.

**Improve:** Condense the build logistics into the decisions that affect the product. Distinguish the demonstrated communication loop from future hardware improvements and from usability that still requires evaluation.

### 48. Stacy

[Project page](https://devpost.com/software/stacy-g7zptj) · **Vapi**

**Description notes:** A voice companion built around an assistance scenario, location, incident records, contacts, and routing. The personality and scenario are vivid; connecting voice and telephony services is identified as an integration difficulty.

**Borrow:** Follow one user situation through a sequence of actions so the purpose of the assistant remains clear.

**Improve:** More detail is needed on the actual orchestration and completed behavior. A compelling emergency-related scenario should not be mistaken for evidence of operational reliability; distinguish a demo path from dependable real-world service.

### 49. Aircraft Studio

[Project page](https://devpost.com/software/aircraft-studio) · **Windsurf**

**Description notes:** A prompt becomes an image, then a generated GLB aircraft, then something usable in a mobile flight experience. The page identifies model roles, file formats, asset persistence, and optional account behavior. It explicitly limits the simulation to kinematic behavior rather than full aerodynamics.

**Borrow:** Trace generated media through to interaction. Exact formats and a clear simulation boundary help readers understand both the accomplishment and its limits.

**Improve:** Installation instructions can live in the repository. Use the main description for the user's transformation and the technical choices that make it possible.

### 50. ShapeShift

[Project page](https://devpost.com/software/shapeshift-kvhjxr) · **Y Combinator Unicorn Prize**

**Description notes:** Browser-based gesture and language control for 3D editing and generation. MediaPipe processing, socket transport, shared scene state, and function calls connect multiple input methods to the same environment. Frame handling and rotation normalization address actual latency and gesture issues.

**Borrow:** Explain how different inputs converge on one editable state. Show a noise or latency problem, its mitigation, and the visible improvement.

**Improve:** AR/VR appears in future plans; do not describe the delivered browser experience as already having those capabilities. Composition can borrow the shared-state explanation while making its own output pathway explicit.

### 51. Evident AI

[Project page](https://devpost.com/software/evident-ai) · **Y Combinator Unicorn Prize**

**Description notes:** Video, audio, transcripts, and extracted frames are assembled into a referenced draft report for human review. Structured outputs, retries, and handling large uploads provide a concrete account of the processing system.

**Borrow:** Clearly name the output as a draft and show where the human reviews it. Connect claims in the output back to supporting input material.

**Improve:** References and record hashes do not themselves establish legal readiness or correctness. Keep the demonstrated evidence-handling features separate from broad institutional or legal claims.

### 52. VibeMovie

[Project page](https://devpost.com/software/promptmotion) · **MLH Gemini API**

**Description notes:** Conversational video editing combined with a manual timeline. Its strongest technical idea is one JSON composition representation shared by AI edits, manual editing, previews, and rendering. A concrete failure involved browser-local asset URLs that the server could not read; assets had to be uploaded and references remapped for rendering.

**Borrow:** This is an especially strong Composition reference. Explain the shared representation, how edits mutate it, and how the same state becomes an output artifact. The asset-boundary failure is a useful challenge-to-solution story.

**Improve:** Some aspirational editing examples go beyond the current implementation described elsewhere. Reconcile examples with the actual supported feature set.

### 53. Morph

[Project page](https://devpost.com/software/morph-jcot4m) · **MLH MongoDB Atlas**

**Description notes:** A spatial design workflow connecting speech and gestures to generated 3D objects, physical dimensions, printable formats, and saved versions. The GLB-to-STL path and scale compatibility make the final artifact concrete.

**Borrow:** Generation becomes more meaningful when the description follows through to an editable, reusable, or manufacturable output. File conversion and dimensions can be central accomplishments, not incidental details.

**Improve:** Reported completion speed needs conditions. Clarify which collaboration and library capabilities are already implemented and which belong to the roadmap.

### 54. CompOnion

[Project page](https://devpost.com/software/componion-7bpaxc) · **MLH Cloudflare**

**Description notes:** A shared movie-watching assistant that answers questions using contextual information. The team describes finding continuous video processing too expensive, then moving to extracted keyframes and prepared context.

**Borrow:** A constraint-driven architectural pivot is worth describing when it preserves the useful experience. Explain what changed internally and what the user can still do.

**Improve:** Distinguish preprocessing from work done live during a session. That timing boundary is relevant to any AI video project and should be explicit in both the written description and demo.

## Applying the findings to Composition

The most useful reading order is **Stu3dio → VibeMovie → Sematic → ShapeShift → ROSS → Lattice**. Together they illustrate a creative workflow, shared editable state, structured model interaction, spatial input, honest implementation boundaries, and measurable technical results.

The central question Composition's description should answer is:

**How does the user's spatial decision become a meaningful constraint or reference for the generated video?**

The public [Composition page](https://devpost.com/software/composition) reviewed in this conversation leads with “Interact with 3D models” and a short statement about creative freedom beyond text-to-video, while most narrative sections are empty. That establishes a direction, but leaves the output, mechanism, and demonstrated accomplishment unclear. The advice below is a writing scaffold, not a claim that Composition already implements the suggested capabilities.

### 1. Tagline: name the action and the output

“Interact with 3D models” describes a broad class of software. A stronger tagline should tell the reader what the interaction produces.

Conditional directions, to use only if accurate:

- “Stage a 3D scene and use it to guide an AI-generated shot.”
- “Compose your shot in 3D, then turn it into video.”
- “Direct AI video through editable scenes and camera framing.”

Choose the narrowest wording that the demo can support. “Guide” is appropriate when a model uses a visual reference with imperfect adherence; a claim of exact control requires stronger evidence.

### 2. Inspiration: describe a specific creative frustration

Use a short situation rather than a broad statement about AI transforming creativity. Explain what the creator wants to control and what makes that awkward in the workflow you are addressing.

An illustrative direction is a creator trying to keep an object in a particular part of the frame while changing the viewpoint. The description should explain why that motivated Composition's actual interface. Do not invent interviews, personal experiences, or unsuccessful generations to make the story sound stronger.

**What to borrow:** ChessMate's motivation explains its physical board; Tango's motivation explains its clipboard integration. Composition's motivation should similarly explain why spatial interaction is needed.

### 3. What it does: walk through one complete shot

Use a short sequence covering:

1. The starting material the user supplies or selects.
2. The scene or camera controls they actually manipulate.
3. What they inspect before requesting generation.
4. The generated result they receive.
5. How they revise or export it, if supported.

A worked example is more useful than a long feature list. Keep the scene simple enough that the relationship between the input and output is visible. If moving one object is the key interaction, show that one object before and after the edit.

**What to borrow:** Stu3dio introduces its filmmaking workflow before its job system. Maatchaa explains the full action loop instead of stopping at a match suggestion.

### 4. How we built it: explain the representation and the bridge

This deserves the most technical detail. Address the parts that actually exist:

- **Editable state:** What represents objects, transforms, camera settings, timing, and any other supported properties?
- **Rendering or capture:** How does that state become something a user can preview or a model can receive?
- **Model input:** What is actually sent—text, an image, multiple frames, a supported video reference, or some combination? Name the actual format and supported pathway.
- **Generation:** What service performs which part of the work? What custom code prepares its inputs and manages the response?
- **Iteration:** What is retained or recomputed when the user edits the project?
- **Output:** Where does the result appear, and how is it saved or exported?

Do not imply that a model reads native 3D geometry or obeys an exact camera trajectory unless that is what the integration supports and the prototype demonstrates. If Composition renders the scene to an image and sends that image to a model, explain that direct, comprehensible mechanism.

**What to borrow:** Sematic states the context it sends and the commands it receives. VibeMovie explains why both manual and AI edits affect the same representation. Stu3dio explains what happens to dependent assets after an edit.

### 5. Challenges: choose two with consequences

Use this structure for each challenge:

**Desired behavior → observed failure → cause or constraint → implemented fix → visible result or remaining limit.**

Potential topics are useful only if they occurred in this build: coordinates not matching the preview, assets unavailable to a render process, generated framing drifting from the reference, asynchronous results attached to the wrong edit, or expensive regeneration after a small change.

Avoid generic accounts such as “integrating APIs was difficult” or “we learned to work as a team.” Explain what broke and the decision that changed it. VibeMovie's inaccessible browser-local asset URLs and RepoStory's inadequate commit-selection approaches are particularly good examples.

### 6. Accomplishments: supply evidence at the same scale as the claim

Use actual observed results. Depending on what was tested, evidence could include a completed end-to-end shot, working import/export, a reproducible scene edit, measured editor performance, or a small set of controlled comparisons.

If reporting fidelity, define the thing checked: for example, whether a particular object remained on the specified side of the frame. Record the number of examples and selection method. If reporting speed, separate editor interaction, queue time, model generation, and export. If only a peak result was observed, label it as a peak.

These are suggestions for evidence to collect, not measurements already made. A precise demonstration without a numerical benchmark is preferable to an invented percentage.

### 7. What we learned: state a design insight

Explain what changed in the team's understanding and how it affected the implementation. “We learned Three.js” tells the reader less than a specific lesson about the representation needed to keep a scene editable and its generation inputs consistent.

A useful sentence pattern is: “We initially assumed [assumption]. After [observation], we changed [design], which made [behavior] possible.” Fill it with an actual experience.

### 8. What's next: extend the demonstrated bottleneck

Choose two concrete next steps based on current limitations. Explain why they follow from what was built. Avoid a long list of collaboration, mobile support, model training, marketplaces, and every conceivable creative feature.

Keep planned features out of the present-tense workflow. The ROSS, SpectraSphere, and CompOnion descriptions are useful references for describing tradeoffs and unfinished work clearly.

### A practical writing budget

For Composition, I would aim initially for roughly **600–900 words**, then cut repetition. This is an editorial recommendation, not a Devpost requirement or a length statistically associated with winning.

| Part | Approximate space | Job |
|---|---:|---|
| Inspiration | 70–100 words | Explain the specific friction and why this interface follows from it |
| What it does | 100–140 words | Let the reader picture one complete workflow |
| How we built it | 180–250 words | Explain the representation, model boundary, and custom engineering |
| Challenges | 100–150 words | Show two actual failures and the resulting decisions |
| Accomplishments | 60–100 words | State demonstrated results and bounded evidence |
| Learning and next steps | 80–120 words | Explain one insight and two justified extensions |

### Fill-in scaffold

This is a structure to complete with verified facts, not a finished submission:

> **Composition helps [specific creator] turn [starting material] into [actual output] by [distinct interaction].**
>
> We started with [real frustration or observation]. The difficult part was [specific creative decision], which led us to build [relevant interface choice].
>
> A user begins by [step one], changes [supported controls], and previews [actual preview]. When they request generation, Composition [actual transformation] and returns [actual artifact]. They can then [supported revision or export].
>
> Internally, we represent [project information] as [actual representation]. [Component] converts that state into [actual model input]. [Model/service] performs [its specific role], while our code handles [custom contribution]. When the user edits [property], the system [actual update behavior].
>
> Our hardest problem was [observed failure]. We first tried [actual attempt], but [specific limitation]. We changed [implementation], which enabled [demonstrated improvement]. The current prototype still [known limitation].
>
> By the end of the build, we demonstrated [completed workflow] and observed [bounded result, with conditions if numerical]. We learned [specific design insight]. Next, we would address [limitation one] and [limitation two].

### Supporting media that makes the description easier to believe

Choose images and a demo that let a reader follow the same story as the text:

1. **Starting scene:** show the object arrangement and camera view that matter.
2. **Deliberate change:** make one visible edit and identify the intended effect.
3. **Generation input:** briefly show what the system actually supplies to the model.
4. **Result:** show the returned video and compare it with the intended composition.
5. **Iteration:** if supported, revise the scene and demonstrate what changes afterward.

Label any cut over generation time and any prepared example. A pipeline diagram can supplement these frames when it makes the custom engineering easier to understand. The goal is to let the reader connect a user decision to a visible result.

### Editing checklist

- Can a reader describe the product after the first two sentences?
- Does one complete example connect input, interaction, and output?
- Does the implementation explain what was built around each external model?
- Are present capabilities consistent across the opening, features, challenges, and roadmap?
- Does every numerical or superlative claim have support?
- Do the screenshots and demo substantiate the exact claims in the text?
- Is the project distinguishable from the specific precedents linked above?
- Can repeated stack lists, generic praise, and speculative impact claims be removed?

A strong description makes a demonstrated achievement easy to understand and inspect. It cannot substitute for the achievement itself, but it can ensure the important interaction and engineering are visible to the reader.
