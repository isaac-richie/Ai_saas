-- Seed Cameras (Virtual User ID needs to be handled or these should be system/public assets? 
-- In our schema, cameras/lenses are linked to projects. 
-- For a "Global" gear list, we might need a system_assets table or just let users define them. 
-- However, for the purpose of this generic "Shot Builder" feeling like a tool, 
-- we will insert them as templates if we had a templates system, 
-- BUT re-reading the schema: cameras/lenses are project specific (project_id). 
-- This might be tedious for the user. 
-- ADJUSTMENT: For this task, I will creating a generic "System Project" or similar is complex.
-- BETTER APPROACH: I will just create a setup script that inserts them for the current project when a user initializes it, 
-- OR for the sake of this prompt, I will modify the schema or just assume the user will add them?
-- INITIAL PLAN SAID: "Populate cameras ... and lenses".
-- Let's stick to the schema. 
-- Actually, a better UX is having a "Default Gear List" available to all projects.
-- But given the current schema constraint (project_id), I will create a helper action to "Seed Project Gear" 
-- or I can just insert them for a specific user if I knew the ID.
-- SINCE I CANNOT KNOW PROJECT ID in a migration:
-- I will skip the migration for *data* that depends on dynamic project IDs.
-- INSTEAD, I will create a "System" set of gear in the UI code (constants) 
-- that can be 'selected' and then saved as a row in the DB if customized, 
-- OR I will create a 'presets' table.
-- Refine Plan: I will create a `constants/gear.ts` file with this data to populate the *dropdowns* 
-- and when saved, we only save the *names* or we insert them into the DB?
-- Schema says `shot` has `camera_id` and `lens_id`. 
-- So they MUST be in the DB.
-- Okay, I will create a migration that adds a `is_global` flag to cameras/lenses 
-- so they can be shared across projects, OR make project_id nullable for global assets.

-- Let's MODIFY SCHEMA to allow global gear.
ALTER TABLE cameras ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE lenses ALTER COLUMN project_id DROP NOT NULL;

-- NOW SEED GLOBAL GEAR
INSERT INTO cameras (name, sensor_size, lens_mount) VALUES
('Arri Alexa 35', 'Super 35', 'LPL'),
('Arri Alexa Mini LF', 'Large Format', 'LPL'),
('Sony Venice 2', 'Full Frame', 'E-mount/PL'),
('Red V-Raptor', 'VV', 'RF/PL'),
('Panavision Millennium DXL2', 'Large Format', 'PV 70');

INSERT INTO lenses (name, focal_length, aperture) VALUES
('Cooke S4/i 18mm', 18, 'T2.0'),
('Cooke S4/i 25mm', 25, 'T2.0'),
('Cooke S4/i 35mm', 35, 'T2.0'),
('Cooke S4/i 50mm', 50, 'T2.0'),
('Cooke S4/i 75mm', 75, 'T2.0'),
('Arri Master Prime 16mm', 16, 'T1.3'),
('Arri Master Prime 35mm', 35, 'T1.3'),
('Arri Master Prime 50mm', 50, 'T1.3'),
('Zeiss Supreme Prime 29mm', 29, 'T1.5'),
('Angenieux Optimo 24-290mm', 290, 'T2.8');

-- UPDATE RLS to allow reading global gear (where project_id is NULL)
DROP POLICY IF EXISTS "Users can manage cameras of own projects" ON cameras;
CREATE POLICY "Users can manage cameras of own projects" ON cameras FOR ALL 
  USING (project_id IS NULL OR EXISTS (SELECT 1 FROM projects WHERE projects.id = cameras.project_id AND projects.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users can manage lenses of own projects" ON lenses;
CREATE POLICY "Users can manage lenses of own projects" ON lenses FOR ALL 
  USING (project_id IS NULL OR EXISTS (SELECT 1 FROM projects WHERE projects.id = lenses.project_id AND projects.user_id = auth.uid()));
