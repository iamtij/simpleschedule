-- Insert email templates into email_templates table
-- Using ON CONFLICT to avoid duplicates if run multiple times

-- Add reply_to column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'email_templates' AND column_name = 'reply_to'
    ) THEN
        ALTER TABLE email_templates ADD COLUMN reply_to TEXT;
    END IF;
END $$;

-- Add unique constraint on name if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'email_templates_name_unique'
    ) THEN
        ALTER TABLE email_templates ADD CONSTRAINT email_templates_name_unique UNIQUE (name);
    END IF;
END $$;

-- Insert all templates
INSERT INTO email_templates (name, description, subject, body, reply_to, created_at, updated_at)
VALUES
(
    'Client Booking Confirmation',
    'Sent to clients when their booking is confirmed. Variables: client_name, host_name, booking_date, booking_start_time, booking_end_time, meeting_link (optional), booking_notes (optional), calendar_link',
    'Appointment Confirmed with {{host_name}}',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello {{client_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your appointment has been confirmed!
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">With: {{host_name}}</p>
                                {{meeting_link_html}}
                                {{booking_notes_html}}
                            </div>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Thank you for using isked!
                            </p>
                            <p style="margin: 0; text-align: center;">
                                <a href="{{calendar_link}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Add to Calendar</a>
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Host Booking Notification',
    'Sent to hosts when a new booking is created. Variables: host_name, client_name, client_email, client_phone (optional), booking_date, booking_start_time, booking_end_time, booking_notes (optional), meeting_link (optional), dashboard_url, calendar_link',
    'New Appointment: {{client_name}}',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello {{host_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                You have a new appointment scheduled!
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: {{client_name}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:{{client_email}}" style="color: #3b82f6; text-decoration: none;">{{client_email}}</a></p>
                                {{client_phone_html}}
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                {{booking_notes_html}}
                                {{meeting_link_html}}
                            </div>
                            <p style="margin: 0 0 20px 0; text-align: center;">
                                <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px; margin-right: 12px;">View Dashboard</a>
                                <a href="{{calendar_link}}" style="display: inline-block; padding: 12px 24px; background-color: #ffffff; color: #3b82f6 !important; text-decoration: none; border: 2px solid #3b82f6; border-radius: 6px; font-weight: 500; font-size: 15px;">Add to Calendar</a>
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Client Reminder (30 minutes)',
    'Sent to clients 30 minutes before their appointment. Variables: client_name, host_name, booking_date, booking_start_time, booking_end_time, meeting_link (optional), booking_notes (optional)',
    'Reminder: Your appointment starts in 30 minutes',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi {{client_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Just a quick reminder that your appointment with {{host_name}} begins in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                {{meeting_link_html}}
                                {{booking_notes_html}}
                            </div>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                See you soon!
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Host Reminder (30 minutes)',
    'Sent to hosts 30 minutes before an appointment. Variables: host_name, client_name, client_email, client_phone (optional), booking_date, booking_start_time, booking_end_time, meeting_link (optional), booking_notes (optional), dashboard_url',
    'Reminder: {{client_name}} meets you in 30 minutes',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi {{host_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Heads up—your meeting with {{client_name}} starts in 30 minutes.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: {{client_name}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:{{client_email}}" style="color: #3b82f6; text-decoration: none;">{{client_email}}</a></p>
                                {{client_phone_html}}
                            </div>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                {{meeting_link_html}}
                                {{booking_notes_html}}
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Manage Booking</a>
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Client Reminder (1 hour)',
    'Sent to clients 1 hour before their appointment. Variables: client_name, host_name, booking_date, booking_start_time, booking_end_time, meeting_link (optional), booking_notes (optional)',
    'Reminder: Your appointment starts in 1 hour',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi {{client_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Just a friendly reminder that your appointment with {{host_name}} begins in 1 hour.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                {{meeting_link_html}}
                                {{booking_notes_html}}
                            </div>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                See you soon!
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Host Reminder (1 hour)',
    'Sent to hosts 1 hour before an appointment. Variables: host_name, client_name, client_email, client_phone (optional), booking_date, booking_start_time, booking_end_time, meeting_link (optional), booking_notes (optional), dashboard_url',
    'Reminder: {{client_name}} meets you in 1 hour',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hi {{host_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Heads up—your meeting with {{client_name}} starts in 1 hour.
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Client details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: {{client_name}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:{{client_email}}" style="color: #3b82f6; text-decoration: none;">{{client_email}}</a></p>
                                {{client_phone_html}}
                            </div>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Appointment details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Date: {{booking_date}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Time: {{booking_start_time}} - {{booking_end_time}}</p>
                                {{meeting_link_html}}
                                {{booking_notes_html}}
                            </div>
                            <p style="margin: 0; text-align: center;">
                                <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Manage Booking</a>
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Password Reset',
    'Sent when a user requests a password reset. Variables: reset_link',
    'Reset Your Password - isked',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello,
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                You have requested to reset your password for your isked account.
                            </p>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="{{reset_link}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Reset Password</a>
                            </p>
                            <p style="margin: 0 0 12px 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                This link will expire in 1 hour.
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                If you did not request this password reset, please ignore this email.
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Welcome Email',
    'Sent to new users when they register. Variables: user_name, dashboard_url',
    'Welcome to isked! 🎉',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello {{user_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Welcome to isked! 🎉 We''re excited to have you on board.
                            </p>
                            <p style="margin: 0 0 16px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your account has been successfully created and you can now:
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0; text-align: left;">
                                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Create and manage your schedule</li>
                                    <li style="margin-bottom: 8px;">Accept bookings from clients</li>
                                    <li style="margin-bottom: 8px;">Customize your availability</li>
                                    <li>And much more!</li>
                                </ul>
                            </div>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="{{dashboard_url}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Visit Your Dashboard</a>
                            </p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                If you have any questions or need assistance, feel free to reply to this email.
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Trial Expiration Reminder',
    'Sent to users when their trial is about to expire. Variables: user_name, days_text, urgency_text, upgrade_link',
    'Your ISKED Free Trial Expires Tomorrow - Upgrade Now',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello {{user_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your ISKED free trial expires {{days_text}}! {{urgency_text}}
                            </p>
                            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">What happens next:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Your trial access will end {{days_text}}</li>
                                    <li style="margin-bottom: 8px;">Upgrade to Pro to keep all your features</li>
                                    <li>Unlimited bookings, contacts, and more</li>
                                </ul>
                            </div>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="{{upgrade_link}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Upgrade to Pro Now</a>
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                This link will expire in 7 days. If you have any questions, feel free to reply to this email.
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Payment Proof Notification (Admin)',
    'Sent to admin when a user submits payment proof. Variables: user_name, user_email, user_username, user_id, plan_name, plan_price, admin_url',
    'Payment Proof - {{user_name}} - {{plan_name}}',
    '<p style="margin: 0 0 24px 0; font-size: 18px; line-height: 1.6; color: #111827; text-align: center; font-weight: 600;">
                                New Payment Proof Submission
                            </p>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 20px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">User Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Name: {{user_name}}</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Email: <a href="mailto:{{user_email}}" style="color: #3b82f6; text-decoration: none;">{{user_email}}</a></p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Username: {{user_username}}</p>
                                <p style="margin: 8px 0 0 0; font-size: 15px; line-height: 1.6; color: #374151;">User ID: {{user_id}}</p>
                            </div>
                            <div style="background-color: #f9fafb; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">Subscription Details:</p>
                                <p style="margin: 0 0 8px 0; font-size: 15px; line-height: 1.6; color: #374151;">Plan: {{plan_name}}</p>
                                <p style="margin: 0; font-size: 15px; line-height: 1.6; color: #374151;">Price: {{plan_price}}</p>
                            </div>
                            <div style="background-color: #dbeafe; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 16px 0; font-size: 15px; line-height: 1.6; color: #1e40af; text-align: center;">
                                    Please review the attached payment proof and activate the user''s Pro subscription if verified.
                                </p>
                                <p style="margin: 0; text-align: center;">
                                    <a href="{{admin_url}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">View User Profile in Admin Dashboard</a>
                                </p>
                            </div>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Test Email',
    'Test email template for testing email functionality',
    'Test Email from isked',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This is a test email from your scheduling application - isked.
                            </p>
                            <p style="margin: 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                This email demonstrates the new mobile-responsive design with centered layout and proper spacing.
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
),
(
    'Expired Trial',
    'Send to clients when their trial has expired',
    'Your ISKED Free Trial Has Expired',
    '<p style="margin: 0 0 20px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Hello {{user_name}},
                            </p>
                            <p style="margin: 0 0 24px 0; font-size: 16px; line-height: 1.6; color: #333333; text-align: center;">
                                Your ISKED free trial has expired.
                            </p>
                            <div style="background-color: #fee2e2; border-left: 4px solid #ef4444; border-radius: 6px; padding: 20px; margin: 0 0 24px 0;">
                                <p style="margin: 0 0 12px 0; font-size: 15px; line-height: 1.6; color: #111827; font-weight: 500;">What this means:</p>
                                <ul style="margin: 0; padding-left: 20px; color: #374151; font-size: 15px; line-height: 1.8;">
                                    <li style="margin-bottom: 8px;">Your trial access has ended</li>
                                    <li style="margin-bottom: 8px;">Upgrade to Pro to continue using all features</li>
                                    <li>Unlimited bookings, contacts, and more</li>
                                </ul>
                            </div>
                            <p style="margin: 0 0 24px 0; text-align: center;">
                                <a href="{{upgrade_link}}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: #ffffff !important; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 15px;">Upgrade to Pro Now</a>
                            </p>
                            <p style="margin: 0; font-size: 14px; line-height: 1.6; color: #6b7280; text-align: center;">
                                If you have any questions, feel free to reply to this email.
                            </p>',
    NULL,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
)
ON CONFLICT (name) DO NOTHING;

-- Verify insertion
SELECT COUNT(*) as template_count FROM email_templates;

