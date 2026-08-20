-- Preview APKs from EAS are larger than 100MB (current ~125MB).
UPDATE storage.buckets
SET file_size_limit = 209715200
WHERE id = 'app-releases';
