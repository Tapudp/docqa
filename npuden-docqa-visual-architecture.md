# NpuDen DocQA — Visual Architecture

> All diagrams in Mermaid format.  
> Companion to: `npuden-docqa-architecture-plan-v2.md`  
> Version 2.0 — May 2026

---

## 1. System Architecture (High-Level)

```mermaid
graph TB
    subgraph Frontend["Frontend (Next.js)"]
        UI[Chat UI]
        WS_UI[Workspace Manager]
        ADMIN_UI[Admin Dashboard]
        PDF[PDF Viewer]
    end

    subgraph API["API Gateway (FastAPI)"]
        AUTH_MW[Auth Middleware]
        RATE[Rate Limiter]
        ROUTER[API Router]
    end

    subgraph Services["Core Services"]
        CHAT[Chat Service]
        DOC[Document Pipeline]
        RET[Retrieval Engine]
        LLM_R[LLM Router]
        WS_MGR[Workspace Manager]
        COV[Coverage Verifier]
    end

    subgraph Parser["Parser Module (Pluggable)"]
        PADDLE[PaddleOCR]
        DOCLING[Docling]
        UNSTRUCT[Unstructured]
        PYPDF[PyPDF Fallback]
    end

    subgraph Storage["Storage Layer"]
        PG[(PostgreSQL)]
        ES[(Elasticsearch)]
        CHROMA[(ChromaDB)]
        MINIO[(MinIO)]
        REDIS[(Redis)]
    end

    subgraph LLM["LLM Providers"]
        OLLAMA[Ollama - Local]
        OPENAI[OpenAI]
        CLAUDE[Anthropic Claude]
        GEMINI[Google Gemini]
        GROQ[Groq]
    end

    subgraph Auth["Auth Layer"]
        KC[Keycloak]
        BUILT[Built-in JWT]
        LDAP[LDAP/SAML]
    end

    Frontend -->|REST + WebSocket| API
    API --> Services
    DOC --> Parser
    RET --> ES
    RET --> CHROMA
    LLM_R --> LLM
    DOC --> MINIO
    DOC --> PG
    CHAT --> PG
    WS_MGR --> PG
    DOC --> REDIS
    AUTH_MW --> Auth
    KC --> LDAP
```

---

## 2. Document Upload & Processing Pipeline

```mermaid
flowchart TD
    UPLOAD["🗂️ User Uploads Document"]
    
    subgraph Stage1["Stage 1: Receive & Store Original"]
        VALIDATE["Validate file type & size"]
        SCAN["Virus scan (ClamAV)"]
        STORE_ORIG["Store original in MinIO"]
        RECORD["Record in PostgreSQL<br/>status = received<br/>total_pages = N"]
        RECEIPT["Return upload receipt to user"]
    end

    subgraph Stage2["Stage 2: Parse (Async Worker)"]
        STATUS_PARSE["status → parsing"]
        PARSE_LOOP["For each page 1..N"]
        TRY_PRIMARY["Try primary parser<br/>(e.g. PaddleOCR)"]
        SUCCESS{"Parsed<br/>OK?"}
        TRY_FALLBACK["Try fallback parser<br/>(e.g. PyPDF)"]
        FALLBACK_OK{"Fallback<br/>OK?"}
        PLACEHOLDER["Insert placeholder<br/>confidence = 0.0"]
        COLLECT["Collect parsed page"]
        VERIFY_COV["Verify: parsed == total?"]
        STORE_PARSED["Store parsed JSON in MinIO"]
        STATUS_PARSED["status → parsed<br/>coverage = X%"]
    end

    subgraph Stage3["Stage 3: Structure-Aware Chunking"]
        CHUNK_RULES["Rules:<br/>• Never split tables<br/>• Never split mid-sentence<br/>• Carry page numbers<br/>• Carry section headings<br/>• 512 token target"]
        CHUNK_OUT["Output: ~180 chunks<br/>stored in PostgreSQL"]
    end

    subgraph Stage4["Stage 4: Dual Indexing"]
        BM25_IDX["BM25 Index<br/>(Elasticsearch)<br/>Exact keyword search"]
        VEC_IDX["Vector Index<br/>(ChromaDB)<br/>Semantic search"]
        VERIFY_IDX["Verify: indexed == total chunks?"]
        READY["status → ready<br/>50/50 pages ✓<br/>180/180 chunks ✓"]
    end

    UPLOAD --> VALIDATE --> SCAN --> STORE_ORIG --> RECORD --> RECEIPT
    RECORD -.->|async| STATUS_PARSE --> PARSE_LOOP
    PARSE_LOOP --> TRY_PRIMARY --> SUCCESS
    SUCCESS -->|Yes| COLLECT
    SUCCESS -->|No| TRY_FALLBACK --> FALLBACK_OK
    FALLBACK_OK -->|Yes| COLLECT
    FALLBACK_OK -->|No| PLACEHOLDER --> COLLECT
    COLLECT --> PARSE_LOOP
    PARSE_LOOP -->|All pages done| VERIFY_COV --> STORE_PARSED --> STATUS_PARSED
    STATUS_PARSED --> CHUNK_RULES --> CHUNK_OUT
    CHUNK_OUT --> BM25_IDX
    CHUNK_OUT --> VEC_IDX
    BM25_IDX --> VERIFY_IDX
    VEC_IDX --> VERIFY_IDX
    VERIFY_IDX --> READY

    style Stage1 fill:#f0f9ff,stroke:#3b82f6
    style Stage2 fill:#fefce8,stroke:#eab308
    style Stage3 fill:#f0fdf4,stroke:#22c55e
    style Stage4 fill:#fdf2f8,stroke:#ec4899
```

---

## 3. Full Document Coverage Guarantee

```mermaid
flowchart LR
    subgraph Input["Input"]
        PDF["📄 50-page PDF"]
    end

    subgraph Processing["Page-by-Page Processing"]
        P1["Page 1 ✅"]
        P2["Page 2 ✅"]
        P3["Page 3 ✅"]
        DOTS1["..."]
        P23["Page 23 ❌ PaddleOCR fails"]
        P23F["Page 23 ✅ PyPDF fallback"]
        DOTS2["..."]
        P41["Page 41 ❌ Both fail"]
        P41P["Page 41 ⚠️ Placeholder"]
        DOTS3["..."]
        P50["Page 50 ✅"]
    end

    subgraph Result["Coverage Report"]
        REPORT["parsed: 49/50<br/>fallback: 1 page<br/>failed: 1 page<br/>coverage: 98%"]
        UI_OK["UI: 49/50 ⚠️<br/>[Retry Page 41]"]
    end

    PDF --> P1
    PDF --> P2
    PDF --> P3
    PDF --> DOTS1
    PDF --> P23 --> P23F
    PDF --> DOTS2
    PDF --> P41 --> P41P
    PDF --> DOTS3
    PDF --> P50
    P1 & P2 & P3 & P23F & P41P & P50 --> REPORT --> UI_OK

    style P23 fill:#fecaca,stroke:#ef4444
    style P41 fill:#fecaca,stroke:#ef4444
    style P23F fill:#fef9c3,stroke:#eab308
    style P41P fill:#fef9c3,stroke:#eab308
    style UI_OK fill:#f0fdf4,stroke:#22c55e
```

---

## 4. Parser Module Architecture (Pluggable)

```mermaid
classDiagram
    class DocumentParser {
        <<interface>>
        +parse(file_path, mime_type) ParsedDocument
        +parse_page(file_path, page_num) ParsedPage
        +supported_formats() List~str~
        +requires_gpu() bool
        +health_check() bool
    }

    class PaddleOCRParser {
        -model: PaddleOCR_VL_1_6
        +parse(file_path, mime_type) ParsedDocument
        +parse_page(file_path, page_num) ParsedPage
        +supported_formats() [pdf, docx, png, jpg, tiff]
        +requires_gpu() true
    }

    class DoclingParser {
        -converter: DoclingConverter
        +parse(file_path, mime_type) ParsedDocument
        +parse_page(file_path, page_num) ParsedPage
        +supported_formats() [pdf, docx, pptx, xlsx, html]
        +requires_gpu() false
    }

    class UnstructuredParser {
        -strategy: hi_res | fast
        +parse(file_path, mime_type) ParsedDocument
        +parse_page(file_path, page_num) ParsedPage
        +supported_formats() [pdf, docx, eml, html, md, txt]
        +requires_gpu() false
    }

    class PyPDFFallbackParser {
        +parse(file_path, mime_type) ParsedDocument
        +parse_page(file_path, page_num) ParsedPage
        +supported_formats() [pdf]
        +requires_gpu() false
    }

    class CompositeParser {
        -parsers: Map~PageType, DocumentParser~
        -classifier: PageClassifier
        +parse(file_path, mime_type) ParsedDocument
    }

    class ParsedDocument {
        +pages: List~ParsedPage~
        +total_pages: int
        +parser_name: str
        +coverage: float
        +failed_pages: List~int~
    }

    class ParsedPage {
        +page_number: int
        +elements: List~ParsedElement~
        +raw_text: str
        +confidence: float
    }

    class ParsedElement {
        +type: str
        +content: str
        +bbox: tuple
        +confidence: float
    }

    DocumentParser <|.. PaddleOCRParser
    DocumentParser <|.. DoclingParser
    DocumentParser <|.. UnstructuredParser
    DocumentParser <|.. PyPDFFallbackParser
    DocumentParser <|.. CompositeParser
    CompositeParser o-- DocumentParser : contains multiple
    DocumentParser --> ParsedDocument : returns
    ParsedDocument *-- ParsedPage
    ParsedPage *-- ParsedElement
```

---

## 5. Triple Retrieval Pipeline

```mermaid
flowchart TD
    QUERY["🔍 User: 'What does Rule 155 say?'"]

    subgraph BM25["BM25 Search (Elasticsearch)"]
        BM25_Q["Query: 'Rule 155'"]
        BM25_R["Result: Exact text match<br/>Page 36, Score: 0.95"]
    end

    subgraph Vector["Vector Search (ChromaDB)"]
        VEC_Q["Query: embed('What does Rule 155 say?')"]
        VEC_R["Result: Semantic match<br/>Pages 36-37, Score: 0.82"]
    end

    subgraph PageIdx["PageIndex (Optional)"]
        PI_Q["LLM navigates document tree"]
        PI_R["Result: Full page 36 content<br/>Reasoning trace included"]
    end

    subgraph Fusion["Reciprocal Rank Fusion"]
        MERGE["Merge all results"]
        DEDUP["Deduplicate by chunk_id"]
        RERANK["Re-rank (cross-encoder)"]
        TOPK["Top-K chunks (K=5)"]
    end

    subgraph Generate["LLM Generation"]
        PROMPT["System prompt +<br/>Retrieved chunks with page numbers"]
        LLM["LLM (Ollama / Cloud)"]
        ANSWER["Answer with citations:<br/>'Rule 155 states that...<br/>[Page 36] [Page 37]'"]
    end

    QUERY --> BM25_Q --> BM25_R
    QUERY --> VEC_Q --> VEC_R
    QUERY --> PI_Q --> PI_R
    BM25_R --> MERGE
    VEC_R --> MERGE
    PI_R --> MERGE
    MERGE --> DEDUP --> RERANK --> TOPK
    TOPK --> PROMPT --> LLM --> ANSWER

    style BM25 fill:#dbeafe,stroke:#3b82f6
    style Vector fill:#fce7f3,stroke:#ec4899
    style PageIdx fill:#f3e8ff,stroke:#a855f7
    style Fusion fill:#fef9c3,stroke:#eab308
    style Generate fill:#dcfce7,stroke:#22c55e
```

---

## 6. Hardware Compatibility Tiers

```mermaid
flowchart TD
    START["🖥️ System Startup"]
    DETECT["Hardware Detection"]

    NVIDIA{"NVIDIA GPU<br/>detected?"}
    VRAM{"VRAM ≥ 24GB?"}
    APPLE{"Apple Silicon<br/>detected?"}

    subgraph T1["Tier 1: Datacenter GPU"]
        T1_D["A40 / H100 / H200"]
        T1_P["Parser: PaddleOCR GPU"]
        T1_L["LLM: Ollama 35B+"]
        T1_E["Embedding: Local"]
    end

    subgraph T2["Tier 2: Consumer GPU"]
        T2_D["RTX 3060 / 4070"]
        T2_P["Parser: PaddleOCR GPU"]
        T2_L["LLM: Ollama 7B-14B"]
        T2_E["Embedding: Local"]
    end

    subgraph T3["Tier 3: Apple Silicon"]
        T3_D["MacBook M1/M2/M3/M4"]
        T3_P["Parser: PaddleOCR CPU"]
        T3_L["LLM: Ollama 7B (Metal)"]
        T3_E["Embedding: Local"]
    end

    subgraph T4["Tier 4: CPU Only"]
        T4_D["Any x86/ARM server"]
        T4_P["Parser: PaddleOCR CPU"]
        T4_L["LLM: Cloud API only"]
        T4_E["Embedding: Cloud or Local"]
    end

    START --> DETECT --> NVIDIA
    NVIDIA -->|Yes| VRAM
    VRAM -->|≥24GB| T1
    VRAM -->|<24GB| T2
    NVIDIA -->|No| APPLE
    APPLE -->|Yes| T3
    APPLE -->|No| T4

    style T1 fill:#dcfce7,stroke:#16a34a
    style T2 fill:#dbeafe,stroke:#2563eb
    style T3 fill:#f3e8ff,stroke:#9333ea
    style T4 fill:#fef9c3,stroke:#ca8a04
```

---

## 7. LLM Provider Routing

```mermaid
flowchart LR
    subgraph Workspace["Workspace Config"]
        WS_CFG["llm_provider: ollama<br/>model: qwen3.5:35b<br/>temperature: 0.1"]
    end

    subgraph LiteLLM["LLM Router (LiteLLM)"]
        ROUTE["Route by provider"]
    end

    subgraph Providers["Providers"]
        OLL["🦙 Ollama<br/>Local GPU/CPU<br/>qwen3.5, gemma4, llama3"]
        OAI["🟢 OpenAI<br/>Cloud API<br/>gpt-4o, gpt-4o-mini"]
        ANT["🟣 Anthropic<br/>Cloud API<br/>claude-sonnet, claude-haiku"]
        GEM["🔵 Google Gemini<br/>Cloud API<br/>gemini-2.5-flash, pro"]
        GRQ["⚡ Groq<br/>Cloud API<br/>Ultra-fast inference"]
        AZU["☁️ Azure OpenAI<br/>Enterprise cloud<br/>gpt-4o via Azure"]
        CUS["🔧 Custom<br/>Any OpenAI-compatible<br/>endpoint"]
    end

    Workspace --> LiteLLM
    ROUTE --> OLL
    ROUTE --> OAI
    ROUTE --> ANT
    ROUTE --> GEM
    ROUTE --> GRQ
    ROUTE --> AZU
    ROUTE --> CUS
```

---

## 8. User Auth Flow

```mermaid
sequenceDiagram
    actor User
    participant Browser
    participant Frontend as Next.js Frontend
    participant API as FastAPI Backend
    participant Auth as Keycloak / Built-in
    participant DB as PostgreSQL

    User->>Browser: Open app
    Browser->>Frontend: GET /workspaces
    Frontend->>API: GET /api/auth/me (no token)
    API->>Frontend: 401 Unauthorized
    Frontend->>Browser: Redirect to login

    alt Built-in Auth Mode
        User->>Browser: Enter email + password
        Browser->>API: POST /api/auth/login
        API->>DB: Verify credentials
        DB->>API: User found, password matches
        API->>Browser: JWT token (httpOnly cookie)
    else Keycloak Mode
        Browser->>Auth: Redirect to Keycloak login
        User->>Auth: Enter credentials
        Auth->>Auth: Validate (LDAP/local/SSO)
        Auth->>Browser: Authorization code
        Browser->>API: POST /api/auth/callback (code)
        API->>Auth: Exchange code for tokens
        Auth->>API: JWT + refresh token
        API->>Browser: Set JWT cookie
    end

    Browser->>Frontend: GET /workspaces (with JWT)
    Frontend->>API: GET /api/workspaces (JWT in cookie)
    API->>API: Validate JWT, extract user_id
    API->>DB: SELECT workspaces WHERE user_id = X
    DB->>API: [workspace_1, workspace_2]
    API->>Frontend: Workspace list
    Frontend->>Browser: Render workspace grid
```

---

## 9. Workspace Data Isolation

```mermaid
flowchart TD
    subgraph Users["Users"]
        U1["👤 Divyesh (Admin)"]
        U2["👤 Raj (Editor)"]
        U3["👤 Priya (Viewer)"]
    end

    subgraph WS1["Workspace: Legal Docs"]
        WS1_D1["📄 GFR-2024.pdf"]
        WS1_D2["📄 Contract-A.pdf"]
        WS1_C["💬 Conversations"]
        WS1_IDX["🔍 BM25 + Vector Index<br/>(workspace_id = ws_legal)"]
        WS1_CFG["⚙️ LLM: qwen3.5:35b<br/>Parser: PaddleOCR"]
    end

    subgraph WS2["Workspace: HR Policies"]
        WS2_D1["📄 Employee-Handbook.pdf"]
        WS2_D2["📄 Leave-Policy.docx"]
        WS2_C["💬 Conversations"]
        WS2_IDX["🔍 BM25 + Vector Index<br/>(workspace_id = ws_hr)"]
        WS2_CFG["⚙️ LLM: gemini-2.5-flash<br/>Parser: Docling"]
    end

    U1 -->|Admin| WS1
    U1 -->|Admin| WS2
    U2 -->|Editor| WS1
    U3 -->|Viewer| WS2

    WS1_IDX -.-x|"🚫 Cannot query"| WS2_IDX

    style WS1 fill:#dbeafe,stroke:#3b82f6
    style WS2 fill:#dcfce7,stroke:#22c55e
```

---

## 10. Chat Flow (End-to-End)

```mermaid
sequenceDiagram
    actor User
    participant FE as Frontend
    participant WS as WebSocket
    participant API as Chat Service
    participant RET as Retrieval Engine
    participant ES as Elasticsearch
    participant VDB as ChromaDB
    participant LLM as LLM Router
    participant OLL as Ollama

    User->>FE: "What does Rule 155 say?"
    FE->>WS: {type: query, message: "..."}
    WS->>API: Process query

    API->>RET: retrieve(query, workspace_id)

    par BM25 Search
        RET->>ES: BM25 query "Rule 155"<br/>filter: workspace_id
        ES->>RET: [chunk_36a: score 0.95]
    and Vector Search
        RET->>VDB: vector query embed("Rule 155")<br/>filter: workspace_id
        VDB->>RET: [chunk_36a: 0.82, chunk_37b: 0.71]
    end

    RET->>RET: Reciprocal Rank Fusion
    RET->>RET: Re-rank top 5
    RET->>API: Top 5 chunks with page numbers

    API->>WS: {type: sources, citations: [...]}
    WS->>FE: Show citation badges

    API->>LLM: Generate with context
    LLM->>OLL: prompt + chunks

    loop Token Streaming
        OLL->>LLM: token
        LLM->>API: token
        API->>WS: {type: token, content: "Rule"}
        WS->>FE: Append to response
    end

    API->>WS: {type: done, tokens: 847}
    FE->>User: Complete answer with [Page 36] [Page 37]
    User->>FE: Click [Page 36]
    FE->>FE: PDF Viewer scrolls to page 36, highlights text
```

---

## 11. Deployment Options

```mermaid
flowchart TD
    subgraph Mode1["Mode 1: Docker Compose (Simple)"]
        DC_CMD["docker compose --profile gpu up -d"]
        DC_STACK["All services on one machine<br/>API + Frontend + Parser + DB + Ollama"]
        DC_USE["Best for: Teams < 50, demos, dev"]
    end

    subgraph Mode2["Mode 2: Kubernetes (Enterprise)"]
        K8S_NS1["Namespace: npuden-docqa<br/>API (x4) + Frontend (x2) +<br/>Workers (x4) + Parser + DBs"]
        K8S_NS2["Namespace: auth<br/>Keycloak + PostgreSQL"]
        K8S_NS3["Namespace: ai-services<br/>Ollama (GPU)"]
        K8S_USE["Best for: 50-10K users, HA, scaling"]
    end

    subgraph Mode3["Mode 3: Helm Chart (One-Command)"]
        HELM_CMD["helm install docqa npuden/docqa<br/>--set gpu.enabled=true<br/>--set auth.mode=keycloak"]
        HELM_USE["Best for: Repeatable client deployments"]
    end

    DC_CMD --> DC_STACK --> DC_USE
    K8S_NS1 --- K8S_NS2 --- K8S_NS3 --> K8S_USE
    HELM_CMD --> HELM_USE

    style Mode1 fill:#dbeafe,stroke:#3b82f6
    style Mode2 fill:#dcfce7,stroke:#22c55e
    style Mode3 fill:#f3e8ff,stroke:#9333ea
```

---

## 12. Database Schema (ER Diagram)

```mermaid
erDiagram
    USERS {
        uuid id PK
        varchar email UK
        varchar display_name
        varchar role
        boolean is_active
        timestamp created_at
        timestamp last_login
    }

    WORKSPACES {
        uuid id PK
        varchar name
        varchar slug UK
        text description
        uuid created_by FK
        jsonb llm_config
        jsonb embedding_config
        jsonb parser_config
        jsonb retrieval_config
        int storage_quota_mb
        boolean is_active
    }

    WORKSPACE_MEMBERS {
        uuid user_id FK
        uuid workspace_id FK
        varchar role
        timestamp joined_at
    }

    DOCUMENTS {
        uuid id PK
        uuid workspace_id FK
        varchar filename
        varchar storage_key
        varchar parsed_storage_key
        bigint file_size
        int total_pages
        int parsed_pages
        int total_chunks
        int indexed_chunks
        float coverage
        varchar parsing_status
        varchar parser_used
        uuid uploaded_by FK
    }

    CHUNKS {
        uuid id PK
        uuid document_id FK
        uuid workspace_id FK
        int[] page_numbers
        text section_heading
        text content
        varchar chunk_type
        int token_count
        varchar embedding_id
        varchar es_doc_id
    }

    CONVERSATIONS {
        uuid id PK
        uuid workspace_id FK
        uuid user_id FK
        varchar title
        timestamp created_at
    }

    MESSAGES {
        uuid id PK
        uuid conversation_id FK
        varchar role
        text content
        jsonb citations
        int tokens_used
        varchar model_used
    }

    USERS ||--o{ WORKSPACE_MEMBERS : "belongs to"
    WORKSPACES ||--o{ WORKSPACE_MEMBERS : "has members"
    USERS ||--o{ DOCUMENTS : "uploads"
    WORKSPACES ||--o{ DOCUMENTS : "contains"
    DOCUMENTS ||--o{ CHUNKS : "split into"
    WORKSPACES ||--o{ CHUNKS : "scoped to"
    WORKSPACES ||--o{ CONVERSATIONS : "has"
    USERS ||--o{ CONVERSATIONS : "creates"
    CONVERSATIONS ||--o{ MESSAGES : "contains"
```

---

## 13. Development Phase Timeline

```mermaid
gantt
    title NpuDen DocQA — Development Timeline
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Phase 1: Foundation
    FastAPI scaffold + DB schema       :p1a, 2026-06-09, 5d
    Parser interface + PaddleOCR       :p1b, after p1a, 5d
    Chunking + Dual indexing           :p1c, after p1b, 4d
    Hybrid retrieval + LLM generation  :p1d, after p1c, 4d
    Chat UI + Upload + Docker Compose  :p1e, after p1d, 3d

    section Phase 2: Multi-User
    Auth (built-in + Keycloak)         :p2a, after p1e, 5d
    Workspace CRUD + membership        :p2b, after p2a, 5d
    Workspace-scoped everything        :p2c, after p2b, 5d

    section Phase 3: Enterprise
    LLM provider management UI         :p3a, after p2c, 4d
    PDF viewer + citation highlights   :p3b, after p3a, 5d
    Admin dashboard + analytics        :p3c, after p3b, 4d
    K8s manifests + Helm chart         :p3d, after p3c, 2d

    section Phase 4: Advanced RAG
    Docling + Unstructured parsers     :p4a, after p3d, 5d
    Composite parser                   :p4b, after p4a, 3d
    PageIndex + GraphRAG               :p4c, after p4b, 7d

    section Phase 5: Scale + Polish
    Horizontal scaling + Milvus        :p5a, after p4c, 5d
    SSO + audit logging                :p5b, after p5a, 5d
    Design polish + mobile             :p5c, after p5b, 5d
    Documentation + load testing       :p5d, after p5c, 5d
```

---

## 14. Storage Architecture

```mermaid
flowchart LR
    subgraph Upload["User Upload"]
        FILE["📄 GFR-2024.pdf<br/>12 MB, 50 pages"]
    end

    subgraph MinIO["MinIO (Object Storage)"]
        ORIG["📦 Original File<br/>/ws_legal/original/abc.pdf<br/>Preserved forever"]
        PARSED["📦 Parsed JSON<br/>/ws_legal/parsed/abc.json<br/>Re-chunk without re-parse"]
    end

    subgraph PostgreSQL["PostgreSQL (Relational)"]
        META["📋 File Metadata<br/>filename, size, pages,<br/>coverage, status"]
        CHUNKS["📋 Chunk Records<br/>180 chunks with<br/>page numbers, headings"]
        HISTORY["📋 Chat History<br/>conversations, messages,<br/>citations"]
    end

    subgraph Elasticsearch["Elasticsearch (BM25)"]
        BM25["🔍 Inverted Index<br/>Exact keyword lookup<br/>'Rule' → chunk_36a<br/>'155' → chunk_36a"]
    end

    subgraph ChromaDB["ChromaDB (Vector)"]
        VEC["🧠 Embeddings<br/>768-dim vectors<br/>Semantic similarity"]
    end

    FILE --> ORIG
    FILE -->|parsed| PARSED
    FILE --> META
    FILE -->|chunked| CHUNKS
    CHUNKS -->|text| BM25
    CHUNKS -->|embedded| VEC

    style MinIO fill:#fef3c7,stroke:#d97706
    style PostgreSQL fill:#dbeafe,stroke:#2563eb
    style Elasticsearch fill:#dcfce7,stroke:#16a34a
    style ChromaDB fill:#fce7f3,stroke:#ec4899
```

---

## 15. Frontend Page Map

```mermaid
flowchart TD
    ROOT["/"] --> LOGIN["/login"]
    ROOT --> DASH["/workspaces"]

    DASH --> WS1["/workspaces/legal-docs"]
    DASH --> WS2["/workspaces/hr-policies"]
    DASH --> CREATE["/workspaces/new"]

    WS1 --> CHAT["/workspaces/legal-docs/chat"]
    WS1 --> FILES["/workspaces/legal-docs/files"]
    WS1 --> SETTINGS["/workspaces/legal-docs/settings"]

    CHAT --- CHAT_DESC["Chat interface<br/>+ PDF viewer panel<br/>+ Citation highlights"]
    FILES --- FILES_DESC["Document manager<br/>+ Upload zone<br/>+ Coverage badges"]
    SETTINGS --- SETTINGS_DESC["LLM config<br/>+ Parser config<br/>+ Retrieval settings<br/>+ Member management"]

    ROOT --> ADMIN["/admin"]
    ADMIN --> ADMIN_USERS["/admin/users"]
    ADMIN --> ADMIN_WS["/admin/workspaces"]
    ADMIN --> ADMIN_ANALYTICS["/admin/analytics"]
    ADMIN --> ADMIN_SYSTEM["/admin/system"]

    ADMIN_ANALYTICS --- ANALYTICS_DESC["Queries/day<br/>Tokens used<br/>Document coverage<br/>Active users"]

    style CHAT fill:#dcfce7,stroke:#22c55e
    style FILES fill:#dbeafe,stroke:#3b82f6
    style SETTINGS fill:#fef9c3,stroke:#eab308
    style ADMIN fill:#fce7f3,stroke:#ec4899
```

---

*Visual companion to the NpuDen DocQA Architecture Plan v2.*  
*All diagrams render in any Mermaid-compatible viewer (GitHub, VS Code, Obsidian, etc.)*
