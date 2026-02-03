# Security Documentation

## Overview

ParaDocs uses Supabase for authentication and database management with Row Level Security (RLS) policies to protect user data.

## Row Level Security (RLS) Model

### Public Access Tables
These tables have public read access:
- `profiles` - User profiles (public read, owner write)
- `reports` - Paranormal reports (approved only, or owner's own)
- `comments` - Comments on approved reports
- `phenomena` - Encyclopedia entries
- `subscription_tiers` - Available subscription plans

### User-Owned Data Tables
Users can only access their own data:
- `votes` - User voting records
- `saved_reports` - User's saved reports
- `user_subscriptions` - User's subscription status
- `report_media` - Media attached to user's own reports

### Service-Role Only Tables
These tables require service_role key (admin/cron access):
- `beta_signups` - Beta signup data (no public policies)
- `ingestion_runs` - Data ingestion logs
- `ingestion_posts` - Processed ingestion data
- `emerging_patterns` - AI-detected patterns (public read, admin write)
- `pattern_reports` - Pattern associations (public read, admin write)

## API Security

### Public API Endpoints
- `/api/beta-signup` - Uses service_role for writes (no auth required)
- `/api/report/*` - Uses anon key with RLS

### Protected API Endpoints
- `/api/cron/*` - Requires `CRON_SECRET` bearer token
- `/api/admin/*` - Requires authenticated admin user

## Environment Variables

### Required (Production)
```
NEXT_PUBLIC_SUPABASE_URL      # Safe to expose
NEXT_PUBLIC_SUPABASE_ANON_KEY # Safe to expose
SUPABASE_SERVICE_ROLE_KEY     # NEVER expose
CRON_SECRET                   # NEVER expose
```

### Beta Protection
```
BETA_PROTECTION_ENABLED       # Set to 'true' in production
BETA_AUTH_USERNAME            # Change default credentials!
BETA_AUTH_PASSWORD            # Use strong password (20+ chars)
```

## Security Checklist

### Deployment
- [ ] All environment variables set in hosting platform (not in code)
- [ ] Service role key stored securely
- [ ] Cron secret configured for scheduled jobs
- [ ] Beta credentials changed from defaults
- [ ] HTTPS enforced

### Database
- [ ] RLS enabled on all tables
- [ ] All tables have appropriate policies
- [ ] Service role access limited to necessary operations
- [ ] No exposed credentials in code

### Code Review
- [ ] No hardcoded secrets
- [ ] API endpoints validate authentication
- [ ] User input sanitized
- [ ] Error messages don't leak sensitive info

## Reporting Security Issues

If you discover a security vulnerability, please email security@discoverparadocs.com with:
1. Description of the vulnerability
2. Steps to reproduce
3. Potential impact

Do not disclose security issues publicly until they have been addressed.

## Changelog

### 2026-02-03 - Security Hardening
- Added missing RLS policies for `report_media` (INSERT/UPDATE/DELETE)
- Added RLS to `phenomena` and `report_phenomena` tables
- Added comments documenting security model on sensitive tables
- Updated `.env.example` with security guidance
- Created this security documentation

