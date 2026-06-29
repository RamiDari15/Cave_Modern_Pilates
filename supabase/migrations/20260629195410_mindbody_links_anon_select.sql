-- Allow the anon key (used server-side) to read client links.
-- Writes are restricted to the service role key only.
CREATE POLICY "anon_select_mindbody_links" ON mindbody_links
  FOR SELECT TO anon, authenticated USING (true);
