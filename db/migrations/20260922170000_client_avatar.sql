-- Client monogram avatar: an optional abbreviation (e.g. DTN) and background
-- colour used in front of the client's name across the app. Nullable so clients
-- fall back to a neutral, auto-derived placeholder until configured.

alter table public.clients
  add column if not exists avatar_text text,
  add column if not exists avatar_color text;
