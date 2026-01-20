# **App Name**: SENTRYS

## Core Features:

- Tenant Onboarding: Secure onboarding process for new tenants, including tenant ID creation and initial configuration. TenantId is the Firestore document ID.
- User and Role Management: RBAC system with roles (admin, ops, agent) and permissions. UI for adding, editing, and deleting users and roles within a tenant. Firebase Auth integration for authentication.
- Agent Management and Document Storage: Management of security agents, including profile data, document uploads (licenses, certifications), and access control. Documents stored securely in Firebase Storage.
- Client and Site Management: Management of clients and their associated sites (locations). Data includes site addresses, security protocols, and emergency contacts. Each site belongs to a specific tenant.
- Mission and Shift Planning: Draft and publish mission schedules with shifts assigned to specific agents at specific sites. Includes conflict detection to prevent overbooking agents. Utilizes a calendar UI for visualization.
- Time Tracking (Pointage): Agents clock in/out for shifts using a mobile-friendly interface (responsive design). Geolocation verification to ensure agents are at the assigned site. Clock in/out information stored with tenantId.
- Incident Reporting: Agents can submit incident reports with text descriptions, images, and location data.

## Style Guidelines:

- Primary color: Deep blue (#1E3A8A) to convey trust and security, reflecting the company's core mission.
- Background color: Light gray (#F9FAFB) for a clean, professional, and unobtrusive backdrop.
- Accent color: Yellow-orange (#EAB308) for actionable items, call-to-action buttons, and notifications; designed to attract user attention.
- Font: 'Inter' (sans-serif) for all text, providing clarity and readability.
- Use a consistent set of outlined icons from a library like Lucid or FontAwesome, in the primary blue color, to represent different functions (users, sites, shifts, incidents).
- Implement a modular layout with clear sections for navigation, content display, and actions. Use a grid system (Tailwind's grid) for responsive design.
- Subtle transitions and animations for user interactions, such as loading states and form submissions, to enhance user experience.