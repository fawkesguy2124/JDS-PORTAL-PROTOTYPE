-- Client documents private (Jose, 22 Oct 2026): the "job-documents" bucket was
-- public, so anyone with a file's link could open it. The portal now opens files
-- with 1-hour private links (src/services/docFiles.js). Run this ONLY AFTER that
-- portal version is live, or View/Download on the live portal stop working.
-- Staff access stays as before (the existing "Authenticated users can view /
-- upload / delete documents" storage rules).
update storage.buckets set public = false where id = 'job-documents';
