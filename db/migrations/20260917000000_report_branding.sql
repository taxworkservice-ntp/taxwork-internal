-- Report cover branding: firm name, accent color, and cover style (modern|classic).
-- cover_style lets the cover design be rolled back at runtime without redeploy.

alter table app_settings
  add column if not exists firm_name text,
  add column if not exists brand_color text,
  add column if not exists cover_style text not null default 'modern';
