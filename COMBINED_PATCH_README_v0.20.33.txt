Combined patch starting from v0.20.32 and including all later fixes through v0.20.33.

How to apply:
1. Take your project at base v0.20.31.
2. Copy these files over it with the same paths.
3. This produces the combined state equivalent to v0.20.33.

Included revisions:
- v0.20.32: dialogue/style audit, photo-routing cleanup, docs/voice cleanup, delete-candidates list.
- v0.20.33: photo-pipeline reliability fixes for worker + cloud-photo.

Final target version after applying this patch:
- ENGINE_VERSION=0.20.33
- SCHEMA_VERSION=4
