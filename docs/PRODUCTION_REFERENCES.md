# Production image references

Apply `src/infrastructure/supabase/migrations/0026_production_references.sql`
after migrations 0021 through 0025 before saving a production with references.
Existing productions without references remain readable.

In The brief, open References, select an image purpose, and upload a JPG, PNG,
or WebP under 4 MB. Up to six references are supported. Images use the existing
elements storage bucket. Removing a draft reference detaches it; it does not
delete the underlying file. These URLs use the existing public bucket access
model, so they should not be treated as private links.

Saving the brief freezes its reference list. Creative direction displays the
saved images. Creating a versioned revision inherits that list. Editing the
reference list of a saved production is not yet supported; start a new brief
to choose different images.

All seven planning roles receive the images, their purposes, and the planning
context. The first character or product reference is supplied as the opening
video's image input. Other images guide planning, not separate video-model
input slots. Subsequent shots use the approved previous ending frame.

Video references, audio uploads, beat analysis, shot-specific assignments,
stereoscopic rendering, and spatial export are not included in this increment.

## Manual acceptance checks

1. Save a brief with two different image roles, navigate away, and reopen it.
2. Confirm previews and role labels match the saved files and removal is locked.
3. Confirm unsupported files, oversized files, and failed uploads show errors.
4. Confirm save is disabled during upload and uploading cannot exceed six images.
5. At 375px width, verify the role selector, upload button, preview cards, and
   filename labels remain inside the drawer. Test keyboard focus and previews.
6. Develop the crew plan and inspect whether visible reference details appear
   in the bible before spending video-generation credits.
