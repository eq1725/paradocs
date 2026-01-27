# ParaDocs Deployment Guide

This guide will walk you through deploying ParaDocs step-by-step. No coding experience required!

## Overview

ParaDocs uses two services:
- **Supabase** - Your database (stores all the reports, users, etc.)
- **Vercel** - Your website hosting (makes your site live on the internet)

Both services have generous free tiers that will work for most use cases.

---

## Step 1: Set Up Supabase (Your Database)

### 1.1 Create a Supabase Account

1. Go to [supabase.com](https://supabase.com)
2. Click **"Start your project"**
3. Sign up with your GitHub account (recommended) or email

### 1.2 Create a New Project

1. Click **"New Project"**
2. Fill in the details:
   - **Name**: `paradocs` (or whatever you prefer)
   - **Database Password**: Create a strong password and **save it somewhere safe**
   - **Region**: Choose the one closest to your users
3. Click **"Create new project"**
4. Wait 2-3 minutes for your project to set up

### 1.3 Set Up the Database

1. In the left sidebar, click **"SQL Editor"**
2. Click **"New query"**
3. Open the file `supabase/migrations/001_initial_schema.sql` from the ParaDocs folder
4. Copy ALL the contents and paste them into the SQL editor
5. Click **"Run"** (or press Ctrl+Enter / Cmd+Enter)
6. You should see a success message

### 1.4 Enable Authentication Providers

1. In the left sidebar, click **"Authentication"**
2. Click **"Providers"** in the top menu
3. Enable **Email** (should be on by default)
4. (Optional) Enable **Google**:
   - Click on Google
   - Toggle it on
   - You'll need to [create Google OAuth credentials](https://console.cloud.google.com/apis/credentials)
   - Paste your Client ID and Client Secret
5. (Optional) Enable **GitHub**:
   - Click on GitHub
   - Toggle it on
   - [Create a GitHub OAuth app](https://github.com/settings/developers)
   - Paste your Client ID and Client Secret

### 1.5 Get Your API Keys

1. In the left sidebar, click **"Settings"** (gear icon at bottom)
2. Click **"API"** in the settings menu
3. You'll see two important values - **copy these somewhere safe**:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public key** (a long string starting with `eyJ...`)

---

## Step 2: Deploy to Vercel (Your Website)

### 2.1 Prepare Your Code

First, you need to get the code onto GitHub:

1. Go to [github.com](https://github.com) and sign in (or create an account)
2. Click the **"+"** icon in the top right → **"New repository"**
3. Name it `paradocs`
4. Keep it **Public** or **Private** (your choice)
5. Click **"Create repository"**
6. Follow the instructions to upload the ParaDocs files:

   **Option A: Using GitHub Desktop (Easiest)**
   - Download [GitHub Desktop](https://desktop.github.com)
   - Clone your new repository
   - Copy all ParaDocs files into the folder
   - Commit and push

   **Option B: Using the command line**
   ```bash
   cd paradocs
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/paradocs.git
   git push -u origin main
   ```

### 2.2 Deploy on Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **"Sign Up"** and use your GitHub account
3. Click **"Add New..."** → **"Project"**
4. Find and select your `paradocs` repository
5. Click **"Import"**

### 2.3 Configure Environment Variables

Before clicking Deploy, you need to add your Supabase credentials:

1. Expand **"Environment Variables"**
2. Add these variables one by one:

   | Name | Value |
   |------|-------|
   | `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase Project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Your Supabase anon/public key |
   | `NEXT_PUBLIC_SITE_URL` | Leave blank for now |

3. Click **"Deploy"**
4. Wait 2-3 minutes for the build to complete

### 2.4 Update Your Site URL

1. Once deployed, Vercel will give you a URL like `paradocs-xxxxx.vercel.app`
2. Go back to your Vercel project settings
3. Click **"Settings"** → **"Environment Variables"**
4. Add or update `NEXT_PUBLIC_SITE_URL` with your Vercel URL
5. In Vercel, click **"Deployments"** → click the three dots on your deployment → **"Redeploy"**

### 2.5 Update Supabase Redirect URLs

1. Go back to Supabase
2. Click **"Authentication"** → **"URL Configuration"**
3. Update these settings:
   - **Site URL**: Your Vercel URL (e.g., `https://paradocs-xxxxx.vercel.app`)
   - **Redirect URLs**: Add your Vercel URL

---

## Step 3: Add Sample Data (Optional)

To populate your database with sample paranormal reports:

### Option A: Run the seed script locally

1. Create a file called `.env` in your paradocs folder with:
   ```
   NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```
   (Get the service role key from Supabase → Settings → API → service_role key)

2. Run:
   ```bash
   npm install
   npm run seed
   ```

### Option B: Add data manually via Supabase

1. Go to Supabase → **"Table Editor"**
2. Select the `reports` table
3. Click **"Insert row"**
4. Fill in the fields and save

---

## Step 4: Set Up Your Custom Domain (Optional)

### 4.1 Add Domain to Vercel

1. In Vercel, go to your project
2. Click **"Settings"** → **"Domains"**
3. Enter your domain (e.g., `discoverparadocs.com`)
4. Click **"Add"**

### 4.2 Update DNS Settings

Vercel will show you DNS records to add. Go to your domain registrar:

1. Add an **A record**:
   - Name: `@`
   - Value: `76.76.21.21`

2. Add a **CNAME record**:
   - Name: `www`
   - Value: `cname.vercel-dns.com`

Wait 5-30 minutes for DNS to propagate.

### 4.3 Update URLs

1. Update `NEXT_PUBLIC_SITE_URL` in Vercel to your custom domain
2. Update the Site URL in Supabase Authentication settings
3. Redeploy on Vercel

---

## Troubleshooting

### "Invalid API Key" Error
- Make sure you copied the Supabase keys correctly
- Check there are no extra spaces in the environment variables
- Redeploy after changing environment variables

### "Database Error"
- Make sure you ran the SQL migration script completely
- Check the Supabase SQL Editor for any error messages

### Authentication Not Working
- Verify the Site URL in Supabase matches your actual site URL
- Make sure Redirect URLs include your domain
- For OAuth providers, double-check your credentials

### Page Not Loading
- Check Vercel deployment logs for errors
- Make sure all environment variables are set
- Try redeploying

---

## Next Steps

Once deployed, you can:

1. **Create an admin account** - Sign up on your site, then in Supabase:
   - Go to Table Editor → profiles
   - Find your user and change `role` to `admin`

2. **Customize the design** - Edit the Tailwind config and CSS files

3. **Add more features** - The codebase is ready for you to extend

4. **Import data** - Use the seed script as a template to import from NUFORC, BFRO, etc.

---

## Getting Help

- **Supabase Docs**: [supabase.com/docs](https://supabase.com/docs)
- **Vercel Docs**: [vercel.com/docs](https://vercel.com/docs)
- **Next.js Docs**: [nextjs.org/docs](https://nextjs.org/docs)

---

## Cost Estimates

Both services have generous free tiers:

| Service | Free Tier | Paid (if needed) |
|---------|-----------|------------------|
| Supabase | 500MB database, 2GB storage, 50K monthly users | $25/month for more |
| Vercel | 100GB bandwidth, unlimited deployments | $20/month for more |

For most personal projects, the free tiers are sufficient.

---

🌌 **Congratulations!** Your ParaDocs site is now live!
