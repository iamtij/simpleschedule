# n8n Workflows for Telegram Integration

## Workflow 1: Telegram Bot Listener

This workflow listens for incoming Telegram messages and routes them to the appropriate handlers.

### Nodes:
1. **Telegram Trigger Node**
   - Event: "Message Received"
   - Bot Token: `{{ $env.TELEGRAM_BOT_TOKEN }}`

2. **Switch Node** (Route by command)
   - Routes based on `{{ $json.message.text }}`
   - Cases:
     - `/start` → Link Account Flow
     - `/bookings` → Get Bookings Flow
     - `/contacts` → Get Contacts Flow
     - `/help` → Help Flow
     - Default → Unknown Command

3. **HTTP Request Nodes** (for each command)
   - URL: `{{ $env.APP_URL }}/api/telegram/webhook`
   - Method: POST
   - Headers:
     - `Content-Type: application/json`
     - `x-n8n-webhook-secret: {{ $env.N8N_WEBHOOK_SECRET }}`
   - Body:
     ```json
     {
       "command": "get_bookings",
       "chatId": "{{ $json.message.chat.id }}",
       "data": {
         "date": "{{ $json.message.text.split(' ')[1] || new Date().toISOString().split('T')[0] }}"
       }
     }
     ```

4. **Telegram Send Message Node**
   - Chat ID: `{{ $json.message.chat.id }}`
   - Text: Formatted response from SimpleSchedule API

### Example Commands Handled:
- `/start` - Link Telegram account with connection code
- `/bookings` - View today's bookings
- `/bookings tomorrow` - View tomorrow's bookings
- `/bookings 2024-01-15` - View bookings for specific date
- `/contacts` - Search contacts
- `/help` - Show available commands

## Workflow 2: Booking Notifications

This workflow sends booking notifications to users via Telegram.

### Nodes:
1. **Webhook Trigger Node**
   - Path: `/webhook/booking-notification`
   - Method: POST

2. **Set Node** (Extract booking data)
   - Extract booking and host information from webhook payload

3. **HTTP Request Node** (Get user's Telegram info)
   - URL: `{{ $env.APP_URL }}/api/users/{{ $json.host.id }}/telegram`
   - Method: GET

4. **IF Node** (Check if Telegram is enabled)
   - Condition: `{{ $json.telegram_enabled === true }}`

5. **Telegram Send Message Node** (Send notification)
   - Chat ID: `{{ $json.telegram_chat_id }}`
   - Text: Formatted booking notification
   - Parse Mode: HTML
   - Reply Markup: Inline keyboard with action buttons

6. **Schedule Trigger Node** (Send reminders)
   - Schedule: 1 hour before booking
   - Schedule: 24 hours before booking

## Workflow 3: CRM Notifications

This workflow sends CRM-related notifications to users via Telegram.

### Nodes:
1. **Webhook Trigger Node**
   - Path: `/webhook/crm-notification`
   - Method: POST

2. **Set Node** (Extract contact data)
   - Extract contact and action information from webhook payload

3. **HTTP Request Node** (Get user's Telegram info)
   - URL: `{{ $env.APP_URL }}/api/users/{{ $json.user_id }}/telegram`
   - Method: GET

4. **IF Node** (Check if Telegram is enabled)
   - Condition: `{{ $json.telegram_enabled === true }}`

5. **Telegram Send Message Node** (Send notification)
   - Chat ID: `{{ $json.telegram_chat_id }}`
   - Text: Formatted contact notification
   - Parse Mode: HTML

## Workflow 4: Account Linking

This workflow handles linking Telegram accounts to SimpleSchedule users.

### Nodes:
1. **Telegram Trigger Node**
   - Event: "Message Received"
   - Bot Token: `{{ $env.TELEGRAM_BOT_TOKEN }}`
   - Filter: `{{ $json.message.text.startsWith('/start') }}`

2. **Set Node** (Extract connection code)
   - Extract user ID from `/start` command or prompt for it

3. **HTTP Request Node** (Link account)
   - URL: `{{ $env.APP_URL }}/api/telegram/link`
   - Method: POST
   - Body:
     ```json
     {
       "userId": "{{ $json.connectionCode }}",
       "chatId": "{{ $json.message.chat.id }}",
       "username": "{{ $json.message.from.username }}"
     }
     ```

4. **Telegram Send Message Node** (Send confirmation)
   - Chat ID: `{{ $json.message.chat.id }}`
   - Text: Success or error message

## Environment Variables Required:

```bash
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
N8N_WEBHOOK_SECRET=your_secure_secret
APP_URL=https://your-simpleschedule-app.com
```

## Webhook Endpoints to Configure:

1. **Booking Notifications**: `https://your-n8n-instance.com/webhook/booking-notification`
2. **CRM Notifications**: `https://your-n8n-instance.com/webhook/crm-notification`

## Security Considerations:

1. **Webhook Secret**: Always use the `N8N_WEBHOOK_SECRET` header for authentication
2. **Rate Limiting**: Implement rate limiting in n8n workflows
3. **Error Handling**: Add proper error handling for all HTTP requests
4. **Logging**: Log all Telegram interactions for audit purposes

## Testing Commands:

1. `/start` - Test account linking
2. `/bookings` - Test booking retrieval
3. `/contacts` - Test contact search
4. `/help` - Test help command

## Message Templates:

### Booking Notification:
```
🗓️ Booking Confirmed!

📅 Date: January 15, 2024
⏰ Time: 2:00 PM
👤 Client: John Doe
📧 Email: john@example.com
📱 Phone: +1234567890
🔗 Meeting Link: https://zoom.us/j/123456789

📝 Notes: Discuss project requirements

[✅ Confirm] [✏️ Reschedule] [❌ Cancel]
```

### Contact Notification:
```
➕ New Contact Added

👤 John Doe
🏢 Acme Corp
💼 Marketing Manager
📊 Status: New Lead
⭐ Referral: 3/5

View Contact: https://your-app.com/contacts/123
```

### Help Message:
```
🤖 SimpleSchedule Bot Commands:

/start - Link your account
/bookings - View today's bookings
/bookings tomorrow - View tomorrow's bookings
/bookings YYYY-MM-DD - View specific date
/contacts - Search your contacts
/help - Show this help message

Need more help? Contact support.
```
