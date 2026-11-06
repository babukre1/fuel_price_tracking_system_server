# React Frontend Handoff Prompt

Use this as the initial prompt/context for a new Codex chat that will build the React side of this project.

## Project

Fuel Price Tracking Management System.

Current repository is a Node.js/Express/MongoDB backend using CommonJS.

Backend root:

```text
C:\Users\hp\Documents\Coding Zone\Projects\Fuel Price Tracking Management System\fuel-price-tracking-management-sytem
```

## Backend Runtime

- Server entry: `service.js`
- Express app: `app.js`
- Default port: `5000`
- Health endpoint: `GET /api/v1/health`
- Environment variables used by backend:
  - `PORT`
  - `MONGO_URI`
  - `JWT_SECRET`
- Dependencies: `express`, `mongoose`, `dotenv`, `bcryptjs`, `jsonwebtoken`, `nodemon`
- No frontend exists in this repository yet.

Expected local API base URL for React:

```text
http://localhost:5000/api/v1
```

Use a React env variable such as:

```text
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

## Current Backend Routes

Routes are mounted in `app.js`:

```js
app.use("/api/v1/admin", adminRoutes);
app.use("/api/v1/user", userRoutes);
```

Important: `app.js` currently has uncommitted local changes that enable admin routes. Treat admin routes as available in the current working tree.

## Shared API Response Shape

Most endpoints return:

```ts
type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  token?: string;
  data?: T;
  error?: string;
};
```

For protected user routes, send:

```http
Authorization: Bearer <token>
```

## User Model

Backend file: `User/model.js`

```ts
type User = {
  _id: string;
  fullName: string;
  email: string;
  phone?: string;
  location?: {
    type?: "Point";
    coordinates?: [number, number]; // [longitude, latitude]
  };
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};
```

Password is never returned from normal user responses.

## User Endpoints

### Register User

`POST /user/register`

Request:

```json
{
  "fullName": "Jane Doe",
  "email": "jane@example.com",
  "phone": "0712345678",
  "password": "secret123"
}
```

Required: `fullName`, `email`, `password`.

Success `201`:

```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "_id": "...",
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "0712345678",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Common errors:

- `400`: missing fullName/email/password
- `409`: email already in use
- `500`: registration failed

### Login User

`POST /user/login`

Request:

```json
{
  "email": "jane@example.com",
  "password": "secret123"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Login successful",
  "token": "jwt-token",
  "data": {
    "_id": "...",
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "0712345678",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

JWT payload contains:

```ts
{
  id: string;
  role: "user";
}
```

Store this token client-side and use it for protected user routes.

Common errors:

- `400`: missing email/password
- `401`: invalid credentials
- `403`: account is deactivated
- `500`: login failed

### Get User Profile

`GET /user/profile`

Protected: requires user bearer token.

Success `200`:

```json
{
  "success": true,
  "data": {
    "_id": "...",
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "0712345678",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Errors:

- `401`: missing/invalid/expired token
- `403`: token role is not `user`
- `404`: user not found
- `500`: failed to fetch profile

### Update User Profile

`PATCH /user/profile`

Protected: requires user bearer token.

Request:

```json
{
  "fullName": "Jane Doe",
  "phone": "0799999999"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Profile updated",
  "data": {
    "_id": "...",
    "fullName": "Jane Doe",
    "email": "jane@example.com",
    "phone": "0799999999",
    "isActive": true,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

Errors:

- `401`: missing/invalid/expired token
- `403`: token role is not `user`
- `404`: user not found
- `500`: update failed

### Change User Password

`PATCH /user/change-password`

Protected: requires user bearer token.

Request:

```json
{
  "currentPassword": "oldpass123",
  "newPassword": "newpass123"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

Errors:

- `400`: currentPassword/newPassword missing
- `401`: current password incorrect or token invalid
- `403`: token role is not `user`
- `404`: user not found
- `500`: failed to change password

## User Endpoints Present in Controller but Not Mounted

These functions exist in `User/controllers.js`, but their routes are commented out in `User/routes.js`, so React should not rely on them unless backend is updated:

- `PATCH /user/location`
- `PATCH /user/deactivate`

Potential request for location if enabled later:

```json
{
  "longitude": 36.8219,
  "latitude": -1.2921
}
```

## Admin Model

Backend file: `admin/model.js`

```ts
type Admin = {
  id: string;
  fullName: string;
  email: string;
  phone?: string;
  isApproved: boolean;
  isActive: boolean;
};
```

Admin schema fields:

- `fullName`: required
- `email`: required, unique
- `phone`: optional, unique
- `password`: required
- `isApproved`: defaults to `false`
- `isActive`: defaults to `true`
- timestamps are enabled in MongoDB, but admin responses currently return a reduced `data` object without timestamps.

## Admin Endpoints

### Admin Signup

`POST /admin/signup`

Request:

```json
{
  "fullName": "Admin User",
  "email": "admin@example.com",
  "phone": "0712345678",
  "password": "secret123"
}
```

Required: `fullName`, `email`, `password`.

Password must be at least 6 characters.

Success `201`:

```json
{
  "success": true,
  "message": "Admin registered successfully",
  "data": {
    "id": "...",
    "fullName": "Admin User",
    "email": "admin@example.com",
    "phone": "0712345678",
    "isApproved": false,
    "isActive": true
  }
}
```

Important UX note: a newly registered admin is not approved by default, so admin login will fail until `isApproved` is set to `true` in the database or an approval flow is added.

Common errors:

- `400`: missing required fields, password too short, duplicate email, duplicate phone
- `500`: signup failed

### Admin Login

`POST /admin/login`

Request:

```json
{
  "email": "admin@example.com",
  "password": "secret123"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Login successful",
  "token": "jwt-token",
  "data": {
    "id": "...",
    "fullName": "Admin User",
    "email": "admin@example.com",
    "phone": "0712345678",
    "isApproved": true,
    "isActive": true
  }
}
```

Important backend limitation: admin token generation currently signs only `{ id }`, with no `role: "admin"`. There are also no protected admin dashboard routes yet. If the React app needs an admin area with protected admin API calls, ask the backend Codex chat to add `role: "admin"` to the admin token and create the required admin routes.

Login errors:

- `400`: email/password missing
- `401`: invalid password
- `403`: account inactive or not approved
- `404`: invalid email
- `500`: login failed

### Admin Forgot Password

`POST /admin/forgot-password`

Request:

```json
{
  "email": "admin@example.com",
  "newPassword": "newpass123",
  "confirmPassword": "newpass123"
}
```

Success `200`:

```json
{
  "success": true,
  "message": "Password updated successfully"
}
```

Errors:

- `400`: missing fields, passwords do not match, password too short
- `404`: admin with email does not exist
- `500`: forgot password failed

## Recommended React App Scope

Build the actual application UI first, not a marketing landing page.

Recommended routes/pages:

- `/` redirect to `/login` or `/dashboard` depending on auth state.
- `/register` for normal user registration.
- `/login` for normal user login.
- `/dashboard` protected user dashboard.
- `/profile` protected profile view/edit.
- `/change-password` protected user password change.
- `/admin/signup` admin registration.
- `/admin/login` admin login.
- `/admin/forgot-password` admin password reset screen.
- Optional `/admin/pending-approval` screen shown after admin signup or when admin login returns "Your account is not approved yet".

Since the backend currently has no fuel price, station, dashboard metrics, or admin management routes, the React dashboard should be honest about available data:

- Show authenticated user details from `/user/profile`.
- Include empty states/placeholders for fuel price tracking features only if clearly marked as waiting for backend endpoints.
- Do not fake persistence for fuel prices unless explicitly building mock-only UI.

## Recommended React Architecture

Use Vite + React.

Suggested packages:

- `react-router-dom` for routing.
- `axios` or native `fetch` for API calls.
- Optional: `react-hook-form` plus `zod` for form validation.
- Optional: `lucide-react` for icons.

Suggested structure:

```text
src/
  api/
    client.ts
    auth.ts
    user.ts
    admin.ts
  components/
    AppLayout.tsx
    ProtectedRoute.tsx
    FormField.tsx
    Button.tsx
    Alert.tsx
  context/
    AuthContext.tsx
  pages/
    Login.tsx
    Register.tsx
    Dashboard.tsx
    Profile.tsx
    ChangePassword.tsx
    admin/
      AdminLogin.tsx
      AdminSignup.tsx
      AdminForgotPassword.tsx
      PendingApproval.tsx
  types/
    api.ts
    auth.ts
  App.tsx
  main.tsx
```

## Auth Handling Requirements

- Store user token separately from admin token, or store auth state with a `role` field.
- User login token can be trusted to contain `role: "user"`.
- Admin login response does not provide a role in the token. Use the route/context state to distinguish admin auth client-side, but do not assume protected admin APIs exist.
- On `401`, clear the relevant token and redirect to login.
- On `403`, display the backend message exactly when helpful, especially for deactivated user accounts and unapproved admin accounts.
- Persist auth state in `localStorage` for development unless told otherwise.

## API Client Behavior

Create a reusable API client with:

- `baseURL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api/v1"`
- JSON headers.
- Bearer token injection for protected user requests.
- Normalized error messages from `response.data.message`, falling back to a generic message.

Example endpoint helpers:

```ts
export const userApi = {
  register: (payload: UserRegisterPayload) => post("/user/register", payload),
  login: (payload: LoginPayload) => post("/user/login", payload),
  getProfile: () => get<User>("/user/profile", { auth: "user" }),
  updateProfile: (payload: UpdateProfilePayload) => patch("/user/profile", payload, { auth: "user" }),
  changePassword: (payload: ChangePasswordPayload) => patch("/user/change-password", payload, { auth: "user" }),
};

export const adminApi = {
  signup: (payload: AdminSignupPayload) => post("/admin/signup", payload),
  login: (payload: LoginPayload) => post("/admin/login", payload),
  forgotPassword: (payload: AdminForgotPasswordPayload) => post("/admin/forgot-password", payload),
};
```

## UI/UX Direction

This should feel like an operational fuel-management dashboard:

- Quiet, practical interface.
- Clear forms with strong validation and backend error display.
- Dashboard layout optimized for scanning.
- Avoid a marketing-style landing page.
- Avoid pretending fuel-price features are complete until backend routes exist.
- Use icons for navigation/actions where useful.
- Ensure responsive layouts for desktop and mobile.

Suggested visual sections:

- Auth screens: compact form panel with clear title, backend alert area, and links between login/register/admin flows.
- User dashboard: top bar, sidebar or mobile nav, profile summary, account status, and "backend endpoints needed" empty state for fuel price modules.
- Profile screen: view and edit full name/phone; email shown read-only.
- Change password screen: current password, new password, confirmation field client-side, submit to backend with current/new only.
- Admin screens: signup/login/forgot password, with a clear pending approval message.

## Backend Gaps to Tell New Codex About

If the React side needs full fuel tracking, ask the backend Codex chat to add routes/models for:

- Fuel stations.
- Fuel types.
- Fuel price entries/history.
- Nearby station search using user location.
- Admin approval/management of admins.
- Admin-protected routes with `role: "admin"` JWT payload.
- User location and deactivate routes, if they should be exposed.
- CORS middleware for frontend dev server access.

Potential backend issue for browser React: `app.js` currently does not configure CORS. If the frontend runs on `localhost:5173` and backend on `localhost:5000`, browser requests may be blocked unless backend adds CORS.

## Pasteable Task For New React Codex Chat

```text
Build the React frontend for a Fuel Price Tracking Management System using this backend contract.

Use Vite + React. Prefer TypeScript if the project is new. Build the actual app screens, not a marketing landing page. The backend is at http://localhost:5000/api/v1 and exposes user auth/profile endpoints plus basic admin auth endpoints. Use VITE_API_BASE_URL for configuration.

Implement:
- User register, login, protected dashboard, profile edit, and change password.
- Admin signup, login, forgot password, and pending approval UX.
- Reusable API client with normalized errors and bearer-token injection.
- Auth context with localStorage persistence and route protection.
- Responsive operational dashboard styling suitable for fuel-management software.

Backend endpoints:
- GET /health
- POST /user/register
- POST /user/login
- GET /user/profile with Authorization: Bearer <user token>
- PATCH /user/profile with Authorization: Bearer <user token>
- PATCH /user/change-password with Authorization: Bearer <user token>
- POST /admin/signup
- POST /admin/login
- POST /admin/forgot-password

Do not build fake fuel price persistence because backend routes for stations/prices do not exist yet. Use clear empty states for those future modules.

Important backend notes:
- User JWT payload contains { id, role: "user" }.
- Admin JWT currently contains only { id }, and there are no protected admin dashboard APIs yet.
- Admin signup creates isApproved=false, so admin login will fail until approved in MongoDB.
- Backend may need CORS enabled for React dev server requests.
```

