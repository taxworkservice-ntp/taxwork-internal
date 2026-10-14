-- Customizable LINE/social link-preview text for public report share links.
-- The preview is rendered for unauthenticated crawlers (which never pass the
-- tax-ID gate), so these strings must stay non-sensitive. Null = use the
-- built-in defaults in lib/share-preview.ts.

alter table app_settings
  add column if not exists share_preview_title text,
  add column if not exists share_preview_description text;
