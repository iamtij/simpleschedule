# isked - Simple Scheduling Application

A modern scheduling application built with Node.js, Express, and PostgreSQL/SQLite.

## Features

- User authentication
- Modern UI with Tailwind CSS
- Responsive design
- Toast notifications
- PostgreSQL in production, SQLite in development
- Session management

## Development

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create a `.env` file:
   ```
   NODE_ENV=development
   PORT=3000
   DATABASE_URL=db/dev.sqlite3
   SESSION_SECRET=your-secret-key
   ```
4. Run migrations:
   ```bash
   npm run migrate
   ```
5. Start development server:
   ```bash
   npm run dev
   ```

## Production Deployment (Railway)

1. Create a new project on Railway
2. Add a PostgreSQL database
3. Configure environment variables:
   - `NODE_ENV=production`
   - `SESSION_SECRET` (generate a secure random string)
   - `DATABASE_URL` (automatically set by Railway)
4. **Persistent logo storage** (recommended): Add a Volume to your service so booking logos survive deploys.
   - In Railway: Service → Volumes → Add Volume, mount at `/data`
   - Railway sets `RAILWAY_VOLUME_MOUNT_PATH` automatically; logos are stored at `/data/booking-logos`
   - Or set `LOGO_UPLOAD_DIR=/data/booking-logos` if using a custom mount path
5. Deploy using the Railway CLI or GitHub integration

## Database Migrations

The application uses a unified migration system that works with both PostgreSQL and SQLite:

```bash
npm run migrate
```

## Environment Variables

- `NODE_ENV`: Set to 'production' or 'development'
- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: Database connection string
- `SESSION_SECRET`: Secret for session encryption
- `LOGO_UPLOAD_DIR`: (optional) Path for booking logos. On Railway with a Volume mounted at `/data`, set to `/data/booking-logos` for persistent storage.

## License

MIT 