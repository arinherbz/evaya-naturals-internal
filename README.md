# Evaya Naturals Internal Management System

A modern internal operations management system for Evaya Naturals, a Uganda-based natural wellness and beauty business with 3 branches.

## Features

- **Authentication**: Secure session-based auth with role-based access control
- **Dashboard**: Role-specific dashboards for Admin, Branch Manager, Cashier, etc.
- **POS**: Point of Sale system with Ugandan payment methods (Cash, MTN/Airtel Mobile Money, Cards)
- **Products**: Product catalog with categories, pricing, and wellness information
- **Inventory**: Stock tracking with batch/expiry management
- **Customers**: Customer database with wellness interests
- **Suppliers**: Supplier management
- **Deliveries**: Delivery tracking and management
- **Reports**: Sales, inventory, and financial reports
- **Daily Close**: Cash-up and end-of-day reconciliation

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite + Tailwind CSS
- **Backend**: Node.js + Hono + TypeScript
- **Database**: SQLite (dev) / PostgreSQL (production) with Drizzle ORM
- **Validation**: Zod
- **State Management**: TanStack React Query
- **Routing**: React Router v6

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or pnpm

### Installation

1. Clone the repository:
```bash
git clone https://github.com/arinherbz/evaya-naturals-internal.git
cd evaya-naturals-internal
```

2. Install dependencies:
```bash
npm install
cd server && npm install
cd ../client && npm install
cd ..
```

3. Set up environment variables:
```bash
cp server/.env.example server/.env
```

4. Start the development servers:
```bash
npm run dev
```

This will start:
- Backend API on http://localhost:3001
- Frontend on http://localhost:3000

### Default Login

- **Email**: admin@evaya.ug
- **Password**: admin123

## Project Structure

```
evaya-naturals-internal/
├── server/                 # Backend API
│   ├── src/
│   │   ├── db/            # Database configuration and schema
│   │   │   ├── schema/    # Drizzle ORM table definitions
│   │   │   ├── index.ts   # DB connection
│   │   │   └── init.ts    # Database initialization & seeding
│   │   ├── routes/        # API route handlers
│   │   ├── middleware/    # Auth and permission middleware
│   │   └── index.ts       # Server entry point
│   └── package.json
├── client/                # Frontend React app
│   ├── src/
│   │   ├── components/    # Reusable UI components
│   │   ├── pages/         # Page components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── services/      # API service layer
│   │   ├── types/         # TypeScript type definitions
│   │   └── App.tsx        # Main app component
│   └── package.json
└── README.md
```

## Database Schema

### Core Tables

- **branches**: Store locations (Evaya Naturals, Evaya Beauty, Evaya World)
- **roles**: User roles with permissions
- **users**: Staff accounts
- **sessions**: Active user sessions
- **categories**: Product categories
- **products**: Product catalog
- **suppliers**: Supplier information
- **batches**: Batch/expiry tracking
- **inventory**: Stock levels per branch
- **inventory_movements**: Stock movement history
- **customers**: Customer database
- **sales**: Sales transactions
- **sale_items**: Line items for sales
- **deliveries**: Delivery tracking
- **transfers**: Inter-branch transfers
- **daily_closes**: End-of-day reconciliation
- **audit_logs**: System audit trail

## User Roles

| Role | Permissions |
|------|-------------|
| Admin | Full system access |
| Branch Manager | Manage branch operations, staff, inventory |
| Cashier | Process sales, daily close |
| Inventory Officer | Manage stock, receiving, transfers |
| Delivery Rider | View and update deliveries |
| Accountant | View reports, manage accounts |

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Get current user

### Health
- `GET /api/health` - Health check

## Development

```bash
# Install all dependencies
npm install

# Run both servers in development
npm run dev

# Build for production
npm run build

# Run tests
npm test

# Type check
npm run check
```

## Database Commands

```bash
# Generate migrations
npm run db:generate

# Push schema to database
npm run db:push

# Seed initial data
npm run db:seed

# Open Drizzle Studio
npm run db:studio
```

## Currency

All prices are in Ugandan Shillings (UGX).

## License

Private - Evaya Naturals Internal Use Only

---

Built with ❤️ for Evaya Naturals