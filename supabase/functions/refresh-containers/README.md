## Deploy

1. Install Supabase CLI:
   npm install -g supabase

2. Login:
   supabase login

3. Link project:
   supabase link --project-ref lokiszscjahxabturzoo

4. Deploy function:
   supabase functions deploy refresh-containers

5. Set up cron in Supabase Dashboard:
   - Go to https://supabase.com/dashboard/project/lokiszscjahxabturzoo/database/hooks
   - Or use pg_cron via SQL Editor:

   SELECT cron.schedule(
     'refresh-containers-every-30-min',
     '*/30 * * * *',
     $$
     SELECT net.http_post(
       url := 'https://lokiszscjahxabturzoo.supabase.co/functions/v1/refresh-containers',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'Authorization', 'Bearer ' || current_setting('app.service_role_key')
       ),
       body := '{}'::jsonb
     );
     $$
   );

## Environment variables needed in Supabase Dashboard → Settings → Edge Functions:
   SUPABASE_URL (auto-set)
   SUPABASE_SERVICE_ROLE_KEY (auto-set)
