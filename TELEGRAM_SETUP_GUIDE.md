# Telegram Bot Setup Guide for SimpleSchedule

## Your Bot Details
- **Bot Username**: @iskedbot
- **Bot Token**: YOUR_BOT_TOKEN_HERE
- **Bot URL**: https://t.me/iskedbot

## Quick Setup Steps

### 1. Add Environment Variables
Add these to your `.env` file:

```bash
# Telegram Integration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
N8N_TELEGRAM_WEBHOOK_URL=https://your-n8n-instance.com/webhook/telegram
N8N_WEBHOOK_SECRET=your_secure_secret_here
APP_URL=https://your-app-url.com
```

### 2. Configure Bot Commands (Optional)
Send these commands to @BotFather to set up your bot:

```
/setcommands
```

Then paste:
```
start - Link your SimpleSchedule account
bookings - View your bookings
bookings tomorrow - View tomorrow's bookings
bookings YYYY-MM-DD - View specific date
contacts - Search your contacts
help - Show available commands
settings - Manage notification preferences
```

### 3. Set Bot Description (Optional)
Send to @BotFather:
```
/setdescription
```

Then paste:
```
SimpleSchedule Bot - Manage your bookings and contacts via Telegram. Send /start to begin.
```

### 4. Test Your Bot
1. Open Telegram and search for `@iskedbot`
2. Start a conversation with your bot
3. Send `/start` to test the connection

### 5. Set Up n8n Workflows
Use the detailed guide in `n8n-workflows-guide.md` to create the required workflows:

1. **Telegram Bot Listener** - Handles incoming commands
2. **Booking Notifications** - Sends booking alerts
3. **CRM Notifications** - Sends contact updates
4. **Account Linking** - Handles user authentication

### 6. Test End-to-End Flow
1. Create a booking in SimpleSchedule
2. Check if you receive a Telegram notification
3. Try bot commands like `/bookings` and `/contacts`

## Security Notes
- Keep your bot token secure and never share it publicly
- Use a strong webhook secret for n8n communication
- The bot token is already configured in your code

## Troubleshooting
- If notifications don't work, check your environment variables
- If bot commands don't work, verify your n8n workflows are running
- Check the application logs for any Telegram-related errors

## Next Steps
1. Set up your n8n instance and workflows
2. Test the integration with a few bookings
3. Share the bot with your users for testing
4. Monitor the logs for any issues

Your Telegram integration is now ready to use! 🚀


