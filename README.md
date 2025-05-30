# SimpleSchedule

A Calendly-style scheduling application that allows small business owners to manage their availability and let clients book appointments through a simple interface.

## Features

- User authentication (signup/login)
- Customizable availability settings
  - Set working days and hours
  - Define break times
- Public booking page for clients
- Calendar view of all bookings
- 30-minute appointment slots
- Shareable booking links

## Tech Stack

- Node.js & Express
- SQLite database with better-sqlite3
- EJS templating
- Tailwind CSS for styling
- FullCalendar.js for calendar view
- Flatpickr for date picking

## Setup

1. Install dependencies:
```bash
npm install
```

2. Initialize the database:
```bash
sqlite3 db/database.sqlite < db/schema.sql
```

3. Start the server:
```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

## Usage

1. Create an account at `/signup`
2. Log in and set your availability in the dashboard
3. Share your booking link with clients
4. View and manage appointments in the calendar

## Environment Variables

Create a `.env` file in the root directory with the following variables:
```
PORT=3000
NODE_ENV=development
SESSION_SECRET=your-secret-key
```

## Project Structure

```
/SimpleSchedule
├── index.js           # Main application file
├── /views            # EJS templates
├── /routes          # Express routes
├── /public          # Static assets
└── /db              # Database files
```

## Security Considerations

- Passwords are hashed using bcrypt
- Session management with express-session
- SQL injection prevention with prepared statements
- XSS protection through EJS escaping

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

MIT 