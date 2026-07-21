# schull.io — Secure Academic Result Management System

`schull.io` is a hardened, token-based secure academic result management and verification system designed for modern schools. It implements robust role-based access controls, persistent audit trailing, single-use parent access tokens, and a complete suite of system security policy controls.

---

## 🚀 Core Architecture & Features

### 👥 1. Standardized Role-Based Access Control (RBAC)
* **Administrator**: Full system access, staff management (Teacher & Supervisor registration), security configuration, audit trails, and user unlock.
* **Supervisor**: Department-scoped academic overview. Can review, lock, publish results, and review grade correction appeals.
* **Teacher**: Classroom grading workspace. Can input, edit, batch import grades (CSV) for assigned classes, and export gradebook templates.
* **Student/Parent Portal**: Non-authenticated secure portal. Access is granted only via a validated, single-use parent access token, offering a multi-term performance hub and official registrar-signed PDF academic transcript exporter.

### 🛡️ 2. Enterprise-Grade Security Controls
* **Hashed Parent Tokens**: Delivery tokens are generated as raw cryptographically secure strings, hashed (SHA-256) inside the database, and automatically invalidated (single-use) to prevent leaking or brute-force enumeration.
* **IP Rate Limiting & Account Lockout**: System-wide IP anomaly tracking and brute-force protection. Automatically locks individual staff accounts for 15+ minutes after 5 consecutive failed login attempts, which can only be unlocked via Admin action.
* **Immutability of Audit Trails**: Persistent database triggers block any `UPDATE` or `DELETE` statements on the `audit_logs` table, ensuring audit log integrity.
* **2FA Protection (TOTP)**: Built-in 2FA authenticator with emergency backup recovery codes. Managed via a gorgeous toggle switch in settings.
* **Cookie Protocol**: Authentication is governed via `httpOnly`, `SameSite=Strict` signed JWT session cookies.

### ⚙️ 3. Robust Parent Dispatch & System Rules
Administrators can fine-tune system security policies on the fly inside the Settings panel:
* **IP rate limiting & lockout thresholds** (e.g. 3, 5, or 10 failed attempts).
* **Token expiry lifespans** (e.g. 12, 24, or 48 hours).
* **Daily parent token limits** (e.g. 3, 5, or 10 attempts per student per day) to mitigate token generation spam.
* **Spam cooldown protection** (e.g. 1, 5, or 15 minutes wait time between consecutive dispatches).
* **Auto-invalidation rules** for unused previous tokens.
* **Custom disclaimer footer template** appended to parent notifications.

### 🔔 4. Notification & Alert Center
* Header notification bell with unread badge count alerts staff to pending grade appeals, security advisories, lockouts, or grade uploads.
* Built-in click-outside closing mechanism and close/dismiss button for seamless panel navigation.

---

## 🛠️ Local Development & Installation

### Prerequisites
* **Node.js** (v18 or higher recommended)
* **npm**

### Installation
1. Clone the repository and install dependencies:
   ```bash
   npm install
   ```

2. Initialize and Seed Database:
   The database seeds automatically on server startup. To start:
   ```bash
   npm start
   ```

3. Start Frontend Development Server:
   ```bash
   npm run dev
   ```

4. Run the Integrated Security & Logic Test Suite:
   ```bash
   npm test
   ```

5. Build for Production:
   ```bash
   npm run build
   ```
