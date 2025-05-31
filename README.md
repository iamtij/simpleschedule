# isked

A modern scheduling application that makes it easy to manage appointments and bookings.

## Features

- User registration and authentication
- Customizable availability settings
- Booking management with calendar view
- Client self-scheduling through unique booking links
- Break time management
- Toast notifications for better user feedback

## Production Deployment

### Prerequisites

- Node.js >= 18.0.0
- NPM or Yarn
- PostgreSQL (for production) or SQLite (for development)

### Environment Variables

Set the following environment variables:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=your_database_url
SESSION_SECRET=your_session_secret
RECAPTCHA_SITE_KEY=your_recaptcha_site_key
RECAPTCHA_SECRET_KEY=your_recaptcha_secret_key
```

### Deployment Options

1. **Heroku**
   ```bash
   heroku create your-app-name
   heroku config:set NODE_ENV=production
   heroku config:set SESSION_SECRET=your_session_secret
   heroku config:set RECAPTCHA_SITE_KEY=your_site_key
   heroku config:set RECAPTCHA_SECRET_KEY=your_secret_key
   git push heroku main
   ```

2. **Railway**
   - Connect your GitHub repository
   - Set environment variables in the dashboard
   - Deploy from main branch

3. **Manual Deployment**
   ```bash
   npm install --production
   npm run migrate
   npm start
   ```

## Development

1. Clone the repository
   ```bash
   git clone https://github.com/yourusername/isked.git
   cd isked
   ```

2. Install dependencies
   ```bash
   npm install
   ```

3. Run database migrations
   ```bash
   npm run migrate
   ```

4. Start development server
   ```bash
   npm run dev
   ```

## License

MIT 