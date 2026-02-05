# SimpleSchedule (isked) - Knowledge Base

## Overview

SimpleSchedule (branded as "isked") is a web-based scheduling and CRM application that helps users manage appointments, contacts, and client relationships. Users can create public booking pages where clients can schedule meetings based on availability settings.

## Core Features

### 1. User Authentication & Accounts
- Users can register and login with email/username and password
- Session-based authentication using Express sessions stored in PostgreSQL
- Password hashing with bcryptjs
- User profiles include: full name, display name, username, email
- Onboarding checklist to guide new users
- Last login tracking

### 2. Booking System

#### Public Booking Pages
- Each user has a unique booking page URL: `/booking/:username/:duration`
- Multiple booking durations can be configured per user
- Clients can select available time slots on the booking page
- Booking pages automatically block unavailable times based on:
  - Weekly availability settings
  - Date-specific availability overrides
  - Existing bookings
  - Break times
  - Google Calendar conflicts (if integrated)

#### Booking Management
- View all bookings in dashboard calendar view
- Edit existing bookings
- Delete bookings
- Filter bookings by date range
- Bookings include: client name, email, phone, date, time, duration, notes
- Each booking has a unique UUID for tracking
- Booking status tracking (confirmed, cancelled, etc.)

#### Meeting Durations
- Users can configure multiple meeting duration options (15, 30, 60 minutes, etc.)
- Each duration can have a unique meeting link (Zoom, Google Meet, etc.)
- Durations can be activated/deactivated
- Default meeting link can be set per duration

### 3. Availability Management

#### Weekly Availability
- Set available hours for each day of the week (Sunday = 0, Saturday = 6)
- Time format: 24-hour format (HH:MM)
- Users can set different availability for each day
- Can configure breaks within available hours

#### Date-Specific Availability
- Override regular schedule for specific dates
- Useful for holidays, special events, or one-off availability changes
- Can set custom hours or mark dates as unavailable

#### Availability Settings
- Buffer time between bookings (optional)
- Minimum advance booking notice
- Maximum advance booking window
- Timezone support for accurate scheduling

### 4. Timezone Support
- Users can set their timezone
- All times displayed in user's timezone
- Booking times automatically converted between client and user timezones
- Database stores times in UTC, displays in user's local timezone

### 5. CRM (Customer Relationship Management)

#### Contacts Management
- Store contact information: name, email, phone, company, position, industry
- Contact statuses: new_lead, qualified_lead, unqualified_lead, warm_prospect, hot_prospect, cold_prospect, active_client, past_client, vip_client, bni_member, bni_prospect, bni_alumni, competitor, inactive
- Referral potential rating (1-5 scale)
- Tags for organizing contacts
- Notes and interaction history
- Last contact date tracking
- Next follow-up date reminders
- BNI-specific fields (member status, chapter)
- Search and filter contacts
- Pagination for large contact lists

#### Interactions Tracking
- Record all contact activities: meetings, calls, emails, referrals, follow-ups, social media, events
- Link interactions to specific bookings
- Track interaction outcomes: positive, neutral, negative, referral_potential
- Store interaction notes and subjects
- Referral value tracking

#### Referrals Management
- Track referrals given and received
- Link referrals between contacts
- Referral status: pending, completed, closed
- Value tracking for referrals

#### CRM Integration with Bookings
- Contacts automatically created from bookings
- Booking interactions automatically logged
- Follow-up reminders based on booking dates

### 6. Google Calendar Integration

#### Features
- OAuth 2.0 authentication with Google
- Sync bookings with Google Calendar events
- Two-way conflict detection (blocks times if events exist in Google Calendar)
- Users can select which Google Calendar to use (primary or custom calendar)
- Automatic event creation when bookings are made
- Automatic event updates when bookings are modified
- Automatic event deletion when bookings are cancelled

#### Calendar Selection
- Users can choose which calendar to sync with
- Default is "primary" calendar
- Support for multiple Google accounts

#### Calendar Blocking
- Optional feature to block times based on Google Calendar events
- When enabled, times with existing Google Calendar events are shown as unavailable

### 7. Google Sheets Integration
- Automatically export CRM data to Google Sheets
- Sync contacts and interactions
- OAuth 2.0 authentication required
- Configure which Google Sheet to export to
- Useful for data analysis and backup

### 8. Notifications

#### Email Notifications
- Booking confirmations (to client and user)
- Booking reminders (sent before scheduled time)
- Booking modifications
- Booking cancellations
- Email templates with customizable placeholders
- Uses Mailgun service for sending emails

#### Email Templates System
- Templates stored in `email_templates` table
- Support for placeholder variables using `{{variable_name}}` syntax
- Common placeholders: `{{user_name}}`, `{{user_email}}`, `{{booking_date}}`, `{{booking_time}}`, `{{client_name}}`, etc.
- Templates can be managed by admins
- Both subject and body support placeholders
- Variables automatically replaced when sending emails

#### SMS Notifications
- Booking confirmations via SMS
- Booking reminders via SMS
- Uses Semaphore SMS API (Philippines)
- Phone numbers must be in Philippine format: starting with '63', no leading '0', no spaces/special characters (e.g., 639178430126)

#### Telegram Notifications
- Real-time booking notifications via Telegram bot
- Integration with n8n workflows for advanced automation
- Bot commands for viewing bookings and contacts

### 9. Reminder System
- Automated reminders before bookings
- Configurable reminder times (e.g., 24 hours before, 2 hours before)
- Can send via email, SMS, or Telegram
- Tracks which reminders have been sent

### 10. Short URLs
- Generate short URLs for booking pages
- Easier to share than full booking URLs
- URLs redirect to actual booking pages
- Trackable short links

### 11. Pro Subscription System

#### Subscription Types
- Monthly subscription (PHP 499/month)
- Yearly subscription (PHP 3,999/year)
- Trial period: 5 days for new users
- Lifetime subscriptions: Admin-granted Pro status (no expiration)
- Free tier with limited features

#### Subscription Access Priority
Access is checked in this order:
1. **Admin-granted Pro**: `is_pro = true` and not expired (highest priority)
   - Lifetime subscriptions have `pro_expires_at = null`
   - Active subscriptions have expiration date in future
   - 1-day grace period after expiration before auto-deactivation
2. **RevenueCat subscription**: Mobile app subscriptions via RevenueCat
3. **Trial period**: 5-day trial for new users (only if no active subscription)
4. **No access**: Trial expired and no subscription

#### Payment Methods
- GCash payment via QR codes
- Payment proof upload required
- Manual verification by admin
- RevenueCat integration for mobile app subscriptions (optional)

#### Subscription Features
- Access to all booking features
- Full CRM functionality
- Google Calendar integration
- Google Sheets integration
- Email and SMS notifications
- Unlimited bookings and contacts

#### Subscription Management
- Track subscription status (active, expired, trial)
- Subscription expiration dates
- 1-day grace period after expiration before auto-deactivation
- Automatic expiration job runs daily to check and deactivate expired subscriptions
- Upgrade tokens for secure payment links (expire after set time)
- Payment proof management with admin approval workflow
- Lifetime subscriptions possible (admin-granted, no expiration date)

#### Trial System
- New users get a 5-day trial period
- Trial starts when `trial_started_at` is set (usually at registration)
- Trial emails sent at start and before expiration
- Trial access is checked only if user has no active Pro subscription
- Automatic conversion to free tier after trial expires (must upgrade for continued access)

### 12. User Onboarding
- Onboarding checklist guides new users:
  - Set availability
  - Set display name
  - Share booking link
- Checklist can be dismissed
- Helps users get started quickly

### 13. Display Name System
- Users can set a display name (different from full name)
- Display name appears on booking pages and public-facing areas
- Full name used internally for admin purposes

### 14. Admin Features
- Admin dashboard for managing users
- View all bookings across users
- Manage subscriptions and payments
- View payment proofs
- System settings management

### 15. System Settings
- Configurable system-wide settings
- Monthly subscription enable/disable
- Other feature toggles
- Stored in `system_settings` table

## Technical Architecture

### Technology Stack
- **Backend**: Node.js with Express.js
- **Database**: PostgreSQL (production), SQLite (development)
- **View Engine**: EJS templates
- **Session Storage**: PostgreSQL via connect-pg-simple
- **Styling**: Tailwind CSS
- **Authentication**: Session-based with bcryptjs for passwords

### Key Dependencies
- `express`: Web framework
- `pg`: PostgreSQL client
- `bcryptjs`: Password hashing
- `googleapis`: Google Calendar and Sheets integration
- `mailgun.js`: Email sending
- `@revenuecat/purchases-js`: Mobile subscription management
- `express-session`: Session management
- `multer`: File uploads (payment proofs)

### Database Structure

#### Core Tables
- `users`: User accounts and profiles
- `availability`: Weekly availability settings
- `breaks`: Break times during available hours
- `bookings`: All booking records
- `meeting_durations`: Configurable meeting durations per user
- `date_availability`: Date-specific availability overrides

#### CRM Tables
- `contacts`: Contact/lead information
- `interactions`: Activity history for contacts
- `referrals`: Referral tracking

#### Subscription Tables
- `coupons`: Discount coupons
- `payment_proofs`: Uploaded payment proof files
- `pro_subscriptions`: Subscription tracking (if separate from users table)

#### Integration Tables
- `google_event_tracking`: Links bookings to Google Calendar events
- `short_urls`: Short URL mappings
- `email_templates`: Customizable email templates
- `reminder_tracking`: Tracks sent reminders

#### System Tables
- `system_settings`: System-wide configuration
- `session`: User sessions (for connect-pg-simple)

### File Structure
```
/
├── db/                    # Database connection and migrations
├── jobs/                  # Background jobs (reminders, subscription expiration)
├── middleware/            # Auth and Pro subscription middleware
├── migrations/            # Database migration files
├── models/                # Data models
├── routes/                # API and page routes
├── services/              # External service integrations
├── utils/                 # Utility functions (timezone, subscription)
├── views/                 # EJS templates
└── public/                # Static files (CSS, JS, images)
```

### Key Routes

#### Public Routes
- `/`: Landing page
- `/booking/:username/:duration`: Public booking page
- `/s/:shortCode`: Short URL redirect
- `/auth/login`: Login page
- `/auth/register`: Registration page
- `/upgrade/:token`: Upgrade/payment page

#### Protected Routes (require login)
- `/dashboard`: Main dashboard
- `/dashboard/availability`: Availability settings
- `/dashboard/bookings`: Booking management
- `/dashboard/contacts`: CRM contacts
- `/dashboard/settings`: User settings
- `/crm`: CRM API endpoints

#### API Routes
- `/api/telegram`: Telegram webhook
- `/revenuecat`: RevenueCat webhook for mobile subscriptions
- `/auth/*`: Authentication endpoints
- `/booking/*`: Booking management endpoints

### Services

#### Mail Service (`services/mail.js`)
- Sends emails via Mailgun
- Handles email templates with placeholder replacement
- Sends booking confirmations, reminders, notifications

#### SMS Service (`services/sms.js`)
- Sends SMS via Semaphore API
- Formats phone numbers for Philippine format
- Sends booking confirmations and reminders

#### Google Calendar Service (`services/googleCalendar.js`)
- OAuth 2.0 authentication
- Create, update, delete calendar events
- Sync bookings with Google Calendar
- Check for calendar conflicts

#### Google Sheets Service (`services/googleSheets.js`)
- Export CRM data to Google Sheets
- OAuth 2.0 authentication
- Sync contacts and interactions

#### Telegram Service (`services/telegram.js`)
- Send notifications via Telegram bot
- Integration with n8n workflows
- Bot command handling

#### URL Shortener Service (`services/urlShortener.js`)
- Generate short URLs
- Map short codes to full URLs
- Track link usage

### Background Jobs

#### Reminder Job (`jobs/reminders.js`)
- Sends booking reminders before scheduled times
- Configurable reminder intervals
- Tracks sent reminders to avoid duplicates
- Currently disabled (can be enabled)

#### Subscription Expiration Job (`jobs/subscriptionExpiration.js`)
- Runs daily to check for expired subscriptions
- Updates user subscription status
- Sends expiration notifications

### Security Features
- Password hashing with bcryptjs
- Session-based authentication
- Secure session cookies (httpOnly, secure in production)
- CSRF protection considerations
- Input validation and sanitization
- File upload restrictions (payment proofs)
- SQL injection protection via parameterized queries
- XSS protection headers in production

### Environment Variables

#### Required Variables
- `NODE_ENV`: 'production' or 'development'
- `PORT`: Server port (default: 3000)
- `DATABASE_URL`: PostgreSQL connection string
- `SESSION_SECRET`: Secret for session encryption

#### Email Configuration
- `MAILGUN_API_KEY`: Mailgun API key
- `MAILGUN_DOMAIN`: Mailgun sending domain

#### SMS Configuration
- `SEMAPHORE_API_KEY`: Semaphore SMS API key

#### Google Integration
- `GOOGLE_CLIENT_ID`: OAuth 2.0 client ID
- `GOOGLE_CLIENT_SECRET`: OAuth 2.0 client secret
- `GOOGLE_REDIRECT_URI`: OAuth redirect URI

#### Telegram Configuration
- `TELEGRAM_BOT_TOKEN`: Telegram bot token
- `N8N_TELEGRAM_WEBHOOK_URL`: n8n webhook URL
- `N8N_WEBHOOK_SECRET`: Webhook secret

#### Payment/Subscription
- `REVENUECAT_API_KEY`: RevenueCat API key (optional)
- `APP_URL`: Application URL for links

#### reCAPTCHA (optional)
- `RECAPTCHA_SITE_KEY`: reCAPTCHA site key
- `RECAPTCHA_SECRET_KEY`: reCAPTCHA secret key

## Common Use Cases

### For Users (Scheduling Providers)
1. **Getting Started**
   - Register an account
   - Complete onboarding checklist
   - Set weekly availability
   - Configure meeting durations
   - Share booking link with clients

2. **Managing Bookings**
   - View all bookings in calendar
   - Edit or cancel bookings
   - Receive notifications for new bookings
   - Sync with Google Calendar

3. **Managing Contacts**
   - View all contacts in CRM
   - Add notes and interactions
   - Track referrals
   - Set follow-up reminders
   - Export to Google Sheets

4. **Upgrading to Pro**
   - Choose monthly or yearly plan
   - Upload payment proof via GCash
   - Wait for admin approval
   - Access all Pro features

### For Clients (Booking Appointments)
1. **Booking an Appointment**
   - Visit booking page link
   - Select available date and time
   - Choose meeting duration
   - Fill in contact information
   - Submit booking
   - Receive confirmation email/SMS

2. **Receiving Reminders**
   - Automatic reminders before appointment
   - Via email or SMS
   - Configurable timing

## Troubleshooting

### Common Issues

#### Booking Page Not Showing Available Times
- Check user's weekly availability settings
- Check for date-specific availability overrides
- Verify no Google Calendar conflicts (if integration enabled)
- Check if user's subscription is active

#### Email Notifications Not Sending
- Verify Mailgun API key and domain are set
- Check email template configuration
- Verify user email address is valid

#### SMS Notifications Not Sending
- Verify Semaphore API key is set
- Check phone number format (must be Philippine format: 639xxxxxxxxx)
- Verify SMS service is enabled for user

#### Google Calendar Not Syncing
- Verify Google OAuth credentials are correct
- Check if user has authorized the application
- Verify selected calendar exists and is accessible
- Check Google Calendar API quotas

#### Subscription Not Activating
- Verify payment proof was uploaded
- Check admin has approved payment
- Verify subscription expiration date is in future
- Check trial period hasn't expired

### Database Migrations
- All migrations are in `/migrations` directory
- Run migrations with: `npm run migrate`
- Migrations are numbered sequentially
- Always backup database before running migrations

### Logs
- Server logs: Check console output or log files
- Email logs: `email-send.log`, `email-route.log`
- Server output: `server-output.log`, `server.log`

## API Endpoints Reference

### Authentication
- `POST /auth/register`: Create new user account
- `POST /auth/login`: Login user
- `POST /auth/logout`: Logout user
- `GET /auth/me`: Get current user info

### Bookings
- `GET /booking/:username/:duration`: Public booking page
- `POST /booking`: Create new booking (requires login)
- `GET /dashboard/bookings`: View all bookings
- `PUT /booking/:id`: Update booking
- `DELETE /booking/:id`: Delete booking

### Availability
- `GET /dashboard/availability`: View availability settings
- `POST /dashboard/availability`: Update weekly availability
- `POST /dashboard/availability/breaks`: Update breaks
- `POST /dashboard/availability/dates`: Update date-specific availability

### CRM
- `GET /crm/contacts`: List contacts (with filters, search, pagination)
- `POST /crm/contacts`: Create contact
- `GET /crm/contacts/:id`: Get contact details
- `PUT /crm/contacts/:id`: Update contact
- `DELETE /crm/contacts/:id`: Delete contact
- `POST /crm/contacts/:id/interactions`: Add interaction
- `GET /crm/interactions`: List interactions

### Subscriptions
- `GET /upgrade/:token`: Upgrade/payment page
- `POST /upgrade/:token/payment-proof`: Upload payment proof
- `GET /revenuecat/webhook`: RevenueCat webhook (for mobile subscriptions)

## Data Models

### User
- `id`: Unique identifier
- `username`: Unique username
- `email`: Unique email
- `full_name`: Full name
- `display_name`: Public display name
- `password`: Hashed password
- `is_pro`: Pro subscription status
- `pro_expires_at`: Subscription expiration date
- `timezone`: User's timezone
- `google_calendar_enabled`: Google Calendar integration status
- `created_at`: Account creation date

### Booking
- `id`: Unique identifier
- `uuid`: Unique UUID for external tracking
- `user_id`: Owner of the booking
- `client_name`: Client's name
- `client_email`: Client's email
- `client_phone`: Client's phone
- `date`: Booking date
- `start_time`: Start time (HH:MM format)
- `end_time`: End time (HH:MM format)
- `duration_minutes`: Meeting duration
- `notes`: Additional notes
- `status`: Booking status
- `meeting_link`: Video call link
- `created_at`: Booking creation timestamp

### Contact
- `id`: Unique identifier
- `user_id`: Owner of the contact
- `name`: Contact name
- `email`: Email address
- `phone`: Phone number
- `company`: Company name
- `position`: Job position
- `industry`: Industry sector
- `status`: Contact status
- `referral_potential`: Rating 1-5
- `notes`: Additional notes
- `tags`: Array of tags
- `last_contact_date`: Last interaction date
- `next_follow_up`: Next follow-up reminder date
- `bni_member`: BNI member flag
- `bni_chapter`: BNI chapter name

### Interaction
- `id`: Unique identifier
- `contact_id`: Related contact
- `user_id`: Owner
- `type`: Interaction type (meeting, call, email, etc.)
- `subject`: Interaction subject
- `notes`: Details
- `outcome`: Interaction outcome
- `referral_value`: Monetary value if applicable
- `date`: Interaction date/time
- `booking_id`: Linked booking (if applicable)

## Best Practices

### For Users
1. Set realistic availability that you can maintain
2. Keep contact information up to date in CRM
3. Log interactions promptly for better relationship tracking
4. Use tags and statuses to organize contacts effectively
5. Set follow-up reminders for important contacts
6. Sync with Google Calendar to avoid double bookings
7. Keep subscription active to maintain access

### For Administrators
1. Regularly review payment proofs and approve promptly
2. Monitor system logs for errors
3. Keep database backups before migrations
4. Verify environment variables are set correctly
5. Monitor API quotas (Google, Mailgun, Semaphore)
6. Keep dependencies updated for security

## Support & Resources

### Documentation Files
- `README.md`: Basic setup instructions
- `TELEGRAM_SETUP_GUIDE.md`: Telegram bot setup
- `n8n-workflows-guide.md`: n8n workflow configuration

### Migration Files
- Located in `/migrations` directory
- Numbered sequentially (001, 002, etc.)
- Run all migrations for fresh setup

### Test Scripts
- Located in `/scripts` directory
- Useful for testing specific features
- Examples: test booking, test emails, test timezone conversion

## Frequently Asked Questions

**Q: How do I share my booking link?**
A: After setting up availability, go to your dashboard and copy your booking link. Share this link with clients so they can book appointments.

**Q: Can I have multiple booking durations?**
A: Yes! You can configure multiple meeting durations (15 min, 30 min, 60 min, etc.) and each will have its own booking URL.

**Q: How do I sync with Google Calendar?**
A: Go to Settings > Integrations > Google Calendar and authorize the app. Then enable calendar sync and select which calendar to use.

**Q: What happens when my subscription expires?**
A: Your booking links will show an expiration message, and you'll lose access to Pro features. Upload a new payment proof to reactivate.

**Q: Can clients cancel bookings?**
A: Currently, only you (the account owner) can modify or cancel bookings from the dashboard.

**Q: How do I track referrals?**
A: Use the CRM section to add interactions of type "referral_given" or "referral_received" and link them to contacts.

**Q: Are there mobile apps?**
A: The web app is mobile-responsive. There may be mobile apps with RevenueCat integration, but the web app works on all devices.

**Q: How do timezones work?**
A: Set your timezone in Settings. All times are displayed in your timezone, and booking times are automatically converted between you and your clients' timezones.

## Quick Reference for AI Chat

### Key Facts
- **Application Name**: SimpleSchedule (branded as "isked")
- **Type**: Web-based scheduling and CRM application
- **Tech Stack**: Node.js, Express.js, PostgreSQL, EJS templates
- **Main Purpose**: Allow users to create public booking pages for clients to schedule appointments

### Subscription & Access
- **Trial Period**: 5 days for new users
- **Subscription Plans**: PHP 499/month (monthly) or PHP 3,999/year (yearly)
- **Access Priority**: Admin-granted Pro > RevenueCat > Trial > No access
- **Grace Period**: 1 day after subscription expiration before auto-deactivation
- **Payment**: GCash via QR codes, payment proof upload required, admin approval

### Core Features Summary
1. **Booking System**: Public booking pages per user with multiple duration options
2. **Availability**: Weekly schedule + date-specific overrides + break times
3. **CRM**: Contacts, interactions, referrals tracking
4. **Integrations**: Google Calendar (two-way sync), Google Sheets (export), Telegram bot
5. **Notifications**: Email (Mailgun), SMS (Semaphore - Philippines only), Telegram
6. **Timezone Support**: Automatic conversion between user and client timezones

### Important Technical Details
- **Database**: PostgreSQL in production, SQLite in development
- **Sessions**: Stored in PostgreSQL via connect-pg-simple
- **SMS Format**: Philippine format required (639xxxxxxxxx, no spaces, no leading 0)
- **Email Templates**: Use `{{variable_name}}` placeholder syntax
- **Migrations**: Located in `/migrations`, run with `npm run migrate`
- **Background Jobs**: Reminder job (disabled), subscription expiration job (daily)

### Common User Actions
- Register → Set availability → Configure durations → Share booking link
- View bookings in dashboard → Edit/cancel as needed
- Manage contacts in CRM → Add interactions → Track referrals
- Upgrade via payment proof upload → Wait for admin approval

### Common Issues & Solutions
- **No available times**: Check availability settings, Google Calendar conflicts, date overrides
- **Emails not sending**: Verify Mailgun API key and domain
- **SMS not sending**: Check phone format (Philippine format required), Semaphore API key
- **Calendar not syncing**: Verify OAuth credentials, check calendar selection
- **Subscription not active**: Verify payment proof approved, check expiration date

### File Locations
- Routes: `/routes` directory
- Services: `/services` directory (mail, sms, googleCalendar, etc.)
- Views: `/views` directory (EJS templates)
- Migrations: `/migrations` directory (sequential numbering)
- Database schema: `/db/schema.postgres.sql`

