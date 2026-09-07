# RareBridge Backend API

A NestJS backend API for RareBridge - a rare disease knowledge platform. This backend provides RESTful endpoints for managing disease data, with support for importing data from Google Sheets.

## Tech Stack

- **Framework**: NestJS
- **ORM**: Prisma
- **Database**: PostgreSQL
- **Validation**: class-validator, class-transformer
- **Google Sheets Integration**: googleapis

## Features

- CRUD operations for disease data
- Search and filtering functionality
- Google Sheets data import
- Data validation and sanitization
- Relational database structure with FAQs, facts/myths, specialists, and sources

## Database Schema

The database is structured based on the RareBridge Google Sheets template:

### Disease Model
- `diseaseNumber`: Unique identifier for the disease
- `name`: Disease name
- `category`: Disease category
- `overview`: Disease overview
- `causes`: Causes information
- `typesAndSymptoms`: Types and symptoms
- `diagnosis`: Diagnosis information
- `lifestyleAndDailySupport`: Lifestyle and daily support
- `treatmentsAndPharma`: Treatments and pharmaceutical information

### Related Models
- **FAQ**: Frequently asked questions for each disease
- **FactMyth**: Facts vs myths for each disease
- **Specialist**: Specialist directory entries
- **Source**: Source/reference information

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="postgresql://username:password@localhost:5432/rarebridge?schema=public"
GOOGLE_SERVICE_ACCOUNT_KEY="./path/to/service-account-key.json"
```

### 3. Set up PostgreSQL Database

Make sure you have PostgreSQL installed and running. Create a database:

```sql
CREATE DATABASE rarebridge;
```

### 4. Run Prisma Migrations

```bash
npm run prisma:migrate
```

This will create the database schema based on `prisma/schema.prisma`.

### 5. Generate Prisma Client

```bash
npm run prisma:generate
```

### 6. Set up Google Sheets Integration (Optional)

If you want to import data from Google Sheets:

1. Create a Google Cloud project
2. Enable Google Sheets API
3. Create a service account
4. Download the service account key JSON file
5. Share your Google Sheet with the service account email
6. Set the `GOOGLE_SERVICE_ACCOUNT_KEY` environment variable to the path of your key file

## Running the Application

### Development Mode

```bash
npm run dev
```

The API will be available at `http://localhost:3001`

### Production Mode

```bash
npm run build
npm start
```

## API Endpoints

### Diseases

#### Create Disease
```http
POST /diseases
Content-Type: application/json

{
  "diseaseNumber": "RD001",
  "name": "Krabbe Disease",
  "category": "Metabolic Disorders",
  "overview": "Krabbe disease is a rare genetic disorder...",
  "causes": "Caused by mutations in the GALC gene...",
  "typesAndSymptoms": "Symptoms include...",
  "diagnosis": "Diagnosis is typically made through...",
  "lifestyleAndDailySupport": "Daily management includes...",
  "treatmentsAndPharma": "Treatment options include...",
  "faqs": [
    {
      "question": "What is Krabbe disease?",
      "answer": "Krabbe disease is...",
      "order": 1
    }
  ],
  "factsMyths": [
    {
      "statement": "Krabbe disease is contagious",
      "isFact": false,
      "explanation": "Krabbe disease is genetic...",
      "order": 1
    }
  ],
  "specialists": [
    {
      "name": "Dr. John Smith",
      "organization": "Rare Disease Center",
      "location": "New York, NY",
      "contact": "john.smith@example.com",
      "focus": "Metabolic disorders",
      "why": "Specialized in rare genetic disorders"
    }
  ],
  "sources": [
    {
      "title": "Krabbe Disease Foundation",
      "url": "https://krabbe.org",
      "type": "Organization",
      "description": "Patient support organization"
    }
  ]
}
```

#### Get All Diseases
```http
GET /diseases
GET /diseases?search=krabbe
GET /diseases?category=Metabolic%20Disorders
```

#### Get Disease by ID
```http
GET /diseases/:id
```

#### Get Disease by Number
```http
GET /diseases/number/:diseaseNumber
```

#### Update Disease
```http
PUT /diseases/:id
Content-Type: application/json

{
  "name": "Updated Disease Name"
}
```

#### Delete Disease
```http
DELETE /diseases/:id
```

#### Get Categories
```http
GET /diseases/categories
```

### Import from Google Sheets

```http
POST /diseases/import
Content-Type: application/json

{
  "spreadsheetId": "your-spreadsheet-id",
  "range": "Sheet1!A1:Z100"
}
```

## Google Sheets Structure

Your Google Sheet should follow this column structure:

1. Disease Number
2. Name
3. Category
4. Overview
5. Causes
6. Types and Symptoms
7. Diagnosis
8. Lifestyle and Daily Support
9. Treatments and Pharma
10. FAQs for a disease (JSON array)
11. Facts vs Myths (JSON array)
12. Specialist Directory (JSON array)
13. Sources (JSON array)

For nested data (FAQs, Facts/Myths, Specialists, Sources), you can either:
- Store as JSON strings in the cells
- Use separate sheets and reference them

## Data Validation

The API includes automatic data validation:
- Required field validation
- Data type validation
- HTML/script tag sanitization
- Nested data structure validation
- Google Sheets data transformation

## Development

### Project Structure

```
src/
├── app.module.ts              # Main application module
├── main.ts                   # Application entry point
├── disease/                  # Disease module
│   ├── disease.controller.ts # API endpoints
│   ├── disease.service.ts    # Business logic
│   ├── disease.module.ts     # Module definition
│   └── dto/                  # Data transfer objects
│       ├── create-disease.dto.ts
│       └── update-disease.dto.ts
├── prisma/                  # Prisma module
│   ├── prisma.service.ts     # Database service
│   └── prisma.module.ts      # Module definition
├── google-sheets/           # Google Sheets integration
│   ├── google-sheets.service.ts
│   └── google-sheets.module.ts
└── validation/              # Data validation
    ├── validation.service.ts
    └── validation.module.ts
prisma/
├── schema.prisma            # Database schema
└── migrations/              # Database migrations
```

## Troubleshooting

### Prisma Client Issues
If you encounter Prisma client issues:
```bash
npm run prisma:generate
```

### Database Connection Issues
Make sure your PostgreSQL is running and the DATABASE_URL is correct in your `.env` file.

### Google Sheets Authentication
Ensure your service account has the correct permissions and the sheet is shared with the service account email.

## License

ISC
