# Decisions Document: Key Architecture & Design Choices

This document outlines the core technical decisions, trade-offs, and rationale behind the implementation of the Shared Expenses App.

---

### 1. Unified Node.js Deployment on Render
* **Decision**: Serve both the React (Vite) frontend and Express API from a single Node.js application on Render rather than deploying separate instances on Vercel and Render.
* **Rationale**: 
  - **Zero CORS Configuration**: Serving both client assets and API routes from the same origin (e.g., `https://your-app.onrender.com`) removes the necessity of configured CORS middleware, avoiding common configuration errors and pre-flight request overhead.
  - **Ease of Deployment**: Reduces administrative overhead by keeping all configuration (secrets, build pipelines, logs) in a single Render Web Service dashboard.
  - **Local Development Proxy**: By utilizing Vite’s build-in proxy server, developers run the React server locally on port 5173 while requests starting with `/api` are transparently routed to port 3000 where the Express server listens.

### 2. Two-Phase CSV Import Pipeline
* **Decision**: Implement a two-pass import workflow: Upload & Scan (Phase 1) $\rightarrow$ User Review & Resolve (Phase 2) $\rightarrow$ Database Execution.
* **Rationale**: Meera specifically requested: *"I want to approve anything the app deletes or changes."* A single-pass import that silently handles name casing, duplicates, or ambiguous dates fails this requirement. This pipeline allows all anomalies to be persisted in database tables as "pending resolutions," providing users complete visibility and interactive options before any financial transactions are committed.

### 3. Time-Bounded Group Membership
* **Decision**: Model flat memberships using a `GroupMembership` table containing `joinedAt` (DateTime) and `leftAt` (DateTime, nullable) fields.
* **Rationale**: Membership in shared flats changes over time. Sam joined mid-April and should not be billed for February or March rent; Meera left at the end of March and should not be charged for April groceries. When balance queries run, the calculation engine filters expenses dynamically based on whether the expense date falls within each user's membership active window.

### 4. Soft-Deletions for Expenses
* **Decision**: Implement soft-deletes via an `isDeleted` boolean flag on the `Expense` table instead of hard `DELETE` queries.
* **Rationale**: Avoids database cascading failures and allows mistakenly marked duplicates or anomalies to be restored by administrative override if necessary.

### 5. Separate `amountInr` and FX Conversion Fields
* **Decision**: Store the raw `amount` and `currency` fields alongside converted `amountInr` and the `exchangeRate` applied.
* **Rationale**: Priya raised concerns about USD calculations. By locking the converted INR amount in the database at the time of import/creation, historical reports and balance metrics remain invariant even if the underlying historical API changes rate outputs in the future.

### 6. Decimal Precision (4 Decimal Places)
* **Decision**: Define the original amount column as `Decimal(12, 4)` and round computed owed splits to `Decimal(12, 2)` (INR paisa).
* **Rationale**: Avoids floating-point precision loss when handling high-precision CSV rows (such as the cylinder refill at ₹899.995).

### 7. Remainder Allocation for Equal and Proportional Splits
* **Decision**: For split calculations, do not use simple sequential rounding. Instead, compute rounded allocations on the first $N-1$ participants and allocate the remainder to the final participant.
* **Rationale**: If ₹100.00 is split equally among three participants, normal rounding results in ₹33.33 each, leaving ₹0.01 unallocated. By assigning the remainder (`roundedTotal - sumOfFirstNMinus1`) to the last participant, we guarantee that the sum of split amounts matches the overall expense total.

### 8. Fuzzy Payer Name Matching via Levenshtein Distance
* **Decision**: Payer names in CSV that do not match database records are matched using Levenshtein distance with a maximum distance threshold of 3 characters.
* **Rationale**: Handles typos and minor spelling variations (e.g. "Priya S" to "Priya") without blocking the import or requiring a manual typing override.

### 9. Fawaz Ahmed Currency API Integration
* **Decision**: Use the CDN-distributed currency API by Fawaz Ahmed (`@fawazahmed0/currency-api`) for USD-to-INR conversions, falling back to a hardcoded rate of ₹83.50.
* **Rationale**: Free, public, does not require API keys, and has historical daily JSON CDNs. In cases where the CDN is offline or a future date is input, the system gracefully falls back to the average 2026 exchange rate.

### 10. JWT in HTTP-Only Cookie + Memory Token Access
* **Decision**: Store the JWT Refresh Token in an HTTP-Only, Secure, SameSite cookie, and return the Access Token in the JSON body, keeping it in memory.
* **Rationale**: Secures the refresh token against XSS (cross-site scripting) attacks since it is inaccessible to javascript, while preventing CSRF (cross-site request forgery) vulnerabilities.
