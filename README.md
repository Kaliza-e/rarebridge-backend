# RareBridge Backend API

[![NestJS](https://img.shields.io/badge/NestJS-11.x-E0234E.svg?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Google Sheets API](https://img.shields.io/badge/Google%20Sheets-v4-34A853.svg?logo=googlesheets&logoColor=white)](https://developers.google.com/sheets/api)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](LICENSE)

A high-performance NestJS backend API powering **RareBridge** — a specialized rare disease intelligence and resource directory. The backend integrates with Google Sheets as a headless CMS, extracting raw medical data and rich hyperlinked spreadsheet content, parsing it into strongly typed JSON structures, and delivering it via cached REST endpoints.

---

## 📑 Table of Contents

- [Architecture & Data Flow](#-architecture--data-flow)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
  - [Prerequisites](#1-prerequisites)
  - [Installation](#2-installation)
  - [Configuration](#3-environment-configuration)
  - [Google Cloud Service Account Setup](#4-google-service-account-setup)
- [Running the Application](#-running-the-application)
- [API Reference](#-api-reference)
  - [Get All Diseases & Search](#1-get-all-diseases--search)
  - [Get Disease Categories](#2-get-disease-categories)
  - [Get Disease by ID](#3-get-disease-by-id)
  - [Get Disease by Number](#4-get-disease-by-disease-number)
- [Spreadsheet Column Mapping](#-spreadsheet-column-mapping)
- [Production Deployment](#-production-deployment)
- [Troubleshooting](#-troubleshooting)

---

## 🏗 Architecture & Data Flow

```mermaid
flowchart LR
    A[Google Sheets CMS] -->|Google Sheets API v4| B[GoogleSheetsService]
    B -->|Extract Cells, Runs & Links| C[TextParser & ValidationService]
    C -->|Sanitize & Validate Schema| D[In-Memory Cache (TTL: 5m)]
    D -->|Filtered & Sorted| E[DiseaseService]
    E -->|REST Response| F[Frontend / Client Application]
```

1. **Extraction**: `GoogleSheetsService` queries Google Sheets API v4 using `spreadsheets.get` with full grid runs to preserve cell formatting, formula hyperlinks (`=HYPERLINK()`), and embedded markdown links.
2. **Parsing & Sanitization**: `TextParser` uses smart regular expressions to break unstructured medical texts into structured models (arrays, diagnostic steps, lifestyle categories, deduplicated specialists, and facts/myths).
3. **Validation**: `ValidationService` verifies required fields (`diseaseNumber`, `name`, `category`, `overview`) and provides sensible defaults for optional sections.
4. **Caching**: Results are cached in memory for 5 minutes (`CACHE_TTL_MS = 300000`) to guarantee lightning-fast response times and prevent rate limit exhaustion.

---

## ✨ Key Features

- **Headless CMS via Google Sheets**: Manage disease catalogs, specialists, and clinical resources directly from Google Sheets without requiring SQL database migrations.
- **Rich Hyperlink Extraction**: Preserves inline links from raw sheets text, formula hyperlinks, and rich text runs.
- **Smart Natural Language Medical Parsing**:
  - **Symptoms & Types**: Parses bullet points, numbers, and delimiters into clean string arrays.
  - **Diagnostic Procedures**: Converts multi-step clinical descriptions into step-by-step diagnostic workflows (`name`, `what`, `how`, `result`).
  - **Lifestyle & Daily Living**: Segregates raw text into distinct categories (`therapies`, `nutrition`, `devices`, `caregiverTips`, `community`).
  - **Specialist Directory**: Parses formatted specialist profiles, normalizes contact/location/publications, and automatically deduplicates multiple specialist entries.
  - **Facts vs. Myths**: Identifies myth/fact pairs, assigning boolean verification flags and clear explanations.
  - **Clinical Research & Pharma**: Extracts pharmaceutical directory entries and research institutions.
- **In-Memory Caching with TTL**: Automatic 5-minute cache ensures single-digit millisecond latency for repeat queries.
- **Multi-Field Case-Insensitive Search**: Search effortlessly across disease names, categories, and overviews.

---

## 🛠 Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Framework** | [NestJS 11](https://nestjs.com/) | Progressive Node.js framework with Express platform |
| **Language** | [TypeScript 5](https://www.typescriptlang.org/) | Strongly typed JavaScript |
| **API Client** | [Google APIs (`googleapis`)](https://github.com/googleapis/google-api-nodejs-client) | Official Google Sheets v4 API client |
| **Validation** | `class-validator` / `class-transformer` | DTO transformation and validation |
| **Configuration** | `@nestjs/config` | Environment configuration management |

---

## 📁 Project Structure

```
rarebridge-backend/
├── src/
│   ├── app.module.ts              # Root NestJS application module
│   ├── main.ts                   # Application bootstrap & global pipes
│   ├── disease/                  # Disease management feature module
│   │   ├── disease.controller.ts # REST API routing & query parameters
│   │   ├── disease.module.ts     # Disease module wiring
│   │   └── disease.service.ts    # Caching, search & query business logic
│   ├── google-sheets/           # Google Sheets integration module
│   │   ├── google-sheets.module.ts
│   │   └── google-sheets.service.ts # Sheets v4 API client & rich text parser
│   ├── parsing/                 # Parsing engine
│   │   └── text-parser.util.ts   # Regex parsers for medical text blocks
│   └── validation/              # Data sanitation & validation
│       ├── validation.module.ts
│       └── validation.service.ts # Data transformer & schema validator
├── .env.example                  # Template environment variables
├── .gitignore                    # Git ignore specifications
├── package.json                  # NPM dependencies and scripts
├── tsconfig.json                 # TypeScript compiler configuration
└── README.md
```

---

## 🚀 Getting Started

### 1. Prerequisites

- **Node.js** `>= 18.x`
- **npm** `>= 9.x`
- A Google Cloud Project with the **Google Sheets API** enabled.

### 2. Installation

```bash
# Clone the repository
git clone https://github.com/Kaliza-e/rarebridge-backend.git
cd rarebridge-backend

# Install dependencies
npm install
```

### 3. Environment Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Populate the `.env` variables:

```env
# Google Service Account Credentials
# Option A: Single-line JSON (Recommended for cloud deployments like Render/Railway)
GOOGLE_SERVICE_ACCOUNT_KEY_JSON={"type":"service_account","project_id":"your-project-id",...}

# Option B: Path to JSON key file (Alternative for local development)
# GOOGLE_SERVICE_ACCOUNT_KEY="./service-account-key.json"

# Google Sheet Configuration
GOOGLE_SPREADSHEET_ID=your_spreadsheet_id_here
GOOGLE_SPREADSHEET_RANGE=Disease Information!A:Z

# Server Port
PORT=3000
```

### 4. Google Service Account Setup

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project, then navigate to **APIs & Services > Library** and enable **Google Sheets API**.
3. Navigate to **APIs & Services > Credentials** and create a **Service Account**.
4. Generate a new **JSON Key** for this Service Account and download it.
5. Open your Google Sheet in your browser and click **Share**.
6. Add the Service Account's email address (e.g. `your-service-account@project.iam.gserviceaccount.com`) as a **Viewer**.

---

## 💻 Running the Application

```bash
# Development mode (hot reload with ts-node)
npm run dev

# Production build
npm run build

# Start production server
npm start
```

---

## 📡 API Reference

Base URL: `http://localhost:3000` (or your deployed URL)

### 1. Get All Diseases / Search

```http
GET /diseases
```

#### Query Parameters

| Parameter | Type | Required | Description |
|---|---|---|---|
| `search` | `string` | No | Case-insensitive search matching against name, category, or overview |
| `category` | `string` | No | Exact category filter |

#### Example Requests
- `GET /diseases`
- `GET /diseases?search=krabbe`
- `GET /diseases?category=Metabolic%20Disorders`

#### Example Response
```json
[
  {
    "id": "RD001",
    "diseaseNumber": "RD001",
    "name": "Krabbe Disease",
    "category": "Metabolic Disorders",
    "overview": "Krabbe disease is a rare inherited disorder that destroys the protective myelin sheath...",
    "causes": "Mutations in the GALC gene lead to a deficiency of galactosylceramidase.",
    "typesAndSymptoms": [
      "Irritability and unexplained crying",
      "Muscle stiffness and spasms",
      "Progressive developmental delays"
    ],
    "diagnosis": [
      {
        "name": "GALC Enzyme Activity Assay",
        "what": "Measures galactosylceramidase enzyme levels",
        "how": "White blood cell or skin fibroblast test",
        "result": "Low or absent enzyme activity confirms diagnosis"
      },
      {
        "name": "Genetic Sequencing",
        "what": "Identifies mutations in the GALC gene",
        "how": "DNA analysis from blood or saliva",
        "result": "Identifies specific disease-causing mutations"
      }
    ],
    "lifestyleAndDailySupport": {
      "therapies": [
        "Physical therapy to maintain muscle function",
        "Occupational therapy for supportive daily care"
      ],
      "nutrition": "Tube feeding support when swallowing difficulties develop",
      "devices": [
        "Supportive seating",
        "Mobility aids"
      ],
      "caregiverTips": [
        "Establish structured sensory-friendly routines",
        "Coordinate closely with a pediatric palliative care team"
      ],
      "community": "Krabbe Connect & United Leukodystrophy Foundation",
      "raw": "..."
    },
    "treatmentsAndPharma": [
      {
        "name": "Hematopoietic Stem Cell Transplantation (HSCT)",
        "focus": "Slows disease progression if performed pre-symptomatically",
        "url": "https://example.org/treatments/hsct"
      }
    ],
    "faqs": [
      {
        "question": "Is Krabbe disease inherited?",
        "answer": "Yes, it is inherited in an autosomal recessive pattern.",
        "order": 1
      }
    ],
    "factsMyths": [
      {
        "statement": "Krabbe disease can be transmitted to others.",
        "isFact": false,
        "explanation": "Krabbe disease is a genetic condition caused by inherited mutations, not an infectious disease.",
        "order": 1
      }
    ],
    "specialists": [
      {
        "name": "Dr. Eleanor Vance, MD",
        "profession": "Pediatric Neurologist",
        "specialization": "Leukodystrophies",
        "organization": "Children's Medical Center",
        "location": "Boston, MA",
        "contact": "contact@example.org",
        "publications": "Innovations in Early Leukodystrophy Care (2024)",
        "sources": [
          "https://pubmed.ncbi.nlm.nih.gov/example"
        ],
        "focus": "Leukodystrophies",
        "why": "Dr. Eleanor Vance, MD"
      }
    ],
    "sources": [
      {
        "title": "National Organization for Rare Disorders (NORD)",
        "url": "https://rarediseases.org/rare-diseases/krabbe-disease/",
        "type": "Patient Organization",
        "description": "NORD Rare Disease Database Report"
      }
    ]
  }
]
```

---

### 2. Get Disease Categories

Returns a unique, alphabetically sorted list of all categories.

```http
GET /diseases/categories
```

#### Example Response
```json
[
  "Autoimmune Disorders",
  "Genetic Disorders",
  "Metabolic Disorders",
  "Neurological Disorders",
  "Neuromuscular Disorders"
]
```

---

### 3. Get Disease by ID

Finds a disease by `id` or `diseaseNumber`.

```http
GET /diseases/:id
```

#### Example
`GET /diseases/RD001`

---

### 4. Get Disease by Disease Number

```http
GET /diseases/number/:diseaseNumber
```

#### Example
`GET /diseases/number/RD001`

---

## 📊 Spreadsheet Column Mapping

The Google Sheets parser normalizes header variations automatically:

| Spreadsheet Column Header Variations | Internal Model Field | Parsed Output Format |
|---|---|---|
| `Disease No.`, `Disease Number`, `Disease #`, `No.` | `diseaseNumber` | `string` |
| `Disease Name`, `Name`, `Disease` | `name` | `string` |
| `Category`, `Categories` | `category` | `string` |
| `Overview`, `Description`, `Summary` | `overview` | `string` |
| `Causes`, `Cause` | `causes` | `string` |
| `Types and Symptoms`, `Symptoms`, `Types & Symptoms` | `typesAndSymptoms` | `string[]` |
| `Diagnosis`, `Diagnostic`, `Diagnostics` | `diagnosis` | `DiagnosticStep[]` |
| `Lifestyle and Daily Support+Community`, `Lifestyle` | `lifestyleAndDailySupport` | `LifestyleData` |
| `Research and Pharma Directory`, `Treatments and Pharma` | `treatmentsAndPharma` | `ResearchOrg[]` |
| `FAQs`, `FAQ`, `FAQs for a disease` | `faqs` | `ParsedFAQ[]` |
| `Facts vs. Myths`, `Facts vs Myths`, `Fact vs Myth` | `factsMyths` | `ParsedFactMyth[]` |
| `Specialist Directory`, `Specialists` | `specialists` | `ParsedSpecialist[]` |
| `Sources`, `Source Directory` | `sources` | `Source[]` |

---

## 🚢 Production Deployment

### Deploying to Render / Railway / Heroku

1. **Build Command**: `npm install && npm run build`
2. **Start Command**: `npm run start`
3. **Environment Variables**:
   - `GOOGLE_SERVICE_ACCOUNT_KEY_JSON`: Paste the entire content of your Google Service Account JSON file as a single-line string.
   - `GOOGLE_SPREADSHEET_ID`: Your Google Spreadsheet ID.
   - `GOOGLE_SPREADSHEET_RANGE`: `Disease Information!A:Z` (or your desired sheet tab and range).
   - `PORT`: (Set automatically by Render / Heroku).

---

## ❓ Troubleshooting

- **Google Sheets 403 / Permission Denied**:
  - Verify you shared your spreadsheet with the `client_email` listed in your Service Account JSON.
- **Empty Data Returned**:
  - Check that the `GOOGLE_SPREADSHEET_RANGE` matches the actual tab name in your spreadsheet (e.g. `Disease Information!A:Z`).
- **Malformed Key JSON in Production**:
  - Ensure the `GOOGLE_SERVICE_ACCOUNT_KEY_JSON` is valid JSON and not enclosed in extra surrounding quotes.

---

## 📄 License

This project is licensed under the [ISC License](LICENSE).
