# Shared Expenses App — Implementation Plan

## Project Overview

A shared expense-splitting web app for a flat where membership changes over time.
Four original flatmates (Aisha, Rohan, Priya, Meera). Meera left end of March 2026.
Sam joined mid-April 2026. Dev is a recurring visitor (not a resident).

**Tech Stack:**
- Frontend: React + Vite, Tailwind CSS, React Router v6, Axios (served statically by Express)
- Backend: Node.js + Express.js
- Database: PostgreSQL on Neon (free tier)
- ORM: Prisma
- Auth: JWT (access token + refresh token)
- Unified Deployment: Render (free tier) - single Node.js app serving both Express API and React frontend

---

## User Review Required

> [!IMPORTANT]
> We are pivoting from a two-service deployment (Vercel frontend + Render backend) to a single unified Node.js service on Render that serves the React frontend statically and hosts the Express API.
> 
> Key adjustments:
> 1. CORS is completely removed since the frontend and backend are served from the same origin.
> 2. `VITE_API_URL` environment variable is removed; API requests use relative paths starting with `/api`.
> 3. Local development uses Vite's proxy config to redirect `/api` requests from the Vite dev server (port 5173) to the Express backend (port 3000).

---

## Repository Structure

```
splitwise-clone/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── migrations/
│   ├── public/         ← Vite build output goes here (gitignored)
│   ├── src/
│   │   ├── index.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   ├── auth.js
│   │   │   ├── groups.js
│   │   │   ├── expenses.js
│   │   │   ├── balances.js
│   │   │   ├── settlements.js
│   │   │   └── import.js
│   │   ├── services/
│   │   │   ├── balanceService.js
│   │   │   ├── importService.js
│   │   │   └── currencyService.js
│   │   └── utils/
│   │       ├── splitCalculator.js
│   │       └── dateParser.js
│   └── package.json
├── frontend/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── api/
│   │   │   └── axios.js
│   │   ├── contexts/
│   │   │   └── AuthContext.jsx
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Register.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── GroupDetail.jsx
│   │   │   ├── ExpenseDetail.jsx
│   │   │   ├── Balances.jsx
│   │   │   ├── Import.jsx
│   │   │   └── Settlements.jsx
│   │   └── components/
│   │       ├── Navbar.jsx
│   │       ├── ExpenseForm.jsx
│   │       ├── SplitEditor.jsx
│   │       ├── AnomalyReview.jsx
│   │       └── BalanceTable.jsx
│   ├── package.json
│   └── vite.config.js
├── package.json        ← root scripts for building everything
├── README.md
├── SCOPE.md
├── DECISIONS.md
└── AI_USAGE.md
```

---

## Database Schema (Prisma)

```prisma
// schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            Int      @id @default(autoincrement())
  email         String   @unique
  name          String
  passwordHash  String
  createdAt     DateTime @default(now())

  groupMemberships  GroupMembership[]
  expensesPaid      Expense[]         @relation("PaidBy")
  splits            ExpenseSplit[]
  sentSettlements   Settlement[]      @relation("Payer")
  receivedSettlements Settlement[]    @relation("Payee")
}

model Group {
  id          Int      @id @default(autoincrement())
  name        String
  description String?
  currency    String   @default("INR")
  createdAt   DateTime @default(now())

  memberships GroupMembership[]
  expenses    Expense[]
  settlements Settlement[]
}

model GroupMembership {
  id       Int       @id @default(autoincrement())
  groupId  Int
  userId   Int
  joinedAt DateTime
  leftAt   DateTime?            // NULL means currently active

  group    Group @relation(fields: [groupId], references: [id])
  user     User  @relation(fields: [userId], references: [id])

  @@unique([groupId, userId, joinedAt])
}

model Expense {
  id          Int      @id @default(autoincrement())
  groupId     Int
  description String
  amount      Decimal  @db.Decimal(12, 4)   // 4 decimal places to handle edge cases
  currency    String   @default("INR")
  amountInr   Decimal  @db.Decimal(12, 2)   // converted to INR at import time
  exchangeRate Decimal? @db.Decimal(10, 6)  // rate used for conversion
  paidById    Int
  splitType   SplitType
  date        DateTime
  notes       String?
  isDeleted   Boolean  @default(false)       // soft delete
  importRunId Int?

  group       Group          @relation(fields: [groupId], references: [id])
  paidBy      User           @relation("PaidBy", fields: [paidById], references: [id])
  splits      ExpenseSplit[]
  importRun   ImportRun?     @relation(fields: [importRunId], references: [id])
}

enum SplitType {
  EQUAL
  PERCENTAGE
  SHARE
  UNEQUAL
}

model ExpenseSplit {
  id         Int     @id @default(autoincrement())
  expenseId  Int
  userId     Int
  share      Decimal @db.Decimal(12, 4)   // raw share/percentage/exact amount depending on splitType
  amountOwed Decimal @db.Decimal(12, 2)   // final computed INR amount owed

  expense    Expense @relation(fields: [expenseId], references: [id])
  user       User    @relation(fields: [userId], references: [id])
}

model Settlement {
  id        Int      @id @default(autoincrement())
  groupId   Int
  payerId   Int
  payeeId   Int
  amount    Decimal  @db.Decimal(12, 2)
  currency  String   @default("INR")
  date      DateTime
  notes     String?
  importRunId Int?

  group     Group    @relation(fields: [groupId], references: [id])
  payer     User     @relation("Payer", fields: [payerId], references: [id])
  payee     User     @relation("Payee", fields: [payeeId], references: [id])
  importRun ImportRun? @relation(fields: [importRunId], references: [id])
}

model ImportRun {
  id          Int      @id @default(autoincrement())
  filename    String
  importedAt  DateTime @default(now())
  status      ImportStatus @default(PENDING)
  totalRows   Int      @default(0)
  importedRows Int     @default(0)
  skippedRows Int      @default(0)

  anomalies   ImportAnomaly[]
  expenses    Expense[]
  settlements Settlement[]
}

enum ImportStatus {
  PENDING
  REVIEW       // anomalies surfaced, awaiting user decisions
  COMPLETE
  FAILED
}

model ImportAnomaly {
  id          Int      @id @default(autoincrement())
  importRunId Int
  rowNumber   Int
  rowRaw      String   // original CSV row as JSON string
  anomalyType String   // e.g. DUPLICATE, MISSING_PAYER, CURRENCY_MISSING, etc.
  description String
  severity    AnomalySeverity
  resolution  AnomalyResolution @default(PENDING)
  resolvedData String?  // JSON: user's chosen corrected values

  importRun   ImportRun @relation(fields: [importRunId], references: [id])
}

enum AnomalySeverity {
  ERROR    // cannot import without user decision
  WARNING  // imported with assumption, user can override
  INFO     // informational only
}

enum AnomalyResolution {
  PENDING
  ACCEPTED      // import as-is or with app's default fix
  MODIFIED      // user provided corrected data
  SKIPPED       // user decided to skip this row
}
```

---

## All 19 CSV Data Problems Detected

| # | Row | Anomaly Type | Description | Severity | Default Policy |
|---|-----|-------------|-------------|----------|----------------|
| 1 | 5 | DUPLICATE | "dinner - marina bites" is the same expense as row 4 ("Dinner at Marina Bites") — same payer, date, amount | ERROR | Surface both rows. User picks which to keep. Default: keep row 4 (better formatting), skip row 5. |
| 2 | 6 | MALFORMED_AMOUNT | Electricity Feb amount is "1,200" — thousands separator inside quotes | WARNING | Strip commas, parse as 1200. Log fix. |
| 3 | 13 | SETTLEMENT_AS_EXPENSE | "Rohan paid Aisha back" — note says "this is a settlement not an expense??" with empty split_type | ERROR | Import as Settlement record, not Expense. Surface to user for confirmation. |
| 4 | 14 | PERCENTAGE_SUM | Pizza Friday: 30+30+30+20 = 110%, not 100% | ERROR | Surface to user. Default: normalize to 100% proportionally (Aisha 27.27%, Rohan 27.27%, Priya 27.27%, Meera 18.18%). |
| 5 | 12 | MISSING_PAYER | House cleaning supplies: paid_by is empty | ERROR | Surface to user. Cannot import without payer decision. User must pick or skip. |
| 6 | 19,20,21 | FOREIGN_CURRENCY | Goa villa ($540), Beach shack ($84), Parasailing ($150), Parasailing refund (-$30) — USD amounts | WARNING | Fetch live USD→INR rate at import time (or use historical rate for the expense date). Store original currency + rate used. Surface rate to user for confirmation. |
| 7 | 21 | NONMEMBER_IN_SPLIT | "Dev's friend Kabir" listed in Parasailing split — not a registered member | ERROR | Surface to user. Options: create guest user "Kabir" or redistribute Kabir's share equally among the others. Default: create guest Kabir with a note. |
| 8 | 25 | NEGATIVE_AMOUNT | Parasailing refund: amount is -30 USD | WARNING | Treat as a refund (negative expense). Reduces each member's share proportionally. Surface to user with explanation. |
| 9 | 26 | AMBIGUOUS_DATE | Airport cab: date is "Mar-14" — not standard DD-MM-YYYY | WARNING | Parse as 14-03-2026. Log the parse decision. |
| 10 | 27 | MISSING_CURRENCY | Groceries DMart (15-03-2026): currency field empty | ERROR | Default to INR (group's default currency). Surface assumption to user. |
| 11 | 30 | ZERO_AMOUNT | Dinner order Swiggy: amount is 0 — note says "counted twice earlier - fixing later" | ERROR | Skip this row (zero-amount expenses add no value). Surface as INFO so user knows it was intentionally skipped. |
| 12 | 33 | AMBIGUOUS_DATE | Deep cleaning service: date "04-05-2026" — note says "is this April 5 or May 4?" | ERROR | Surface to user. Present both interpretations. User must pick. |
| 13 | 23,24 | DUPLICATE_DIFFERENT_AMOUNT | Thalassa dinner: Aisha logged ₹2400, Rohan logged ₹2450 for same event same night | ERROR | Surface both. Note says "Aisha also logged this I think hers is wrong." Present to user; default keep Rohan's (₹2450) based on the note, skip Aisha's. |
| 14 | 36 | MEMBER_AFTER_DEPARTURE | April Groceries (02-04-2026): Meera in split_with but Meera left end of March | ERROR | Remove Meera from this split. Redistribute her share equally among remaining members. Surface change to user. |
| 15 | 38 | DEPOSIT_AS_EXPENSE | "Sam deposit share" — Sam pays Aisha ₹15000. This is a deposit/settlement, not a shared group expense | ERROR | Import as Settlement (Sam → Aisha). Surface to user. |
| 16 | 43 | SPLIT_TYPE_MISMATCH | Furniture for common room: split_type = "equal" but split_details has share counts | ERROR | Prefer split_details (shares) over split_type label when both are present. Surface to user. |
| 17 | 18 | UNKNOWN_PAYER_NAME | "Priya S" on Groceries DMart (18-02-2026) — likely Priya but not exact match | WARNING | Fuzzy-match to "Priya". Surface assumption to user for confirmation. |
| 18 | 26,14 | PAYER_NAME_CASE | "priya" (lowercase) row 14, "rohan " (trailing space) row 26 — name normalization needed | INFO | Normalize: trim whitespace, title-case. Log all normalizations. |
| 19 | 15 | EXCESSIVE_PRECISION | Cylinder refill: ₹899.995 — 3 decimal places in rupees | INFO | Round to ₹900.00 (nearest paisa). Log rounding. |

---

## API Endpoints

### Auth
```
POST /api/auth/register
POST /api/auth/login
POST /api/auth/refresh
POST /api/auth/logout
GET  /api/auth/me
```

### Groups
```
GET    /api/groups
POST   /api/groups
GET    /api/groups/:id
PATCH  /api/groups/:id
DELETE /api/groups/:id
GET    /api/groups/:id/members
POST   /api/groups/:id/members          { userId, joinedAt }
PATCH  /api/groups/:id/members/:userId  { leftAt }
```

### Expenses
```
GET    /api/groups/:groupId/expenses
POST   /api/groups/:groupId/expenses
GET    /api/groups/:groupId/expenses/:id
PATCH  /api/groups/:groupId/expenses/:id
DELETE /api/groups/:groupId/expenses/:id
```

### Balances
```
GET /api/groups/:groupId/balances         — net balances for all members
GET /api/groups/:groupId/balances/:userId — breakdown for one member (which expenses)
GET /api/groups/:groupId/settlement-plan  — minimum transactions to settle all debts
```

### Settlements
```
GET  /api/groups/:groupId/settlements
POST /api/groups/:groupId/settlements
```

### Import
```
POST /api/import                          — upload CSV, returns importRunId + anomaly list
GET  /api/import/:runId                   — get import run status + all anomalies
POST /api/import/:runId/resolve           — user submits resolutions for each anomaly
POST /api/import/:runId/execute           — finalise import after all errors resolved
GET  /api/import/:runId/report            — download full import report (JSON)
```

---

## Balance Calculation Logic

### Core Algorithm

```javascript
// balanceService.js

/**
 * For a given group and optional date range:
 * 1. Sum all ExpenseSplits.amountOwed per user (what they OWE)
 * 2. Sum all Expenses.amountInr per user where paidById = user (what they PAID)
 * 3. net[user] = paid - owed
 *    positive net = others owe this user
 *    negative net = this user owes others
 * 4. Settlements adjust net directly
 *
 * Membership date filter:
 * Only include an expense in a user's balance if the user was a member
 * of the group on the expense.date (joinedAt <= date AND (leftAt IS NULL OR leftAt >= date))
 */

function computeBalances(groupId, expenses, settlements, memberships) {
  const net = {};  // userId -> net amount (positive = owed to them)

  for (const expense of expenses) {
    // credit payer
    net[expense.paidById] = (net[expense.paidById] || 0) + Number(expense.amountInr);

    // debit each split participant
    for (const split of expense.splits) {
      net[split.userId] = (net[split.userId] || 0) - Number(split.amountOwed);
    }
  }

  for (const settlement of settlements) {
    // payer reduces their debt (or increases credit)
    net[settlement.payerId] = (net[settlement.payerId] || 0) + Number(settlement.amount);
    // payee reduces their credit
    net[settlement.payeeId] = (net[settlement.payeeId] || 0) - Number(settlement.amount);
  }

  return net;
}

/**
 * Minimum settlement plan (greedy):
 * Sort creditors (positive net) and debtors (negative net).
 * Match largest debtor to largest creditor.
 * This minimises transaction count.
 */
function minimiseTransactions(netBalances) {
  const transactions = [];
  const creditors = Object.entries(netBalances)
    .filter(([, v]) => v > 0.01)
    .sort((a, b) => b[1] - a[1]);
  const debtors = Object.entries(netBalances)
    .filter(([, v]) => v < -0.01)
    .sort((a, b) => a[1] - b[1]);

  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const credit = creditors[ci][1];
    const debt = Math.abs(debtors[di][1]);
    const transfer = Math.min(credit, debt);

    transactions.push({
      from: debtors[di][0],
      to: creditors[ci][0],
      amount: Math.round(transfer * 100) / 100
    });

    creditors[ci][1] -= transfer;
    debtors[di][1] += transfer;

    if (creditors[ci][1] < 0.01) ci++;
    if (Math.abs(debtors[di][1]) < 0.01) di++;
  }
  return transactions;
}
```

### Split Computation

```javascript
// splitCalculator.js

function computeSplits(expense) {
  const { amount, splitType, participants, splitDetails } = expense;
  // participants: [{ userId, share }] where share meaning depends on splitType

  switch (splitType) {
    case 'EQUAL':
      const each = amount / participants.length;
      return participants.map(p => ({ userId: p.userId, amountOwed: round2(each) }));

    case 'PERCENTAGE':
      // splitDetails: [{ userId, percentage }]
      // MUST validate sum === 100 before calling
      return splitDetails.map(d => ({
        userId: d.userId,
        amountOwed: round2(amount * d.percentage / 100)
      }));

    case 'SHARE':
      // splitDetails: [{ userId, shares }]
      const totalShares = splitDetails.reduce((s, d) => s + d.shares, 0);
      return splitDetails.map(d => ({
        userId: d.userId,
        amountOwed: round2(amount * d.shares / totalShares)
      }));

    case 'UNEQUAL':
      // splitDetails: [{ userId, amount }]
      // Validate: sum of amounts === expense.amount (within rounding tolerance)
      return splitDetails.map(d => ({ userId: d.userId, amountOwed: round2(d.amount) }));
  }
}

function round2(n) { return Math.round(n * 100) / 100; }
```

---

## CSV Import Pipeline (Step by Step)

```
UPLOAD CSV
    ↓
PARSE raw rows (papaparse, no transformation yet)
    ↓
ROW-LEVEL VALIDATION (per row, in order):
  - Date parse (detect ambiguous/malformed)
  - Amount parse (strip commas, detect zero, negative, excess precision)
  - Currency detection (missing → flag, USD → flag for FX)
  - Payer normalisation (case, whitespace, fuzzy match to known users)
  - Split member validation (each name in split_with against member list)
  - Split type validation (known type? sum check for percentage)
  - Cross-row duplicate detection (same date+payer+amount fuzzy match)
  - Settlement detection (empty split_type + payment-like description)
    ↓
BUILD ANOMALY LIST (one record per issue, row + type + severity)
    ↓
RETURN to frontend: { importRunId, anomalies[], previewRows[] }
    ↓
USER REVIEWS anomalies in AnomalyReview UI:
  - Each ERROR anomaly requires a decision (pick option or skip)
  - WARNINGs show default action, user can override
  - INFOs are displayed but require no action
    ↓
POST /api/import/:runId/resolve { anomalyId, resolution, resolvedData }
    ↓
EXECUTE IMPORT:
  - Process each row using resolved data
  - Create Expense + ExpenseSplit records (or Settlement)
  - Mark importRun as COMPLETE
    ↓
RETURN import report (importedRows, skippedRows, anomaly summary)
```

---

## Frontend Pages & Components

### Pages

| Route | Page | Purpose |
|-------|------|---------|
| `/login` | Login.jsx | JWT login form |
| `/register` | Register.jsx | Registration |
| `/` | Dashboard.jsx | All groups, your net balance across groups |
| `/groups/:id` | GroupDetail.jsx | Expense list, members, quick balance summary |
| `/groups/:id/expenses/:eid` | ExpenseDetail.jsx | Full split breakdown (Rohan's requirement) |
| `/groups/:id/balances` | Balances.jsx | Net balance table + settlement plan |
| `/groups/:id/settlements` | Settlements.jsx | Record/view payments |
| `/import` | Import.jsx | Upload CSV → review anomalies → execute |

### Key Components

**AnomalyReview.jsx** — Most critical UI component. Shows each anomaly as a card:
- Red border = ERROR (must resolve)
- Yellow border = WARNING (has default, can override)
- Blue border = INFO (read-only)
- Each card shows: raw row data, anomaly description, available actions as radio buttons or dropdowns

**SplitEditor.jsx** — Dynamic form that adapts to split type:
- EQUAL: just shows member list with auto-calculated amount
- PERCENTAGE: inputs per member + live sum validation (must = 100%)
- SHARE: ratio inputs per member
- UNEQUAL: exact amount inputs per member + live sum vs total validation

**BalanceTable.jsx** — Shows two sections:
1. Net balances (who is owed / who owes)
2. Settlement plan (minimum transactions to zero out all debts)

---

## Membership-Aware Balance Filtering

When computing balances:

```javascript
// An expense dated X should only affect user U's balance
// if U was a member of the group on date X.

function isMemberOnDate(membership, date) {
  const d = new Date(date);
  return membership.joinedAt <= d && (membership.leftAt === null || membership.leftAt >= d);
}

// This handles:
// - Sam: joined mid-April → April rent (01-04) doesn't affect Sam
// - Meera: left end of March → April groceries (02-04) shouldn't include Meera
```

---

## Currency Handling

```javascript
// currencyService.js
// At import time, for each USD expense:
// 1. Try to fetch historical rate for the expense date
// 2. If unavailable (weekend, API down), use closest available rate
// 3. Store: original amount, original currency, exchange rate used, converted INR amount
// 4. Surface rate to user in anomaly card: "Used rate 1 USD = ₹83.42 (14-Mar-2026)"

// Fallback: if no historical rate available, use rate at import time
// Document this policy in DECISIONS.md
```

---

## Commit Plan (Git History)

Commits must be small, meaningful, and frequent. Below is the required sequence:

```
feat: initial project scaffold (monorepo, backend + frontend boilerplate)
feat(db): add prisma schema with all models and enums
feat(db): run initial migration, seed dev users
feat(auth): implement JWT register and login endpoints
feat(auth): add JWT middleware and refresh token logic
feat(frontend): setup vite + tailwind + react router skeleton
feat(frontend): implement login and register pages with form validation
feat(auth): connect frontend login to backend, store JWT in memory + httpOnly cookie
feat(groups): implement CRUD endpoints for groups
feat(groups): implement group membership endpoints with join/leave dates
feat(frontend): group list and create group UI
feat(frontend): group detail page with member list
feat(expenses): implement expense creation with split calculation (equal, percentage, share, unequal)
feat(expenses): add expense list and detail endpoints
feat(frontend): expense form with dynamic split editor
feat(frontend): expense detail page showing full split breakdown
feat(balances): implement balance computation service with membership date filtering
feat(balances): implement minimum-transaction settlement plan algorithm
feat(frontend): balances page with net summary and settlement plan
feat(settlements): implement settlement record and list endpoints
feat(frontend): settlements page and record payment UI
feat(import): implement CSV parser with row validation and anomaly detection
feat(import): detect duplicate rows (exact and fuzzy)
feat(import): detect settlement-disguised-as-expense rows
feat(import): detect percentage sum errors and normalisation logic
feat(import): detect missing payer, missing currency, zero amount rows
feat(import): detect ambiguous dates and foreign currency rows
feat(import): detect membership violation rows (member after departure)
feat(import): detect split_type vs split_details mismatch
feat(import): implement anomaly review API (resolve endpoint)
feat(import): implement import execution after anomaly resolution
feat(import): generate import report JSON
feat(frontend): import page - upload and preview
feat(frontend): anomaly review UI with per-anomaly resolution controls
feat(frontend): import report summary view
feat(currency): integrate historical FX rate lookup for USD expenses
fix(balances): handle floating point rounding in split calculations
fix(import): handle "Priya S" fuzzy name matching
fix(import): normalise payer names (trim whitespace, title case)
docs: add README with setup and deployment instructions
docs: add SCOPE.md with full anomaly log and schema description
docs: add DECISIONS.md with all major technical decisions
docs: add AI_USAGE.md with tool usage and error cases
chore: setup unified project structure and root package.json
chore: configure Express static serving, remove CORS, update vite/axios config
chore: add vercel.json and render deployment config
chore: configure env vars, and production build
```

---

## SCOPE.md — What to Include

Document every anomaly from the table above. For each:
- Row number in CSV
- Exact raw data
- What the anomaly is
- Detection method (how the code detects it)
- Policy chosen (what the app does by default)
- User control available (what the user can override)

Also include the full database schema with rationale for each field.

---

## DECISIONS.md — Key Decisions to Document

1. **Why soft-delete for expenses?** — Meera wants to approve deletions; soft-delete lets duplicates be marked deleted and restored if needed.
2. **Why store amountInr separately?** — Priya's concern: USD must be converted. Storing the converted amount + rate means historical balances don't change if rates change later.
3. **Why 4 decimal places in Expense.amount?** — Handle ₹899.995 edge case without data loss; display rounded to 2dp.
4. **Why GroupMembership with joinedAt/leftAt?** — Sam shouldn't be charged for March; Meera shouldn't appear in April splits. Time-bounded membership is the only correct model.
5. **Why percentage normalization instead of rejection?** — Rejection forces user to fix CSV; normalization with display of correction is more user-friendly. Both choices are documented.
6. **How to handle Dev (visitor)?** — Create a "guest" user type or full user account. Decision: create as a regular user, they just don't have login credentials (or a placeholder email). The group owner can add them.
7. **Why two-phase import (detect → review → execute)?** — Meera's requirement: "I want to approve anything the app deletes or changes." A single-pass import that silently fixes things fails this requirement.
8. **Settlement plan algorithm?** — Greedy min-transactions. Document that this is O(n²) and fine for flat-size groups.
9. **FX rate source?** — Document which API used (e.g., exchangerate.host, Open Exchange Rates free tier, or a hardcoded historical rate). If hardcoded, explain why.
10. **Why JWT in httpOnly cookie rather than localStorage?** — XSS protection. Document the tradeoff.

---

## AI_USAGE.md — Required Content

Must include at minimum 3 cases where AI was wrong:

**Example placeholders to fill in during development:**
1. "AI generated a balance algorithm that didn't account for membership date ranges — it charged Sam for April rent. Caught because Sam's balance showed a large negative despite him not being in the split. Fixed by adding the isMemberOnDate filter."
2. "AI wrote the percentage split validator checking `sum === 100` with strict equality — this failed for floating point inputs like 33.33 + 33.33 + 33.34. Fixed by using Math.abs(sum - 100) < 0.01."
3. "AI suggested using localStorage for JWT — changed to httpOnly cookie to prevent XSS."

---

## Environment Variables

```
# backend/.env
DATABASE_URL=postgresql://...@neon.tech/splitwise?sslmode=require
JWT_SECRET=your_secret_here
JWT_REFRESH_SECRET=your_refresh_secret_here
EXCHANGE_RATE_API_KEY=optional
PORT=3000
NODE_ENV=production

(No frontend/.env required as API calls use relative path /api/... now)
```

---

## Minimum Product Requirements Checklist

- [x] Login module (JWT register + login)
- [x] Groups with time-bounded membership (join/leave dates)
- [x] Expenses with all split types (equal, percentage, share, unequal)
- [x] Group-wise and individual balance summaries
- [x] Settle debts / record payments
- [x] Import expenses_export.csv without hand-editing the CSV
- [x] Detect, surface, and handle all 19 anomalies
- [x] Two-phase import (detect → user review → execute)
- [x] Import report generated by the app
- [x] Relational database only (PostgreSQL via Neon)
- [x] Meaningful git commit history

---

## Deployment Checklist

### Unified Web Service (Render)
1. Push the entire repository to GitHub.
2. Create new Render Web Service → connect repo.
3. Build command: `npm run build && cd backend && npx prisma generate && npx prisma migrate deploy`
4. Start command: `npm start`
5. Add environment variables in Render dashboard:
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `JWT_REFRESH_SECRET`
   - `NODE_ENV=production`

### Database (Neon)
1. Create project on neon.tech.
2. Copy connection string to Render environment variables.
3. Database migrations will run automatically on deploy.

---

## Notes on UI Design

Keep UI minimal — functionality and correctness over polish.

- Use plain Tailwind utility classes, no component library
- Tables over cards for expense lists (easier to scan)
- No animations
- Error states must be explicit (red text, not just disabled buttons)
- The AnomalyReview page is the most important UI piece — invest time here
- All amounts display in ₹ with 2 decimal places
- USD source amounts shown in parentheses: ₹44,946.60 ($540 @ ₹83.23)
